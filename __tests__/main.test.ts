import axios from 'axios'
import {getGiphyGifForTag} from '../src/main'

jest.mock('axios')

describe('main', () => {
  describe('getGiphyGifForTag()', () => {
    it('calls axios with the correct params', async () => {
      const getSpy = jest
        .spyOn(axios, 'get')
        .mockResolvedValue({
          data: {
            data: {images: {fixed_height: {url: 'https://giphy.com/gif/123'}}}
          }
        })
      const tag = 'test ing'
      await getGiphyGifForTag(tag)
      expect(getSpy).toHaveBeenCalledWith(
        'https://api.giphy.com/v1/gifs/random',
        {
          params: {
            api_key: process.env.GIPHY_API_KEY ?? 'not-set',
            fmt: 'json',
            rating: 'g',
            tag: tag
          }
        }
      )
    })
  })
})
