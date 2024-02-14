/* eslint-disable no-console */
import {CoverageReport} from './Model/CoverageReport'
import {DiffCoverageReport} from './Model/DiffCoverageReport'
import {CoverageData} from './Model/CoverageData'
import {DiffFileCoverageData} from './Model/DiffFileCoverageData'
import {DiffCoverageData} from './Model/DiffCoverageData'
import {FileCoverageData} from './Model/FileCoverageData'

const increasedCoverageIcon = ':green_circle::dog:'
const decreasedCoverageIcon = ':red_circle:'
const newCoverageIcon = ':sparkles: :new:'
const removedCoverageIcon = ':x:'

export class DiffChecker {
  private diffCoverageReport: DiffCoverageReport = {}
  constructor(
    coverageReportNew: CoverageReport,
    coverageReportOld: CoverageReport
  ) {
    const reportNewKeys = Object.keys(coverageReportNew)
    const reportOldKeys = Object.keys(coverageReportOld)
    const reportKeys = new Set([...reportNewKeys, ...reportOldKeys])

    const temporaryReport = JSON.parse(JSON.stringify(coverageReportOld))
    for (const filePath of reportNewKeys) {
      if (filePath === 'total') continue
      temporaryReport[filePath] = coverageReportNew[filePath]
    }
    const total: {[index: string]: any} = {
      lines: {total: 0, covered: 0, skipped: 0, pct: 0},
      statements: {total: 0, covered: 0, skipped: 0, pct: 0},
      functions: {total: 0, covered: 0, skipped: 0, pct: 0},
      branches: {total: 0, covered: 0, skipped: 0, pct: 0}
    }
    for (const key in temporaryReport) {
      if (key === 'total') continue
      const item = temporaryReport[key]
      for (const metricType in item) {
        const metric = item[metricType]
        total[metricType]['total'] += Number(metric.total)
        total[metricType]['covered'] += Number(metric.covered)
        total[metricType]['skipped'] += Number(metric.skipped)
      }
    }

    for (const metricType in total) {
      const metric = total[metricType]
      const relation = metric.covered / metric.total
      const matchResult = (relation * 100)
        .toString()
        .match(/^-?\d+(?:\.\d{0,2})?/)

      const result = matchResult ? matchResult[0] : ''

      metric.pct = +result
    }

    coverageReportNew.total = <FileCoverageData>total

    for (const filePath of reportKeys) {
      if (reportNewKeys.includes(filePath)) {
        console.log(`_________ ${filePath} _________`)
        console.log(`>> Old Report: <<'`, coverageReportOld[filePath])
        console.log(`>>> New Report: <<<'`, coverageReportNew[filePath])
        this.diffCoverageReport[filePath] = {
          branches: {
            newPct: this.getPercentage(coverageReportNew[filePath]?.branches),
            oldPct: this.getPercentage(coverageReportOld[filePath]?.branches)
          },
          statements: {
            newPct: this.getPercentage(coverageReportNew[filePath]?.statements),
            oldPct: this.getPercentage(coverageReportOld[filePath]?.statements)
          },
          lines: {
            newPct: this.getPercentage(coverageReportNew[filePath]?.lines),
            oldPct: this.getPercentage(coverageReportOld[filePath]?.lines)
          },
          functions: {
            newPct: this.getPercentage(coverageReportNew[filePath]?.functions),
            oldPct: this.getPercentage(coverageReportOld[filePath]?.functions),
            newCovered: coverageReportNew[filePath]?.functions.covered,
            oldCovered: coverageReportOld[filePath]?.functions.covered
          }
        }

        console.log(`-- DIF: --`, this.diffCoverageReport[filePath])
      }
    }
  }

  getCoverageDetails(
    diffOnly: boolean,
    currentDirectory: string,
    delta = 1
  ): string[] {
    const keys = Object.keys(this.diffCoverageReport)
    const returnStrings: string[] = []
    for (const key of keys) {
      if (this.compareCoverageValues(this.diffCoverageReport[key]) !== 0) {
        returnStrings.push(
          this.createDiffLine(
            key.replace(currentDirectory, ''),
            this.diffCoverageReport[key],
            delta
          )
        )
      } else {
        if (!diffOnly) {
          returnStrings.push(
            `${key.replace(currentDirectory, '')} | ${
              this.diffCoverageReport[key].statements.newPct
            } | ${this.diffCoverageReport[key].branches.newPct} | ${
              this.diffCoverageReport[key].functions.newPct
            } | ${this.diffCoverageReport[key].lines.newPct}`
          )
        }
      }
    }
    return returnStrings
  }

