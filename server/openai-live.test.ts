import { describe, expect, it } from 'vitest'
import {
  LIVE_INSTRUCTIONS,
  LIVE_MODEL,
  openaiKeyFromEnv,
  publicSessionPayload,
  sessionCreateBody,
  stripSecrets,
} from './openai-live'

describe('OpenAI Live stays a voice pipe', () => {
  it('reads the API key only from server env names that are not VITE_', () => {
    expect(openaiKeyFromEnv({ OPENAI_API_KEY: ' sk-live ', VITE_OPENAI_API_KEY: 'sk-browser' })).toBe('sk-live')
    expect(openaiKeyFromEnv({ VITE_OPENAI_API_KEY: 'sk-browser' })).toBe('')
  })

  it('tells the live model not to route or answer for DeepSeek', () => {
    expect(LIVE_INSTRUCTIONS).toMatch(/DeepSeek/)
    expect(LIVE_INSTRUCTIONS.toLowerCase()).toMatch(/never answer/)
    expect(LIVE_INSTRUCTIONS.toLowerCase()).toMatch(/stay silent/)
    const body = sessionCreateBody()
    expect(body.session.type).toBe('realtime')
    expect(body.session.model).toBe(LIVE_MODEL)
    expect(body.session.audio.input.turn_detection.create_response).toBe(false)
  })

  it('hands the browser only an ephemeral session, never the API key', () => {
    const payload = publicSessionPayload({
      value: 'ek_test_session',
      session: { model: 'gpt-realtime-2.1' },
    })
    expect(payload).toEqual({ clientSecret: 'ek_test_session', model: 'gpt-realtime-2.1' })
    expect(publicSessionPayload({ client_secret: { value: 'ek_legacy' }, model: 'gpt-realtime' })).toEqual({
      clientSecret: 'ek_legacy',
      model: 'gpt-realtime',
    })
    expect(() => stripSecrets({ clientSecret: 'ek_test', apiKey: 'sk-secret' }, 'sk-secret')).toThrow(/API key/)
  })
})
