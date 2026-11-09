import { useEffect, useRef, useState, type ReactNode } from 'react'
import { endDesktopServerSession } from '../agents/desktop'
import { emptyQuorumId, freshQuorumId, quorumHistory } from '../chat/threads'
import { pendingApprovals } from '../domain/selectors'
import type { AppState, ChatThread, Command } from '../types'
import { PlaceWidget } from './PlaceWidget'
import { QuorumScreen } from './QuorumScreen'

const groups: Array<{ label: string; links: Array<[string, string]> }> = [
  {
    label: 'Work',
    links: [
      ['overview', 'Overview'],
      ['office', 'Office'],
      ['tasks', 'Tasks'],
      ['chat', 'Chat'],
      ['whatsapp', 'WhatsApp'],
      ['approvals', 'Approvals'],
    ],
  },
  {
    label: 'Company',
    links: [
      ['people', 'People'],
      ['org', 'Organization'],
      ['activity', 'Activity'],
      ['integrations', 'Integrations'],
      ['company', 'Company'],
      ['billing', 'Billing'],
    ],
  },
]

export function Shell({
  state,
  view,
  historyId,
  children,
  account,
  onSignOut,
  dispatch,
}: {
  state: AppState
  view: string
  historyId?: string
  children: ReactNode
  account?: string
  onSignOut?: () => void
  dispatch?: (command: Command) => void
}) {
  const waiting = pendingApprovals(state).length + (state.goalProposals ?? []).filter((item) => item.status === 'pending').length
  const reviewing = (state.designs ?? []).filter((design) => design.status === 'in_review').length
  const chats = quorumHistory(state).slice(0, 16)
  const endSession = () => {
    void endDesktopServerSession().finally(() => {
      dispatch?.({ type: 'END_DESKTOP_SESSION' })
    })
  }
  const owner = state.company?.ownerName ?? 'Owner'
  const openNewChat = () => {
    if (!emptyQuorumId(state)) dispatch?.({ type: 'NEW_QUORUM_CHAT', id: freshQuorumId() })
  }

  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <nav className="nav" aria-label="Company">
        <a className="brand-pill" href="#/overview">
          <span className="brand-mark">Q</span>
          <span>
            <strong>Quorum</strong>
            <small>{state.company?.name ?? 'No company yet'}</small>
          </span>
        </a>
        <div className="nav-scroll">
          {groups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-label">{group.label}</p>
              {group.links.map(([id, label]) => (
                <a key={id} className="nav-link" href={`#/${id}`} aria-current={view === id ? 'page' : undefined}>
                  <NavIcon name={id} />
                  <span>{label}</span>
                  {id === 'approvals' && waiting > 0 && <em>{waiting}</em>}
                  {id === 'chat' && reviewing > 0 && <em>{reviewing}</em>}
                </a>
              ))}
            </div>
          ))}
          <div className="nav-group nav-history">
            <p className="nav-label">Chat history</p>
            <a className="nav-link" href="#/overview" aria-current={view === 'overview' ? 'page' : undefined} onClick={openNewChat}>
              <NavIcon name="new-chat" />
              <span>New chat</span>
            </a>
            {chats.map((thread) => (
              <HistoryRow
                key={thread.id}
                thread={thread}
                current={view === 'history' && (historyId === thread.id || (!historyId && thread.id === chats[0]?.id))}
                onRename={(name) => dispatch?.({ type: 'RENAME_QUORUM_CHAT', threadId: thread.id, name })}
                onDelete={() => {
                  dispatch?.({ type: 'DELETE_QUORUM_CHAT', threadId: thread.id })
                  if (historyId !== thread.id) return
                  const next = chats.find((item) => item.id !== thread.id)
                  window.location.hash = next ? `#/history/${next.id}` : '#/overview'
                }}
              />
            ))}
          </div>
        </div>
        <div className="nav-card">
          <p>{owner}</p>
          <small>
            {state.company?.ownerTitle ?? 'Owner'}
            {account ? ` · ${account}` : ''}
          </small>
          {onSignOut && (
            <div>
              <button type="button" className="nav-signout" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>
      <div className="workspace">
        <header className="topbar">
          <PlaceWidget />
        </header>
        <main
          id="content"
          className={
            view === 'office'
              ? 'main is-office'
              : view === 'chat' || view === 'history' || view === 'whatsapp'
                ? 'main is-chat'
                : 'main'
          }
        >
          {state.desktop.sessionActive && (
            <div
              className={state.desktop.grantedQuorum || state.desktop.grantedStaffId ? 'desktop-banner is-using' : 'desktop-banner'}
              role="status"
            >
              <p>
                {state.desktop.grantedQuorum || state.desktop.grantedStaffId
                  ? 'Quorum is using your Computer'
                  : `Desktop session active · ${state.desktop.mode === 'live' ? 'Live' : 'Approved'}`}
              </p>
              <button type="button" className="btn" onClick={endSession}>
                End
              </button>
            </div>
          )}
          {children}
          {dispatch &&
            (view === 'history' ||
              view === 'chat' ||
              view === 'overview' ||
              state.desktop.sessionActive ||
              Boolean(state.desktop.grantedQuorum)) && <QuorumScreen state={state} dispatch={dispatch} />}
        </main>
        <a className="desk-download" href="/api/agent/download" aria-label="Download Quorum Desktop" title="Download Quorum Desktop">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v10" />
            <path d="M8 10l4 4 4-4" />
            <path d="M5 19h14" />
          </svg>
        </a>
      </div>
    </div>
  )
}

