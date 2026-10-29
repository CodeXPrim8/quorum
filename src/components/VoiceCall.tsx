import { useEffect, useRef, useState } from 'react'
import { sceneOpening } from '../domain/call-scene'
import { minutesTaker, ownerHonorific, seniorOnCall } from '../domain/meeting'
import { minutesDocument, type MinuteLine } from '../domain/minutes'
import { minutesPdf, pdfDataUrl } from '../lib/pdf'
import { answerAs } from '../agents/answer'
import { isDesigner } from '../agents/local'
import { connectLiveVoice, type LiveVoice } from '../agents/live'
import { pickSpeakers } from '../agents/route-spoken'
import { canListen, releaseMicrophone, speakAs, startListening, stopSpeaking } from '../agents/speak'
import { Face } from './Face'
import type { AppState, Command, Staff } from '../types'

const CALL_LINKS = [
  ['overview', 'Overview'],
  ['office', 'Office'],
  ['chat', 'Chat'],
  ['tasks', 'Tasks'],
  ['people', 'People'],
  ['approvals', 'Approvals'],
] as const

export function VoiceCall({
  people,
  threadId,
  state,
  dispatch,
  docked,
  onClose,
  onViewOffice,
  onNavigate,
  onExpand,
}: {
  people: Staff[]
  threadId: string
  state: AppState
  dispatch: (command: Command) => void
  docked?: boolean
  onClose: () => void
  onViewOffice?: () => void
  onNavigate?: (view: string) => void
  onExpand?: () => void
}) {
  const [phase, setPhase] = useState<'listening' | 'thinking' | 'speaking'>('speaking')
  const [speakerId, setSpeakerId] = useState(people[0]?.id ?? '')
  const [live, setLive] = useState('')
  const [muted, setMuted] = useState(false)
  const [note, setNote] = useState(canListen() ? '' : 'Allow the microphone to talk on this call.')
  const [clerkId, setClerkId] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [pipe, setPipe] = useState<'live' | 'local' | 'off'>('off')
  const peopleRef = useRef(people)
  const stateRef = useRef(state)
  const busy = useRef(false)
  const alive = useRef(true)
  const liveRef = useRef<LiveVoice | null>(null)
  const mic = useRef<{ stop: () => void } | null>(null)
  const hush = useRef(0)
  const lastHeard = useRef('')
  const notes = useRef<MinuteLine[]>([])
  const clerkRef = useRef<Staff | null>(null)
  const hostRef = useRef<Staff | null>(null)
  const filed = useRef(false)
  const callHistory = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  peopleRef.current = people
  stateRef.current = state

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'E',location:'VoiceCall.tsx:listenEffect',message:'listen effect',data:{phase,muted,busy:busy.current,alive:alive.current,people:people.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    liveRef.current?.setMuted(muted)
    if (pipe === 'live' || muted || phase !== 'listening') {
      mic.current?.stop()
      mic.current = null
      return
    }
    mic.current = startListening(
      (text, final) => {
        // #region agent log
        fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'C',location:'VoiceCall.tsx:onText',message:'speech callback',data:{chars:text.length,final,busy:busy.current,phase},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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

  const say = async (person: Staff, text: string) => {
    setSpeakerId(person.id)
    setPhase('speaking')
    const live = liveRef.current
    if (live?.ready) {
      await live.speak(text, person)
      return
    }
    await speakAs(text, person)
  }

  const remember = (authorId: string, authorName: string, text: string) => {
    const line = text.trim()
    if (!line) return
    notes.current.push({ authorId, authorName, text: line })
    callHistory.current.push({
      role: authorId === 'owner' ? 'user' : 'assistant',
      content: `${authorName}: ${line}`,
    })
  }

  const fileMinutes = async () => {
    if (filed.current) return
    filed.current = true
    const clerk = clerkRef.current
    const host = hostRef.current
    const roster = peopleRef.current
    if (!clerk || !host || roster.length < 2) return
    const company = stateRef.current.company
    const thread = stateRef.current.threads.find((item) => item.id === threadId)
    const body = minutesDocument({
      company: company?.name ?? 'the company',
      thread: thread?.name ?? 'Group call',
      chair: host.name,
      clerk: clerk.name,
      owner: company?.ownerName ?? 'the owner',
      attendees: [company?.ownerName ?? 'You', ...roster.map((person) => person.name)],
      at: new Date(),
      lines: notes.current,
    })
    const fileName = `minutes-${thread?.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'meeting'}.pdf`
    const file = { name: fileName, mime: 'application/pdf', dataUrl: pdfDataUrl(minutesPdf('Meeting minutes', body)) }
    const honorific = ownerHonorific(company?.ownerGender)
    const closing = honorific ? `I'll send the minutes to the group chat, ${honorific}.` : `I'll send the minutes to the group chat.`
    if (alive.current) await say(clerk, closing)
    dispatch({
      type: 'POST_MINUTES',
      threadId,
      staffId: clerk.id,
      text: 'Meeting minutes are in this PDF. Nothing was emailed.',
      file,
    })
  }

  const take = (text: string) => {
    const line = text.trim()
    if (!line || busy.current || line === lastHeard.current) return
    lastHeard.current = line
    void hear(line)
  }

  const hear = async (text: string) => {
    if (!alive.current || busy.current) return
    const line = text.trim()
    if (!line) return
    busy.current = true
    window.clearTimeout(hush.current)
    setLive(line)
    setPhase('thinking')
    const owner = stateRef.current.company?.ownerName ?? 'You'
    remember('owner', owner, line)
    const roster = peopleRef.current
    const clerk = clerkRef.current
    const speakers = pickSpeakers(line, roster, stateRef.current, clerk, hostRef.current ?? seniorOnCall(roster, stateRef.current))
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'D',location:'VoiceCall.tsx:hear',message:'hear started',data:{chars:line.length,speakers:speakers.map((p)=>p.id),roster:roster.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const history = callHistory.current.slice(-8)
    for (const person of speakers) {
      if (!alive.current) break
      const task = stateRef.current.tasks.find((item) => item.assigneeId === person.id && item.status !== 'done')
      const asClerk = clerk?.id === person.id
      const reply = await answerAs({
        state: stateRef.current,
        person,
        prompt: asClerk
          ? `${line}\nYou are taking the minutes of this live call. You can answer, and you keep listening.`
          : line,
        history,
        intent: isDesigner(person, stateRef.current.roles) && /design|graphic|poster|logo/i.test(line) ? 'design' : 'reply',
        taskTitle: task?.title,
        spoken: true,
      })
      if (!alive.current || !reply.text) continue
      remember(person.id, person.name, reply.text)
      await say(person, reply.text)
    }
    busy.current = false
    lastHeard.current = ''
    if (alive.current) {
      await wait(700)
      setPhase('listening')
      setLive('')
    }
  }

  useEffect(() => {
    alive.current = true
    const roster = peopleRef.current
    const host = seniorOnCall(roster, stateRef.current) ?? roster[0]
    void (async () => {
      const live = await connectLiveVoice({
        onTranscript: (text) => take(text),
        onError: (message) => setNote(message),
      })
      if (!alive.current) {
        live?.close()
        return
      }
      liveRef.current = live
      setPipe(live ? 'live' : 'local')
      if (!live) setNote((current) => current || (canListen() ? '' : 'Allow the microphone to talk on this call.'))
      if (host) {
        const group = roster.length > 1
        const clerk = group ? minutesTaker(roster, host, stateRef.current) : null
        hostRef.current = host
        clerkRef.current = clerk
        setClerkId(clerk?.id ?? null)
        const opening = sceneOpening(stateRef.current, roster)
        for (const line of opening) {
          if (!alive.current) return
          const person = roster.find((item) => item.id === line.staffId)
          if (!person) continue
          remember(person.id, person.name, line.text)
          await say(person, line.text)
        }
      }
      if (!alive.current) return
      await wait(700)
      if (alive.current) setPhase('listening')
    })()
    return () => {
      window.clearTimeout(hush.current)
      mic.current?.stop()
      liveRef.current?.close()
      liveRef.current = null
      stopSpeaking()
      if (!filed.current) {
        alive.current = false
        void fileMinutes()
      }
      releaseMicrophone()
    }
  }, [])

  const end = () => {
    mic.current?.stop()
    void (async () => {
      await fileMinutes()
      alive.current = false
      liveRef.current?.close()
      liveRef.current = null
      stopSpeaking()
      releaseMicrophone()
      onClose()
    })()
  }

  const title = people.length === 1 ? people[0].name : 'Group call'
  const label =
    phase === 'speaking'
      ? `${people.find((person) => person.id === speakerId)?.name.split(' ')[0] ?? 'Someone'} is speaking`
      : phase === 'thinking'
        ? 'One moment'
        : muted
          ? 'Muted'
          : 'Listening'

  return (
    <div className={docked ? 'call is-dock' : 'call'} role="dialog" aria-label="Voice call">
      {!docked && (
        <nav className="call-nav" aria-label="Company">
          {CALL_LINKS.map(([id, name]) => (
            <button key={id} type="button" onClick={() => onNavigate?.(id)}>
              {name}
            </button>
          ))}
          <button type="button" className="call-office" onClick={() => onViewOffice?.()}>
            View office
          </button>
        </nav>
      )}
      {docked && (
        <button type="button" className="call-expand" onClick={() => onExpand?.()}>
          Back to call
        </button>
      )}
      <header className="call-top">
        <p>{clock(seconds)}</p>
        <strong>{title}</strong>
        <span>{label}</span>
      </header>
      <ul className="call-grid" data-count={people.length} data-crowd={people.length > 8 ? 'true' : 'false'}>
        {people.map((person) => {
          const speaking = person.id === speakerId && phase === 'speaking'
          return (
            <li key={person.id} data-speaking={speaking ? 'true' : 'false'}>
              <Face person={person} className="call-face" />
              <b>
                {person.name.split(' ')[0]}
                <em>{person.title}</em>
              </b>
              {clerkId === person.id && <small>Minutes</small>}
            </li>
          )
        })}
      </ul>
      {live && <p className="call-live">{live}</p>}
      {note && <p className="call-note">{note}</p>}
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
