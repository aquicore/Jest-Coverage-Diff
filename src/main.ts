import * as core from '@actions/core'
import * as github from '@actions/github'
import axios from 'axios'
import {execSync} from 'child_process'
import fs from 'fs'
import {CoverageReport} from './Model/CoverageReport'
import {DiffChecker} from './DiffChecker'
import {Octokit} from '@octokit/core'
import {PaginateInterface} from '@octokit/plugin-paginate-rest'
import {RestEndpointMethods} from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types'

async function run(): Promise<void> {
  try {
    const repoName = github.context.repo.repo
    const repoOwner = github.context.repo.owner
    const commitSha = github.context.sha
    const githubToken = core.getInput('accessToken')
    const fullCoverage = JSON.parse(core.getInput('fullCoverageDiff'))
    const commandToRun = core.getInput('runCommand')
    const commandAfterSwitch = core.getInput('afterSwitchCommand')
    const delta = Number(core.getInput('delta'))
    const githubClient = github.getOctokit(githubToken)
    const prNumber = github.context.issue.number
    const branchNameBase = github.context.payload.pull_request?.base.ref
    const branchNameHead = github.context.payload.pull_request?.head.ref
    const useSameComment = JSON.parse(core.getInput('useSameComment'))
    const commentIdentifier = `<!-- codeCoverageDiffComment -->`
    const deltaCommentIdentifier = `<!-- codeCoverageDeltaComment -->`
    let commentId = null
    execSync(commandToRun)
    const codeCoverageNew = <CoverageReport>(
      JSON.parse(fs.readFileSync('coverage-summary.json').toString())
    )
    execSync('/usr/bin/git fetch')
    execSync('/usr/bin/git stash')
    execSync(`/usr/bin/git checkout --progress --force ${branchNameBase}`)
    if (commandAfterSwitch) {
      execSync(commandAfterSwitch)
    }
    execSync(commandToRun)
    const codeCoverageOld = <CoverageReport>(
      JSON.parse(fs.readFileSync('coverage-summary.json').toString())
    )
    const currentDirectory = execSync('pwd')
      .toString()
      .trim()
    const diffChecker: DiffChecker = new DiffChecker(
      codeCoverageNew,
      codeCoverageOld
    )
    let messageToPost = `## Test coverage results :test_tube: \n
    Code coverage diff between base branch:${branchNameBase} and head branch: ${branchNameHead} \n\n`
    const coverageDetails = diffChecker.getCoverageDetails(
      !fullCoverage,
      `${currentDirectory}/`,
      delta
    )
    if (coverageDetails.length === 0) {
      messageToPost =
        'No changes to code coverage between the base branch and the head branch'
    } else {
      messageToPost +=
        'Status | File | % Stmts | % Branch | % Funcs | % Lines \n -----|-----|---------|----------|---------|------ \n'
      messageToPost += coverageDetails.join('\n')
    }
    messageToPost = `${commentIdentifier}\nCommit SHA:${commitSha}\n${messageToPost}`
    if (useSameComment) {
      commentId = await findComment(
        githubClient,
        repoName,
        repoOwner,
        prNumber,
        commentIdentifier
      )
    }
    await createOrUpdateComment(
      commentId,
      githubClient,
      repoOwner,
      repoName,
      messageToPost,
      prNumber
    )

    if (diffChecker.checkIfTestCoverageFallsBelowTotalFunctionalDelta(delta)) {
      if (useSameComment) {
        commentId = await findComment(
          githubClient,
          repoName,
          repoOwner,
          prNumber,
          deltaCommentIdentifier
        )
      }
      messageToPost = `Current PR reduces the test coverage percentage by ${delta} for total functional coverage!`
      messageToPost = `${deltaCommentIdentifier}\nCommit SHA:${commitSha}\n${messageToPost}`
      await createOrUpdateComment(
        commentId,
        githubClient,
        repoOwner,
        repoName,
        messageToPost,
        prNumber
      )
      throw Error(messageToPost)
    }

    if (!diffChecker.checkIfTestCoverageFallsBelowDelta(delta)) {
      const gif = await getGiphyGifForTag('happy dog')
      const imageUrl =
        gif?.images?.fixed_height?.url ??
        'https://media4.giphy.com/media/3ndAvMC5LFPNMCzq7m/200.gif'
      if (useSameComment) {
        commentId = await findComment(
          githubClient,
          repoName,
          repoOwner,
          prNumber,
          deltaCommentIdentifier
        )
      }
      messageToPost = `Wow! Such test coverage! Much excite!\n![](${imageUrl})\n\nPowered By GIPHY`
      await createOrUpdateComment(
        commentId,
        githubClient,
        repoOwner,
        repoName,
        messageToPost,
        prNumber
      )
    }
  } catch (error) {
    core.setFailed(error)
  }
}

async function createOrUpdateComment(
  commentId: number | null,
  githubClient: {[x: string]: any} & {[x: string]: any} & Octokit &
    RestEndpointMethods & {paginate: PaginateInterface},
  repoOwner: string,
  repoName: string,
  messageToPost: string,
  prNumber: number
) {
  if (commentId) {
    await githubClient.issues.updateComment({
      owner: repoOwner,
      repo: repoName,
      comment_id: commentId,
      body: messageToPost
    })
  } else {
    await githubClient.issues.createComment({
      repo: repoName,
      owner: repoOwner,
      body: messageToPost,
      issue_number: prNumber
    })
  }
}

async function findComment(
  githubClient: {[x: string]: any} & {[x: string]: any} & Octokit &
    RestEndpointMethods & {paginate: PaginateInterface},
  repoName: string,
  repoOwner: string,
  prNumber: number,
  identifier: string
): Promise<number> {
  const comments = await githubClient.issues.listComments({
    owner: repoOwner,
    repo: repoName,
    issue_number: prNumber
  })

  for (const comment of comments.data) {
    if (comment.body.startsWith(identifier)) {
      return comment.id
    }
  }
  return 0
}

export const getGiphyGifForTag = async (giphyTag: string) => {
  if (!process.env.GIPHY_API_KEY) {
    console.warn('GIPHY_API_KEY is not set')
  }
  return axios
    .get('https://api.giphy.com/v1/gifs/random', {
      params: {
        tag: giphyTag,
        fmt: 'json',
        api_key: process.env.GIPHY_API_KEY ?? 'not-set'
      }
    })
    .then(giphyRes => giphyRes.data.data)
    .catch(err => {
      console.warn('Axios call failed with error: ', err)
    })
}

run()