function HistoryRow({
  thread,
  current,
  onRename,
  onDelete,
}: {
  thread: ChatThread
  current: boolean
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(thread.name)
  const row = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const save = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== thread.name) onRename(next)
    else setDraft(thread.name)
  }

  return (
    <div className="history-row" ref={row}>
      <button
        type="button"
        className="history-more"
        aria-label={`Options for ${thread.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setEditing(false)
          setOpen((value) => !value)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>
      {open && (
        <div className="history-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setDraft(thread.name)
              setEditing(true)
              setOpen(false)
            }}
          >
            Edit name
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            Delete
          </button>
        </div>
      )}
      {editing ? (
        <input
          className="history-name"
          value={draft}
          aria-label={`Name for ${thread.name}`}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') {
              setDraft(thread.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <a className="nav-link" href={`#/history/${thread.id}`} aria-current={current ? 'page' : undefined}>
          <NavIcon name="history" />
          <span>{thread.name}</span>
        </a>
      )}
    </div>
  )
}

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'office') {
    return (
      <svg {...common}>
        <path d="M4 20V8l8-4 8 4v12" />
        <path d="M9 20v-6h6v6" />
      </svg>
    )
  }
  if (name === 'tasks') {
    return (
      <svg {...common}>
        <path d="M8 7h11M8 12h11M8 17h11" />
        <path d="M4 7h.01M4 12h.01M4 17h.01" />
      </svg>
    )
  }
  if (name === 'chat') {
    return (
      <svg {...common}>
        <path d="M6 17l-2 3V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6z" />
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
        <circle cx="9" cy="9" r="3" />
        <path d="M4 19c1-3 3-4 5-4s4 1 5 4" />
        <circle cx="17" cy="9" r="2" />
        <path d="M16 19c.4-1.6 1.3-2.7 3-3.2" />
      </svg>
    )
  }
  if (name === 'org') {
    return (
      <svg {...common}>
        <rect x="8" y="3" width="8" height="5" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
        <rect x="14" y="16" width="7" height="5" rx="1" />
        <path d="M12 8v4M6.5 16v-2h11v2" />
      </svg>
    )
  }
  if (name === 'activity') {
    return (
      <svg {...common}>
        <path d="M4 12h4l2-5 4 10 2-5h4" />
      </svg>
    )
  }
  if (name === 'integrations') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  if (name === 'company') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    )
  }
  if (name === 'billing') {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </svg>
    )
  }
  if (name === 'new-chat') {
    return (
      <svg {...common}>
        <path d="M12 7v10M7 12h10" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    )
  }
  if (name === 'history') {
    return (
      <svg {...common}>
        <path d="M6 17l-2 3V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </svg>
  )
}

export function LoadingState() {
  return (
    <div className="gate">
      <p className="eyebrow">Quorum</p>
      <h1>Opening the company</h1>
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  )
}

export function ErrorState({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="gate">
      <p className="eyebrow">Something needs attention</p>
      <h1>Quorum could not open the saved company</h1>
      <p className="lede">{message}</p>
      <button type="button" className="btn btn-primary" onClick={onReset}>
        Clear saved data and start over
      </button>
    </div>
  )
}

export function EmptyBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  )
}
