import { LIVE_CALLS_URL, LIVE_INSTRUCTIONS, LIVE_MODEL, liveSessionConfig } from '../../server/openai-live'
import type { Staff } from '../types'
import { liveVoiceName, staffVoice, type VoiceKind } from './staff-voice'

export { liveVoiceName }

const TRANSCRIPT_DONE = new Set([
  'conversation.item.input_audio_transcription.completed',
  'conversation.item.input_audio_transcription.done',
])

export function transcriptFromEvent(event: unknown): string | null {
  const item = event as {
    type?: string
    transcript?: string | { text?: string }
    item?: { transcript?: string }
  }
  if (!item.type || !TRANSCRIPT_DONE.has(item.type)) return null
  const text =
    typeof item.transcript === 'string'
      ? item.transcript
      : item.transcript?.text ?? item.item?.transcript ?? ''
  return text.trim() || null
}

export function speakMessages(text: string, voice: string, kind: VoiceKind): object[] {
  const line = text.replace(/\s+/g, ' ').trim().slice(0, 420)
  const gender = kind === 'woman' ? 'female' : 'male'
  const spoken = `Speak respectfully in a ${gender} voice. Say this exactly and nothing else: ${line}`
  return [
    { type: 'response.cancel' },
    {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: `${LIVE_INSTRUCTIONS} Use a clear, respectful ${gender} voice. Say the following words exactly, then stop:\n${line}`,
        audio: { output: { voice } },
      },
    },
    {
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
        instructions: spoken,
      },
    },
  ]
}

export type LiveVoice = {
  ready: boolean
  setMuted: (muted: boolean) => void
  speak: (text: string, person: Pick<Staff, 'id' | 'name'>) => Promise<void>
  close: () => void
}

export async function liveStatus(): Promise<boolean> {
  try {
    const response = await fetch('/api/realtime/status')
    const data = (await response.json()) as { ready?: boolean }
    return Boolean(data.ready)
  } catch {
    return false
  }
}

/** WebRTC to OpenAI GPT Live. The browser receives only an ephemeral session, never OPENAI_API_KEY. */
export async function connectLiveVoice(input: {
  onTranscript: (text: string) => void
  onError: (message: string) => void
  audioElement?: HTMLAudioElement
}): Promise<LiveVoice | null> {
  const token = await fetch('/api/realtime/session', { method: 'POST' })
  if (token.status === 503) return null
  const session = (await token.json().catch(() => ({}))) as {
    clientSecret?: string
    model?: string
    realtimeUrl?: string
    error?: string
  }
  if (!token.ok || !session.clientSecret) return null

  const pc = new RTCPeerConnection()
  const audio = input.audioElement ?? new Audio()
  audio.autoplay = true
  pc.ontrack = (event) => {
    audio.srcObject = event.streams[0]
  }

  const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  const sender = pc.addTrack(mic.getTracks()[0], mic)
  const channel = pc.createDataChannel('oai-events')

  let speaking: { resolve: () => void } | null = null
  let sessionReady: { resolve: () => void } | null = null
  let currentVoice = ''
  const pending: object[] = []

  const send = (payload: object) => {
    if (channel.readyState === 'open') {
      channel.send(JSON.stringify(payload))
      return
    }
    pending.push(payload)
  }

  const drop = () => {
    speaking?.resolve()
    speaking = null
    channel.close()
    mic.getTracks().forEach((track) => track.stop())
    pc.close()
    audio.srcObject = null
  }

  channel.onopen = () => {
    send({
      type: 'session.update',
      session: liveSessionConfig(session.model || LIVE_MODEL),
    })
    for (const item of pending) channel.send(JSON.stringify(item))
    pending.length = 0
  }

  channel.onmessage = (event) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(event.data))
    } catch {
      return
    }
    const row = parsed as { type?: string; error?: { message?: string } }
    const transcript = transcriptFromEvent(parsed)
    if (transcript) input.onTranscript(transcript)
    if (row.type === 'session.updated' || row.type === 'session.created') {
      sessionReady?.resolve()
      sessionReady = null
    }
    if (row.type === 'response.done' || row.type === 'response.cancelled') {
      speaking?.resolve()
      speaking = null
    }
    if (row.type === 'error' && row.error?.message) input.onError(row.error.message)
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdp = await fetch(session.realtimeUrl || LIVE_CALLS_URL, {
    method: 'POST',
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${session.clientSecret}`,
      'Content-Type': 'application/sdp',
    },
  })
  if (!sdp.ok) {
    drop()
    return null
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() })

  return {
    ready: true,
    setMuted(muted) {
      if (sender.track) sender.track.enabled = !muted
      mic.getTracks().forEach((track) => {
        track.enabled = !muted
      })
    },
    async speak(text, person) {
      const line = text.replace(/\s+/g, ' ').trim()
      if (!line) return
      const voice = staffVoice(person)
      const messages = speakMessages(line, voice.live, voice.kind)
      if (voice.live !== currentVoice) {
        currentVoice = voice.live
        send(messages[0]!)
        send(messages[1]!)
        await new Promise<void>((resolve) => {
          sessionReady?.resolve()
          sessionReady = { resolve }
          window.setTimeout(resolve, 450)
        })
        send(messages[2]!)
      } else {
        send(messages[0]!)
        send(messages[2]!)
      }
      await new Promise<void>((resolve) => {
        speaking?.resolve()
        speaking = { resolve }
        window.setTimeout(() => {
          if (speaking) {
            speaking.resolve()
            speaking = null
          }
        }, 20_000)
      })
    },
    close() {
      drop()
    },
  }
}
