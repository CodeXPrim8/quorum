/** Server-only OpenAI Live helpers. The API key never leaves this process. */

export const LIVE_MODEL = 'gpt-realtime'

export const LIVE_INSTRUCTIONS = [
  'You are a voice pipe for Quorum.',
  'You never answer questions, never plan work, never pick which staff member should reply, and never invent company facts.',
  'DeepSeek and the existing Quorum agents do all reasoning, routing, and tools.',
  'Stay silent after the user speaks. Do not create a response on your own.',
  'When you are given words to speak, say those words only, in a natural spoken voice, with no preamble.',
].join(' ')

export function openaiKeyFromEnv(env: Record<string, string | undefined>): string {
  return (env.OPENAI_API_KEY ?? '').trim()
}

export function sessionCreateBody() {
  return {
    model: LIVE_MODEL,
    voice: 'coral',
    instructions: LIVE_INSTRUCTIONS,
    modalities: ['audio', 'text'],
    input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
    turn_detection: {
      type: 'server_vad',
      create_response: false,
      interrupt_response: true,
      silence_duration_ms: 700,
    },
  }
}

export function publicSessionPayload(raw: unknown): { clientSecret: string; model: string } {
  const data = raw as {
    client_secret?: { value?: string } | string
    model?: string
    value?: string
  }
  const secret =
    typeof data.client_secret === 'string'
      ? data.client_secret
      : data.client_secret?.value ?? data.value ?? ''
  if (!secret) throw new Error('OpenAI did not return a live session.')
  return { clientSecret: secret, model: data.model || LIVE_MODEL }
}

export function stripSecrets<T extends Record<string, unknown>>(payload: T, key: string): T {
  const blob = JSON.stringify(payload)
  if (key && blob.includes(key)) {
    throw new Error('Refusing to send the OpenAI API key to the browser.')
  }
  return payload
}
