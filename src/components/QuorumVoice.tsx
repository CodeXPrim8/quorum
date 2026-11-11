import { useEffect, useRef, useState } from 'react'
import { connectLiveVoice, type LiveVoice } from '../agents/live'
import { canListen, holdMicrophone, releaseMicrophone, speakAs, startListening, stopSpeaking } from '../agents/speak'
import { QUORUM_SPEAKER } from '../agents/staff-voice'
import { allowQuorumDesktop } from '../agents/desktop'
import type { AppState, Command } from '../types'

export function QuorumVoice({
  threadId,
  state,
  dispatch,
  onClose,
}: {
  threadId: string
  state: AppState
  dispatch: (command: Command) => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<'listening' | 'thinking' | 'speaking'>('speaking')
  const [live, setLive] = useState('')
  const [muted, setMuted] = useState(false)
  const [note, setNote] = useState(canListen() ? '' : 'Allow the microphone to talk.')
  const [seconds, setSeconds] = useState(0)
  const [pipe, setPipe] = useState<'live' | 'local' | 'off'>('off')
  const [deskBusy, setDeskBusy] = useState(false)
  const [deskError, setDeskError] = useState('')
  const stateRef = useRef(state)
  const busy = useRef(false)
  const alive = useRef(true)
  const liveRef = useRef<LiveVoice | null>(null)
  const mic = useRef<{ stop: () => void } | null>(null)
  const hush = useRef(0)
  const lastHeard = useRef('')
  const seen = useRef(new Set(state.chat.filter((message) => message.threadId === threadId).map((message) => message.id)))
  stateRef.current = state
  const ask = state.quorumAsk
  const talk = state.chat.filter((message) => message.threadId === threadId)

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const say = async (text: string) => {
    if (!alive.current) return
    setPhase('speaking')
    const voice = liveRef.current
    if (voice?.ready) {
      await voice.speak(text, QUORUM_SPEAKER)
      return
    }
    await speakAs(text, QUORUM_SPEAKER)
  }

  useEffect(() => {
    liveRef.current?.setMuted(muted)
    if (pipe === 'live' || muted || phase !== 'listening') {
      mic.current?.stop()
      mic.current = null
      return
    }
    mic.current = startListening(
      (text, final) => {
        if (!text || busy.current) return
        setLive(text)
        window.clearTimeout(hush.current)
        if (final) {
          take(text)
          return
        }
        hush.current = window.setTimeout(() => take(text), 900)
      },
      (message) => setNote(message),
      () => alive.current && !busy.current && !muted,
      () => setNote(''),
    )
    return () => {
      window.clearTimeout(hush.current)
      mic.current?.stop()
      mic.current = null
    }
  }, [muted, phase, pipe])

  useEffect(() => {
    const fresh = talk.filter((message) => message.authorId === 'quorum' && !seen.current.has(message.id))
    if (fresh.length === 0) return
    for (const message of fresh) seen.current.add(message.id)
    const last = fresh.at(-1)
    if (!last) return
    busy.current = true
    void (async () => {
      await say(last.text)
      busy.current = false
      lastHeard.current = ''
      if (alive.current) {
        setPhase('listening')
        setLive('')
      }
    })()
  }, [talk])

  const take = (text: string) => {
    const line = text.trim()
    if (!line || busy.current || line === lastHeard.current) return
    lastHeard.current = line
    busy.current = true
    window.clearTimeout(hush.current)
    setLive(line)
    setPhase('thinking')
    dispatch({ type: 'SEND_MESSAGE', threadId, text: line, wake: false })
  }

  useEffect(() => {
    alive.current = true
    void (async () => {
      busy.current = true
      await holdMicrophone()
      let voice = null as Awaited<ReturnType<typeof connectLiveVoice>>
      try {
        voice = await connectLiveVoice({
          onTranscript: (text) => take(text),
          onError: (message) => {
            if (!canListen()) setNote(message)
          },
        })
      } catch {
        voice = null
      }
      if (!alive.current) {
        voice?.close()
        return
      }
      liveRef.current = voice
      setPipe(voice ? 'live' : 'local')
      if (!voice) setNote(canListen() ? '' : 'Allow the microphone to talk.')
      try {
        await say("Hi. I'm Quorum. What would you like to work on?")
      } catch {
        /* spoken fallback already resolves; keep the call open */
      }
      if (!alive.current) return
      await wait(400)
      if (alive.current) {
        busy.current = false
        setPhase('listening')
      }
    })()
    return () => {
      window.clearTimeout(hush.current)
      mic.current?.stop()
      liveRef.current?.close()
      liveRef.current = null
      stopSpeaking()
      alive.current = false
      releaseMicrophone()
    }
  }, [])

  const end = () => {
    mic.current?.stop()
    alive.current = false
    liveRef.current?.close()
    liveRef.current = null
    stopSpeaking()
    releaseMicrophone()
    onClose()
  }

  const allowDesktop = async () => {
    setDeskBusy(true)
    setDeskError('')
    try {
      await allowQuorumDesktop(dispatch, state.desktop)
    } catch (error) {
      setDeskError(error instanceof Error ? error.message : 'Desktop access could not start.')
    } finally {
      setDeskBusy(false)
    }
  }

  const label = phase === 'speaking' ? 'Quorum is speaking' : phase === 'thinking' ? 'One moment' : muted ? 'Muted' : 'Listening'

  return (
    <div className="call quorum-call" role="dialog" aria-label="Voice chat with Quorum">
      <header className="call-top">
        <p>{clock(seconds)}</p>
        <strong>Quorom Si</strong>
        <span>{label}</span>
      </header>
      <div className="quorum-call-stage">
        <div className={phase === 'speaking' ? 'orb is-talking' : 'orb'} aria-hidden="true" />
      </div>
      {live && <p className="call-live">{live}</p>}
      {note && <p className="call-note">{note}</p>}
      {ask?.status === 'pending' && (
        <div className="quorum-ask is-call">
          <p>Quorum is asking to use this computer.</p>
          <p className="fine">{ask.reason}</p>
          {deskError && <p className="fine">{deskError}</p>}
          {!state.desktop.agentConnected && <p className="fine">The desktop agent is offline on this computer.</p>}
          <div className="button-row">
            <button type="button" className="btn btn-primary" disabled={deskBusy || !state.desktop.agentConnected} onClick={() => void allowDesktop()}>
              Allow
            </button>
            <button type="button" className="btn" disabled={deskBusy} onClick={() => dispatch({ type: 'DECIDE_QUORUM_DESKTOP', decision: 'declined' })}>
              Not now
            </button>
          </div>
        </div>
      )}
      <div className="call-bar">
        <button type="button" className={muted ? 'is-muted' : ''} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((value) => !value)}>
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button type="button" className="call-end" aria-label="End" onClick={end}>
          <EndIcon />
        </button>
      </div>
    </div>
  )
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function clock(total: number): string {
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function Mic() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" />
    </svg>
  )
}

function MicOff() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4.7 18.3 19l1.2-1.2L5.2 3.5 4 4.7ZM9 6v.2L15 12.2V6a3 3 0 0 0-6 0Zm3 9a3 3 0 0 1-3-3H7a5 5 0 0 0 4 4.9V21h2v-4.1a5 5 0 0 0 2.2-1.1l-1.5-1.5A3 3 0 0 1 12 15Z" />
    </svg>
  )
}

function EndIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.6 9.2c3.4-2.2 7.4-2.2 10.8 0l.8.5a1.6 1.6 0 0 1 .6 2.1l-.7 1.4a1.4 1.4 0 0 1-1.6.7l-2.2-.5a1.2 1.2 0 0 1-.9-1.1l-.1-1.2a8 8 0 0 0-3.6 0l-.1 1.2c0 .5-.4 1-.9 1.1l-2.2.5a1.4 1.4 0 0 1-1.6-.7l-.7-1.4a1.6 1.6 0 0 1 .6-2.1l.8-.5Z" />
    </svg>
  )
}
