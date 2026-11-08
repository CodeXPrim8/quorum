import { describe, expect, it } from 'vitest'
import { canHostMedia, instagramEnv, instagramReady, parseImageDataUrl } from './instagram'

describe('instagram bridge', () => {
  it('needs a token and a business account before it is ready', () => {
    expect(instagramReady(instagramEnv({}))).toBe(false)
    expect(
      instagramReady(
        instagramEnv({
          INSTAGRAM_TOKEN: 'token',
          INSTAGRAM_BUSINESS_ACCOUNT_ID: '17841400000000000',
        }),
      ),
    ).toBe(true)
  })

  it('only hosts media on a public https base', () => {
    expect(canHostMedia(instagramEnv({ INSTAGRAM_PUBLIC_BASE: 'http://localhost:5173' }))).toBe(false)
    expect(canHostMedia(instagramEnv({ INSTAGRAM_PUBLIC_BASE: 'https://abc.ngrok-free.app/' }))).toBe(true)
  })

  it('reads a JPEG data URL', () => {
    const payload = Buffer.alloc(120, 1).toString('base64')
    const parsed = parseImageDataUrl(`data:image/jpeg;base64,${payload}`)
    expect(parsed?.mime).toBe('image/jpeg')
    expect(parsed?.bytes.length).toBe(120)
    expect(parseImageDataUrl('data:text/plain;base64,YQ==')).toBeNull()
  })
})
