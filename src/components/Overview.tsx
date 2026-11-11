import { useEffect, useRef, useState } from 'react'
import { isStaffActive } from '../domain/active'
import { badgeCount, handUp, unreadFrom } from '../domain/attention'
import { pendingApprovals } from '../domain/selectors'
import { emptyQuorumId, freshQuorumId, quorumHistory, QUORUM_THREAD, directThreadId } from '../chat/threads'
import { subscribeTyping, type Typing } from '../agents/status'
import { allowQuorumDesktop } from '../agents/desktop'
import { canListen, holdMicrophone, startListening } from '../agents/speak'
import type { AppState, Command, Staff } from '../types'
import { QuorumTurn } from './QuorumTurn'

const modes = [
  ['chat', 'Chat'],
  ['tasks', 'Tasks'],
  ['office', 'Office'],
  ['approvals', 'Approvals'],
  ['people', 'People'],
  ['company', 'Company'],
] as const

type Mode = (typeof modes)[number][0]

export function Overview({
  state,
  dispatch,
  talking = false,
  threadId,
  onVoice,
}: {
  state: AppState
  dispatch: (command: Command) => void
  talking?: boolean
  threadId?: string
  onVoice?: (threadId: string) => void
}) {
  const company = state.company
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState<Typing>(null)
  const [deskError, setDeskError] = useState('')
  const [deskBusy, setDeskBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const listeningRef = useRef(false)
  const listenStop = useRef<{ stop: () => void } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const openId = talking
    ? threadId || quorumHistory(state)[0]?.id || emptyQuorumId(state) || QUORUM_THREAD
    : emptyQuorumId(state) || QUORUM_THREAD
  const talk = talking ? state.chat.filter((message) => message.threadId === openId) : []
  const thinking = typing?.name === 'Quorum' && (!typing.threadId || typing.threadId === openId)
  useEffect(() => subscribeTyping(setTyping), [])
  useEffect(() => () => listenStop.current?.stop(), [])
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [talk.length, thinking, talk.at(-1)?.id])
  useEffect(() => {
    if (!talking || !openId) return
    dispatch({ type: 'READ_THREAD', threadId: openId })
  }, [talking, openId])
  if (!company) return null

  const approvals = pendingApprovals(state).length
  const waiting = state.tasks.filter((task) => task.status === 'waiting_for_owner').length
  const goals = (state.goalProposals ?? []).filter((item) => item.status === 'pending').length
  const attention = goals + approvals + waiting
  const attentionHref = goals || approvals ? '#/approvals' : '#/tasks'
  const team = [...state.staff.filter((person) => isStaffActive(state, person))]
    .sort((a, b) => {
      const score = (person: Staff) => (unreadFrom(state, person.id) > 0 ? 2 : 0) + (handUp(state, person.id) ? 1 : 0)
      return score(b) - score(a)
    })
    .slice(0, 8)
  const first = company.ownerName.split(' ')[0] || company.ownerName
  const ask = talking ? state.quorumAsk : undefined

  const openThread = () => {
    if (talking && openId && state.threads.some((thread) => thread.id === openId)) return openId
    const existing = emptyQuorumId(state)
    if (existing) return existing
    const id = freshQuorumId()
    dispatch({ type: 'NEW_QUORUM_CHAT', id })
    return id
  }

  const send = () => {
    const text = draft.trim()
    if (!text) return
    const id = openThread()
    dispatch({ type: 'SEND_MESSAGE', threadId: id, text, wake: false })
    setDraft('')
    if (boxRef.current) boxRef.current.style.height = ''
    if (!talking) window.location.hash = `#/history/${id}`
    else if (id !== threadId) window.location.hash = `#/history/${id}`
  }

  const startVoice = async () => {
    const id = openThread()
    if (!talking) window.location.hash = `#/history/${id}`
    await holdMicrophone()
    onVoice?.(id)
  }

  const listen = async () => {
    if (listeningRef.current) {
      listeningRef.current = false
      listenStop.current?.stop()
      listenStop.current = null
      setListening(false)
      return
    }
    await holdMicrophone()
    listeningRef.current = true
    setListening(true)
    const handle = startListening(
      (text, final) => {
        setDraft(text)
        if (final && text.trim()) {
          listeningRef.current = false
          listenStop.current?.stop()
          listenStop.current = null
          setListening(false)
          const id = openThread()
          dispatch({ type: 'SEND_MESSAGE', threadId: id, text: text.trim(), wake: false })
          setDraft('')
          if (!talking) window.location.hash = `#/history/${id}`
        }
      },
      () => {
        listeningRef.current = false
        setListening(false)
      },
      () => listeningRef.current,
    )
    listenStop.current = handle
    if (!handle) {
      listeningRef.current = false
      setListening(false)
    }
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

  const hint = thinking
    ? 'Quorum is thinking…'
    : listening
      ? 'Listening…'
      : ''

  return (
    <div className={talking ? 'home is-talking' : 'home'}>
      {!talking && (
        <>
          <div className="orb" aria-hidden="true" />
          <h1>Welcome, {first}</h1>
          <p className="lede">
            {company.name} is {state.settings.agentsWorking ? 'working' : 'paused'}. Ask in plain language and Quorum
            routes it.
          </p>
          <div className="mode-row" role="tablist" aria-label="Where this should go">
            {modes.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="mode"
                aria-pressed={id === 'chat'}
                onClick={() => {
                  if (id === 'chat') return
                  window.location.hash = `#/${id}`
                }}
              >
                <ModeIcon name={id} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {talking && (
        <header className="quorum-head">
          <strong>Quorom Si</strong>
          <button type="button" className="voice-chat" onClick={() => void startVoice()}>
            <PhoneIcon />
            Voice chat
          </button>
        </header>
      )}
      {talking && (
        <div className="quorum-log" aria-live="polite" ref={logRef}>
          {talk.map((message, index) => (
            <QuorumTurn
              key={message.id}
              message={message}
              company={company}
              dispatch={dispatch}
              canRetry={message.authorId === 'quorum' && index === talk.length - 1 && !thinking}
            />
          ))}
          {thinking && <p className="quorum-bubble is-wait">Quorum is thinking…</p>}
        </div>
      )}
      {ask?.status === 'pending' && (
        <div className="quorum-ask">
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
      {ask?.status === 'granted' && <p className="home-hint">Quorum is using this computer…</p>}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <textarea
          ref={boxRef}
          rows={talking ? 1 : 2}
          value={draft}
          placeholder="Ask Quorum…"
          aria-label="Ask Quorum"
          onChange={(event) => {
            setDraft(event.target.value)
            const box = event.currentTarget
            box.style.height = 'auto'
            box.style.height = `${Math.min(box.scrollHeight, 192)}px`
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <div className="composer-row">
          {hint ? <p className="home-hint">{hint}</p> : <span />}
          <div className="composer-actions">
            {canListen() && (
              <button type="button" className={listening ? 'send-orb is-live' : 'send-orb is-quiet'} aria-label={listening ? 'Stop listening' : 'Talk'} onClick={() => void listen()}>
                <MicIcon />
              </button>
            )}
            {!talking && (
              <button type="button" className="send-orb is-quiet" aria-label="Voice chat" onClick={() => void startVoice()}>
                <PhoneIcon />
              </button>
            )}
            <button type="submit" className="send-orb" aria-label="Send" disabled={!draft.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M5 12h12M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </form>
      {!talking && attention > 0 && (
        <a className="home-alert" href={attentionHref}>
          {attention} {attention === 1 ? 'thing needs' : 'things need'} you
        </a>
      )}
      {!talking && (
        <>
          <p className="team-label">Your team</p>
          <ul className="team-row">
            {team.map((person) => {
              const unread = unreadFrom(state, person.id)
              const needs = handUp(state, person.id)
              const href = unread > 0 ? `#/chat/${directThreadId(person.id)}` : needs ? '#/approvals' : `#/people/${person.id}`
              const label = [person.name, unread > 0 ? `${unread} unread` : '', needs ? 'needs you' : ''].filter(Boolean).join(', ')
              return (
                <li key={person.id}>
                  <a href={href} aria-label={label}>
                    <span className="avatar-dot" style={{ background: person.appearance.shirt }}>
                      {person.name.slice(0, 1)}
                      {needs && (
                        <span className={state.settings.reducedMotion ? 'team-hand is-still' : 'team-hand'} aria-hidden="true">
                          ✋
                        </span>
                      )}
                      {unread > 0 && <span className="note-badge">{badgeCount(unread)}</span>}
                    </span>
                    {person.name.split(' ')[0]}
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" strokeLinecap="round" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.25a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ModeIcon({ name }: { name: Mode }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'chat') {
    return (
      <svg {...common}>
        <path d="M6 17l-2 3V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6z" />
      </svg>
    )
  }
  if (name === 'tasks') {
    return (
      <svg {...common}>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M8 9h8M8 13h6" />
      </svg>
    )
  }
  if (name === 'office') {
    return (
      <svg {...common}>
        <path d="M4 20V8l8-4 8 4v12" />
        <path d="M9 20v-6h6v6" />
      </svg>
    )
  }
  if (name === 'approvals') {
    return (
      <svg {...common}>
        <path d="M8 12l3 3 5-6" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    )
  }
  if (name === 'people') {
    return (
      <svg {...common}>
        <circle cx="12" cy="9" r="3" />
        <path d="M6 19c1.2-3 3-4.5 6-4.5S16.8 16 18 19" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}
