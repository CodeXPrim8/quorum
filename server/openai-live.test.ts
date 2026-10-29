import { describe, expect, it } from 'vitest'
import { LIVE_INSTRUCTIONS, openaiKeyFromEnv, publicSessionPayload, sessionCreateBody, stripSecrets } from './openai-live'

describe('OpenAI Live stays a voice pipe', () => {
  it('reads the API key only from server env names that are not VITE_', () => {
    expect(openaiKeyFromEnv({ OPENAI_API_KEY: ' sk-live ', VITE_OPENAI_API_KEY: 'sk-browser' })).toBe('sk-live')
    expect(openaiKeyFromEnv({ VITE_OPENAI_API_KEY: 'sk-browser' })).toBe('')
  })

  it('tells the live model not to route or answer for DeepSeek', () => {
    expect(LIVE_INSTRUCTIONS).toMatch(/DeepSeek/)
    expect(LIVE_INSTRUCTIONS.toLowerCase()).toMatch(/never answer/)
    expect(LIVE_INSTRUCTIONS.toLowerCase()).toMatch(/stay silent/)
    expect(sessionCreateBody().turn_detection.create_response).toBe(false)
  })

  it('hands the browser only an ephemeral session, never the API key', () => {
    const payload = publicSessionPayload({
      client_secret: { value: 'ek_test_session' },
      model: 'gpt-realtime',
    })
    expect(payload).toEqual({ clientSecret: 'ek_test_session', model: 'gpt-realtime' })
    expect(() => stripSecrets({ clientSecret: 'ek_test', apiKey: 'sk-secret' }, 'sk-secret')).toThrow(/API key/)
  })
})
