import type { ReactNode } from 'react'
import { pendingApprovals } from '../domain/selectors'
import type { AppState } from '../types'

const links = [
  ['overview', 'Overview'],
  ['office', 'Office'],
  ['org', 'Organization'],
  ['tasks', 'Tasks'],
  ['people', 'People'],
  ['chat', 'Chat'],
  ['approvals', 'Approvals'],
  ['activity', 'Activity'],
  ['integrations', 'Integrations'],
  ['company', 'Company'],
] as const

export function Shell({
  state,
  view,
  children,
  account,
  onSignOut,
}: {
  state: AppState
  view: string
  children: ReactNode
  account?: string
  onSignOut?: () => void
}) {
  const waiting = pendingApprovals(state).length
  const reviewing = (state.designs ?? []).filter((design) => design.status === 'in_review').length
  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <nav className="nav" aria-label="Company">
        <a className="brand" href="#/overview">
          <span>Quorum</span>
          <small>{state.company?.name ?? 'No company yet'}</small>
        </a>
        <div className="nav-links">
          {links.map(([id, label]) => (
            <a key={id} href={`#/${id}`} aria-current={view === id ? 'page' : undefined}>
              {label}
              {id === 'approvals' && waiting > 0 && <em>{waiting}</em>}
              {id === 'chat' && reviewing > 0 && <em>{reviewing}</em>}
            </a>
          ))}
        </div>
        <p className="nav-foot">
          {state.company ? `${state.company.ownerTitle} · ${state.company.ownerName}` : 'Setup'}
          <span>{state.settings.engineRunning ? 'Demo engine on' : 'Demo engine off'}</span>
          {account && <span>{account}</span>}
          {onSignOut && (
            <button type="button" className="nav-signout" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </p>
      </nav>
      <main id="content" className={view === 'office' ? 'main is-office' : view === 'chat' ? 'main is-chat' : 'main'}>
        {children}
      </main>
    </div>
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
