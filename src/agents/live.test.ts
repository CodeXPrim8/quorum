import { describe, expect, it } from 'vitest'
import { LIVE_INSTRUCTIONS } from '../../server/openai-live'
import { liveVoiceName, speakMessages, transcriptFromEvent } from './live'

describe('live voice events', () => {
  it('pulls a finished transcript and ignores other events', () => {
    expect(
      transcriptFromEvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: '  Priya, status  ' }),
    ).toBe('Priya, status')
    expect(transcriptFromEvent({ type: 'response.audio.delta', delta: 'abc' })).toBeNull()
  })

  it('asks OpenAI only to speak words, never to choose an agent', () => {
    const messages = speakMessages('I am on the quote.', 'coral', 'woman')
    const blob = JSON.stringify(messages)
    expect(blob).toMatch(/Say this exactly/)
    expect(blob).not.toMatch(/Managing Director|staff_priya|Sales Manager/)
    expect(liveVoiceName('woman', 0)).toBe('coral')
    expect(liveVoiceName('man', 0)).toBe('ash')
    expect(LIVE_INSTRUCTIONS).toMatch(/existing Quorum agents/)
  })
})