  checkIfTestCoverageFallsBelowTotalFunctionalDelta(delta: number): boolean {
    const {total} = this.diffCoverageReport
    const funcPercentageDiff = this.getPercentageDiff(total.functions)
    return (
      total &&
      total.functions.oldPct !== total.functions.newPct &&
      funcPercentageDiff < 0 &&
      Math.abs(funcPercentageDiff) >= delta
    )
  }

  checkIfTestCoverageFallsBelowDelta(delta: number): boolean {
    const changedFiles = Object.keys(this.diffCoverageReport)
    for (const fileName of changedFiles) {
      const diffCoverageData = this.diffCoverageReport[fileName]
      const keys: ('lines' | 'statements' | 'branches' | 'functions')[] = <
        ('lines' | 'statements' | 'branches' | 'functions')[]
      >Object.keys(diffCoverageData)
      // No new coverage found so that means we deleted a file coverage
      const fileRemovedCoverage = Object.values(diffCoverageData).every(
        coverageData => coverageData.newPct === 0
      )
      if (fileRemovedCoverage) {
        // since the file is deleted don't include in delta calculation
        continue
      }
      for (const key of keys) {
        if (diffCoverageData[key].oldPct !== diffCoverageData[key].newPct) {
          const percentageDiff = this.getPercentageDiff(diffCoverageData[key])
          if (percentageDiff < 0 && Math.abs(percentageDiff) >= delta) {
            return true
          }
        }
      }
    }

    return false
  }

  private createDiffLine(
    name: string,
    diffFileCoverageData: DiffFileCoverageData,
    delta: number
  ): string {
    // No old coverage found so that means we added a new file coverage
    const fileNewCoverage = Object.values(diffFileCoverageData).every(
      coverageData => coverageData.oldPct === 0
    )
    // No new coverage found so that means we deleted a file coverage
    const fileRemovedCoverage = Object.values(diffFileCoverageData).every(
      coverageData => coverageData.newPct === 0
    )
    if (fileNewCoverage) {
      return ` ${newCoverageIcon} | **${name}** | **${diffFileCoverageData.statements.newPct}** | **${diffFileCoverageData.branches.newPct}** | **${diffFileCoverageData.functions.newPct}** | **${diffFileCoverageData.lines.newPct}**`
    } else if (fileRemovedCoverage) {
      return ` ${removedCoverageIcon} | ~~${name}~~ | ~~${diffFileCoverageData.statements.oldPct}~~ | ~~${diffFileCoverageData.branches.oldPct}~~ | ~~${diffFileCoverageData.functions.oldPct}~~ | ~~${diffFileCoverageData.lines.oldPct}~~`
    }
    // Coverage existed before so calculate the diff status
    const statusIcon = this.getStatusIcon(diffFileCoverageData, delta)
    return ` ${statusIcon} | ${name} | ${
      diffFileCoverageData.statements.newPct
    } **(${this.getPercentageDiff(diffFileCoverageData.statements)})** | ${
      diffFileCoverageData.branches.newPct
    } **(${this.getPercentageDiff(diffFileCoverageData.branches)})** | ${
      diffFileCoverageData.functions.newPct
    } **(${this.getPercentageDiff(diffFileCoverageData.functions)})** | ${
      diffFileCoverageData.lines.newPct
    } **(${this.getPercentageDiff(diffFileCoverageData.lines)})**`
  }

  private compareCoverageValues(
    diffCoverageData: DiffFileCoverageData
  ): number {
    const keys: ('lines' | 'statements' | 'branches' | 'functions')[] = <
      ('lines' | 'statements' | 'branches' | 'functions')[]
    >Object.keys(diffCoverageData)
    for (const key of keys) {
      if (diffCoverageData[key].oldPct !== diffCoverageData[key].newPct) {
        return 1
      }
    }
    return 0
  }

  private getPercentage(coverageData: CoverageData): number {
    return coverageData?.pct || 0
  }

  private getStatusIcon(
    diffFileCoverageData: DiffFileCoverageData,
    delta: number
  ): ':green_circle::dog:' | ':red_circle:' {
    let cellsOverDelta = 0
    Object.values(diffFileCoverageData).forEach(coverageData => {
      if (-this.getPercentageDiff(coverageData) > delta) {
        cellsOverDelta++
      }
    })
    return cellsOverDelta > 0 ? decreasedCoverageIcon : increasedCoverageIcon
  }

  private getPercentageDiff(diffData: DiffCoverageData): number {
    // get diff
    const diff = Number(diffData.newPct) - Number(diffData.oldPct)
    // round off the diff to 2 decimal places
    return Math.round((diff + Number.EPSILON) * 100) / 100
  }
}
