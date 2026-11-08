import { useEffect, useMemo, useRef, useState } from 'react'
import { subscribeNotice, subscribeTyping, type Typing } from '../agents/status'
import { readModelLink, saveModelLink } from '../agents/model'
import { isStaffActive } from '../domain/active'
import { ensureChat, withoutSpeaker } from '../chat/threads'
import { Face, initials } from './Face'
import { formatWhen, uid } from '../lib/format'
import { badgeCount, unreadIn } from '../domain/attention'
import type { AppState, ChatThread, Command, Design, Staff } from '../types'

export function ChatView({
  state,
  dispatch,
  now,
  selectedId,
  onJoinCall,
}: {
  state: AppState
  dispatch: (command: Command) => void
  now: number
  selectedId?: string
  onJoinCall?: (threadId: string, memberIds: string[]) => void
}) {
  const view = ensureChat(state)
  const people = view.staff.filter((person) => isStaffActive(view, person))
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [panel, setPanel] = useState<'group' | 'model' | null>(null)
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1')
  const [model, setModel] = useState('deepseek-chat')
  const [apiKey, setApiKey] = useState('')
  const [linked, setLinked] = useState(() => Boolean(readModelLink()))
  const [typing, setTypingState] = useState<Typing>(null)
  const [notice, setNotice] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [following, setFollowing] = useState(true)
  const [callMenu, setCallMenu] = useState(false)
  const [callPick, setCallPick] = useState<string[]>([])
  const streamRef = useRef<HTMLDivElement>(null)
  const moving = useRef(false)
  const followingRef = useRef(true)
  followingRef.current = following

  useEffect(() => subscribeTyping(setTypingState), [])
  useEffect(() => subscribeNotice(setNotice), [])

  const threads = useMemo(() => orderThreads(view.threads, view.chat), [view.threads, view.chat])
  const visible = threads.filter((thread) => thread.name.toLowerCase().includes(query.trim().toLowerCase()))
  const active = view.threads.find((thread) => thread.id === selectedId) ?? null
  const shown = active ?? view.threads.find((thread) => thread.kind === 'company') ?? null
  const messages = shown ? view.chat.filter((message) => message.threadId === shown.id) : []
  const designs = new Map(view.designs.map((design) => [design.id, design]))
  const mentionQuery = mentionTerm(draft)
  const mentionPool = shown ? people.filter((person) => shown.memberIds.includes(person.id)) : people

  useEffect(() => {
    setFollowing(true)
    followingRef.current = true
    const el = streamRef.current
    if (!el) return
    const pin = () => {
      if (!followingRef.current) return
      moving.current = true
      el.scrollTop = el.scrollHeight
      window.setTimeout(() => {
        moving.current = false
      }, 40)
    }
    pin()
    const observer = new ResizeObserver(pin)
    const watch = () => {
      observer.disconnect()
      observer.observe(el)
      for (const child of el.children) observer.observe(child)
    }
    watch()
    const mutation = new MutationObserver(() => {
      watch()
      pin()
    })
    mutation.observe(el, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      mutation.disconnect()
    }
  }, [shown?.id])

  useEffect(() => {
    if (!shown) return
    dispatch({ type: 'READ_THREAD', threadId: shown.id })
  }, [shown?.id])

  const openThread = (id: string) => {
    window.location.hash = `#/chat/${id}`
    setPanel(null)
    setMentionOpen(false)
    setCallMenu(false)
  }

  const joinCall = (memberIds: string[]) => {
    if (!shown) return
    onJoinCall?.(shown.id, memberIds)
    setCallMenu(false)
  }

  const send = () => {
    if (!shown || !draft.trim()) return
    followingRef.current = true
    setFollowing(true)
    dispatch({ type: 'SEND_MESSAGE', threadId: shown.id, text: draft })
    setDraft('')
    setMentionOpen(false)
  }

  return (
    <div className={active ? 'wa is-open' : 'wa'}>
      <aside className="wa-list">
        <header className="wa-list-head">
          <h1>Chat</h1>
          <div className="wa-head-actions">
            <button type="button" className="wa-icon" onClick={() => setPanel(panel === 'group' ? null : 'group')}>
              New group
            </button>
            {!linked && (
              <button type="button" className="wa-icon" onClick={() => setPanel(panel === 'model' ? null : 'model')}>
                Link model
              </button>
            )}
          </div>
        </header>
        {panel === 'group' && (
          <form
            className="wa-panel"
            onSubmit={(event) => {
              event.preventDefault()
              if (groupName.trim().length === 0 || groupMembers.length < 2) return
              const id = `thread_${uid('grp')}`
              dispatch({ type: 'CREATE_GROUP', id, name: groupName, memberIds: groupMembers })
              setGroupName('')
              setGroupMembers([])
              setPanel(null)
              openThread(id)
            }}
          >
            <h2>New group</h2>
            <label>
              Group name
              <input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={60} required />
            </label>
            <fieldset>
              <legend>Add staff</legend>
              {people.map((person) => (
                <label key={person.id}>
                  <input
                    type="checkbox"
                    checked={groupMembers.includes(person.id)}
                    onChange={() =>
                      setGroupMembers((current) =>
                        current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id],
                      )
                    }
                  />
                  {person.name}
                  <small>{person.title}</small>
                </label>
              ))}
            </fieldset>
            <button type="submit" className="btn btn-primary" disabled={groupMembers.length < 2 || !groupName.trim()}>
              Create group
            </button>
          </form>
        )}
        {panel === 'model' && !linked && (
          <form
            className="wa-panel"
            onSubmit={(event) => {
              event.preventDefault()
              saveModelLink({ baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() })
              setApiKey('')
              setLinked(true)
              setPanel(null)
            }}
          >
            <h2>Link a model</h2>
            <p>
              This is the brain. Paste DeepSeek, or Grok at https://api.x.ai/v1 with a Grok model name and an xAI key.
              The key stays in this browser. Quorum then uses that model to decide and to write.
            </p>
            <label>
              Address
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com/v1" required />
            </label>
            <label>
              Model
              <input value={model} onChange={(event) => setModel(event.target.value)} required />
            </label>
            <label>
              API key
              <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" required />
            </label>
            <div className="button-row">
            <button type="submit" className="btn btn-primary">
              Save on this computer
            </button>
          </div>
          </form>
        )}
        <label className="wa-search">
          <span className="sr">Search chats</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
        </label>
        <div className="wa-chats">
          <ThreadList title="Company" threads={visible.filter((thread) => thread.kind === 'company')} view={view} now={now} activeId={shown?.id} onOpen={openThread} />
          <ThreadList title="Groups" threads={visible.filter((thread) => thread.kind === 'group')} view={view} now={now} activeId={shown?.id} onOpen={openThread} />
          <ThreadList title="Staff" threads={visible.filter((thread) => thread.kind === 'direct')} view={view} now={now} activeId={shown?.id} onOpen={openThread} />
          <ThreadList title="Line reports" threads={visible.filter((thread) => thread.kind === 'line')} view={view} now={now} activeId={shown?.id} onOpen={openThread} />
        </div>
      </aside>
      <section className="wa-pane" aria-label={shown?.name ?? 'Conversation'}>
        {shown ? (
          <>
            <header className="wa-pane-head">
              <button type="button" className="wa-back" onClick={() => (window.location.hash = '#/chat')}>
                Chats
              </button>
              <Avatar thread={shown} people={people} />
              <div className="wa-pane-title">
                <strong>{shown.name}</strong>
                <p>{subtitle(shown, people)}</p>
              </div>
              <button
                type="button"
                className="wa-call"
                aria-label={shown.kind === 'direct' ? `Call ${shown.name}` : 'Call'}
                onClick={() => {
                  if (shown.kind === 'direct') {
                    joinCall(shown.memberIds)
                    return
                  }
                  setCallPick(shown.memberIds)
                  setCallMenu((open) => !open)
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6.6 3.8c.4-.4 1-.5 1.5-.3l2.2.9c.5.2.8.7.8 1.2l-.2 2.4c0 .4-.2.8-.6 1L8.8 10c.9 1.9 2.4 3.4 4.3 4.3l1-1.5c.2-.4.6-.6 1-.6l2.4-.2c.5 0 1 .3 1.2.8l.9 2.2c.2.5.1 1.1-.3 1.5l-1.4 1.4c-.4.4-1 .6-1.6.5C11.2 18 6 12.8 5.2 6.8c-.1-.6.1-1.2.5-1.6L6.6 3.8Z" />
                </svg>
              </button>
            </header>
            {callMenu && shown.kind !== 'direct' && (
              <div className="wa-call-menu">
                <h2>Voice call</h2>
                <p>Call the whole group, or pick people for a private huddle. Anyone on the line sits at their laptop in the office.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    joinCall(shown.memberIds)
                  }}
                >
                  Group call
                </button>
                <fieldset>
                  <legend>Or a smaller huddle</legend>
                  {people
                    .filter((person) => shown.memberIds.includes(person.id))
                    .map((person) => (
                      <label key={person.id}>
                        <input
                          type="checkbox"
                          checked={callPick.includes(person.id)}
                          onChange={() =>
                            setCallPick((current) =>
                              current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id],
                            )
                          }
                        />
                        {person.name}
                        <small>{person.title}</small>
                      </label>
                    ))}
                </fieldset>
                <button
                  type="button"
                  className="btn"
                  disabled={callPick.length === 0}
                  onClick={() => {
                    joinCall(callPick)
                  }}
                >
                  Call selected
                </button>
              </div>
            )}
            {notice && <p className="wa-notice">{notice}</p>}
            <div
              className="wa-stream"
              ref={streamRef}
              onScroll={(event) => {
                if (moving.current) return
                const el = event.currentTarget
                const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 90
                setFollowing((current) => (current === nearEnd ? current : nearEnd))
              }}
            >
              {messages.length === 0 && (
                <p className="wa-empty">
                  {shown.kind === 'direct'
                    ? `This chat prompts ${shown.name}. Say hello, or ask them to do something in their role.`
                    : 'Tag someone with @, or @all for everyone in this chat. Promotional graphics wait here before social. In-house flyers are approved in a DM, then shared in this group.'}
                </p>
              )}
              {messages.map((message) => {
                const mine = message.authorId === 'owner'
                const design = message.designId ? designs.get(message.designId) : undefined
                return (
                  <article key={message.id} className={mine ? 'wa-bubble mine' : 'wa-bubble'}>
                    {!mine && shown.kind !== 'direct' && <b style={{ color: shirtOf(people, message.authorId) }}>{message.authorName}</b>}
                    <p>{withoutSpeaker(message.authorName, message.text)}</p>
                    {message.file && (
                      <a className="wa-file" href={message.file.dataUrl} download={message.file.name}>
                        {message.file.name}
                      </a>
                    )}
                    {design && <DesignCard design={design} />}
                    {design?.status === 'in_review' && design.audience === 'internal' && message.authorId !== 'owner' && (
                      <p className="wa-review-note">In-house only. Approve here to share it in the company group. It will not go to social.</p>
                    )}
                    {design?.status === 'in_review' && design.audience !== 'internal' && design.reviewer === 'marketing' && message.authorId !== 'owner' && (
                      <p className="wa-review-note">The marketing manager is looking at this promotional graphic. You can still approve it or ask for a change.</p>
                    )}
                    {design?.status === 'in_review' && message.authorId !== 'owner' && (
                      <div className="wa-review">
                        <input
                          value={notes[design.id] ?? ''}
                          onChange={(event) => setNotes({ ...notes, [design.id]: event.target.value })}
                          placeholder="What should change?"
                          aria-label="Note for a revision"
                        />
                        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'REVIEW_DESIGN', designId: design.id, decision: 'approved' })}>
                          {design.audience === 'internal' ? 'Approve to company group' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => dispatch({ type: 'REVIEW_DESIGN', designId: design.id, decision: 'changes', note: notes[design.id] })}
                        >
                          Request changes
                        </button>
                      </div>
                    )}
                    <time dateTime={message.at}>{formatWhen(message.at, now)}</time>
                  </article>
                )
              })}
              {typing && typing.threadId === shown.id && (
                <p className="wa-typing">
                  <i />
                  <i />
                  <i />
                  {typing.name} is typing
                </p>
              )}
            </div>
            <div className="wa-dock">
            {!following && (
              <button
                type="button"
                className="wa-jump"
                onClick={() => {
                  followingRef.current = true
                  setFollowing(true)
                  const el = streamRef.current
                  if (!el) return
                  moving.current = true
                  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                  window.setTimeout(() => {
                    moving.current = false
                  }, 280)
                }}
              >
                Latest
              </button>
            )}
            {mentionOpen && (
              <ul className="wa-mentions">
                {(!mentionQuery || 'all'.includes(mentionQuery.toLowerCase())) && (
                  <li>
                    <button type="button" onClick={() => addMention('@all')}>
                      <strong>@all</strong>
                      <small>Everyone in this chat</small>
                    </button>
                  </li>
                )}
                {mentionPool
                  .filter((person) => person.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                  .map((person) => (
                    <li key={person.id}>
                      <button type="button" onClick={() => addMention(`@${person.name}`)}>
                        <strong>{person.name}</strong>
                        <small>{person.title}</small>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <form
              className="wa-compose"
              onSubmit={(event) => {
                event.preventDefault()
                send()
              }}
            >
              <button type="button" className="wa-at" onClick={() => setMentionOpen((open) => !open)} aria-label="Tag a person">
                @
              </button>
              <textarea
                rows={1}
                value={draft}
                placeholder={shown.kind === 'direct' ? `Message ${shown.name}` : 'Message'}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setMentionOpen(event.target.value.includes('@'))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              <button type="submit" className="wa-send" aria-label="Send">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.4 11.2 20 4.2c.7-.3 1.4.4 1.1 1.1l-7 16.6c-.3.8-1.4.8-1.7 0l-2.2-6.4-6.4-2.2c-.8-.3-.8-1.4 0-1.7Z" />
                </svg>
              </button>
            </form>
            </div>
          </>
        ) : (
          <p className="wa-empty">Choose a chat.</p>
        )}
      </section>
    </div>
  )

  function addMention(token: string) {
    setDraft((current) => {
      const at = current.lastIndexOf('@')
      if (at >= 0) return `${current.slice(0, at)}${token} `
      return `${current}${current.endsWith(' ') || current.length === 0 ? '' : ' '}${token} `
    })
    setMentionOpen(false)
  }
}

function ThreadList({
  title,
  threads,
  view,
  now,
  activeId,
  onOpen,
}: {
  title: string
  threads: ChatThread[]
  view: AppState
  now: number
  activeId?: string
  onOpen: (id: string) => void
}) {
  if (threads.length === 0) return null
  const people = view.staff.filter((person) => isStaffActive(view, person))
  return (
    <div>
      <p className="wa-section">{title}</p>
      {threads.map((thread) => {
        const last = [...view.chat].reverse().find((message) => message.threadId === thread.id)
        const unread = unreadIn(view, thread.id)
        return (
          <button key={thread.id} type="button" className="wa-row" aria-current={thread.id === activeId ? 'true' : undefined} onClick={() => onOpen(thread.id)}>
            <span className="wa-avatar-wrap">
              <Avatar thread={thread} people={people} />
              {unread > 0 && <span className="note-badge">{badgeCount(unread)}</span>}
            </span>
            <span>
              <strong>{thread.name}</strong>
              <small>{last ? `${last.authorId === 'owner' ? 'You' : last.authorName.split(' ')[0]}: ${last.designId ? 'Graphic' : withoutSpeaker(last.authorName, last.text)}` : 'No messages yet'}</small>
            </span>
            {last && <time dateTime={last.at}>{formatWhen(last.at, now)}</time>}
          </button>
        )
      })}
    </div>
  )
}

function Avatar({ thread, people }: { thread: ChatThread; people: Staff[] }) {
  if (thread.kind === 'company') return <span className="wa-avatar company">{initials(thread.name)}</span>
  if (thread.kind === 'group') return <span className="wa-avatar group">{initials(thread.name)}</span>
  const person = people.find((item) => item.id === thread.memberIds[0])
  if (person) return <Face person={person} className="wa-avatar" />
  return (
    <span className="wa-avatar" style={{ background: '#1c5f5b' }}>
      {initials(thread.name)}
    </span>
  )
}

function DesignCard({ design }: { design: Design }) {
  const internal = design.audience === 'internal'
  const label =
    design.status === 'published'
      ? 'Published on Instagram'
      : design.status === 'held'
      ? 'Approved · held for social'
      : design.status === 'declined'
        ? 'Declined'
        : design.status === 'changes'
          ? 'Superseded'
          : design.status === 'approved'
            ? internal
              ? 'Approved · company group'
              : 'Approved'
            : design.reviewer === 'marketing'
              ? 'With the marketing manager'
              : internal
                ? 'In review · DM'
                : 'In review'
  const shape = design.format === 'cover' ? 'portrait' : design.format === 'thumbnail' ? 'landscape' : 'square'
  const finishing = design.artStatus === 'pending' && !design.art
  const channel = design.platform === 'tiktok' ? 'TikTok' : design.platform === 'youtube' ? 'YouTube' : design.platform === 'instagram' ? 'Instagram' : ''
  return (
    <figure className="design-card">
      <div className={finishing ? 'poster is-pending' : 'poster'} data-shape={shape} dangerouslySetInnerHTML={{ __html: design.svg }} />
      <figcaption>
        <span>
          {internal ? `${label} · in-house · never social` : channel ? `${label} · ${channel}` : `${label} · promotional`}
          {finishing ? ' · finishing the photograph' : design.artStatus === 'ready' ? ' · studio + photo' : ' · studio'}
        </span>
        <span>Revision {design.revision}</span>
      </figcaption>
    </figure>
  )
}

function orderThreads(threads: ChatThread[], chat: AppState['chat']): ChatThread[] {
  const last = (thread: ChatThread) => [...chat].reverse().find((message) => message.threadId === thread.id)?.at ?? ''
  const byRecent = (a: ChatThread, b: ChatThread) => last(b).localeCompare(last(a)) || a.name.localeCompare(b.name)
  return [
    ...threads.filter((thread) => thread.kind === 'company'),
    ...threads.filter((thread) => thread.kind === 'group').sort(byRecent),
    ...threads.filter((thread) => thread.kind === 'direct').sort(byRecent),
    ...threads.filter((thread) => thread.kind === 'line').sort(byRecent),
  ]
}

function subtitle(thread: ChatThread, people: Staff[]): string {
  if (thread.kind === 'company') return `${thread.memberIds.length} people · tag someone, or @all`
  if (thread.kind === 'direct') return people.find((person) => person.id === thread.memberIds[0])?.title ?? 'Direct chat'
  if (thread.kind === 'line') return 'Daily note to the line manager'
  const names = thread.memberIds.map((id) => people.find((person) => person.id === id)?.name.split(' ')[0]).filter(Boolean)
  return names.join(', ')
}

function shirtOf(people: Staff[], id: string): string {
  return people.find((person) => person.id === id)?.appearance.shirt ?? '#1c5f5b'
}

function mentionTerm(draft: string): string {
  const match = draft.match(/(?:^|\s)@([^\s@]*)$/)
  return match?.[1] ?? ''
}
