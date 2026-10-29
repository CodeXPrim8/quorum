import { DemoBanner } from '../office/OfficeView'
import { activityLabel, pendingApprovals, statusLabel } from '../domain/selectors'
import { isStaffActive } from '../domain/active'
import { activityLine, formatWhen } from '../lib/format'
import type { AppState } from '../types'

export function Overview({ state, now }: { state: AppState; now: number }) {
  if (!state.company) return null
  const company = state.company
  const approvals = pendingApprovals(state)
  const waiting = state.tasks.filter((task) => task.status === 'waiting_for_owner')
  const active = state.tasks.filter((task) => task.status === 'in_progress' || task.status === 'ready')
  const blocked = state.tasks.filter((task) => task.status === 'blocked')
  const results = state.tasks.filter((task) => task.result && (task.status === 'done' || task.status === 'in_review')).slice(0, 4)
  const counts = [
    ['Active', active.length],
    ['Waiting on you', waiting.length],
    ['Approvals', approvals.length],
    ['Blocked', blocked.length],
  ] as const

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{company.businessType}</p>
          <h1>{company.name}</h1>
          <p className="lede">
            {company.ownerTitle} {company.ownerName}
          </p>
        </div>
      </header>
      <DemoBanner running={state.settings.engineRunning} />
      <section className="stat-row" aria-label="Company pulse">
        {counts.map(([label, value]) => (
          <a key={label} className="stat" href={label === 'Approvals' ? '#/approvals' : '#/tasks'}>
            <strong>{value}</strong>
            <span>{label}</span>
          </a>
        ))}
      </section>
      <div className="split">
        <section className="panel">
          <h2>Goals</h2>
          {company.goals.length === 0 ? (
            <p className="empty-inline">No goals yet. Add one in Company settings.</p>
          ) : (
            <ol className="goals">
              {company.goals.map((goal) => (
                <li key={goal.id}>{goal.text}</li>
              ))}
            </ol>
          )}
        </section>
        <section className="panel">
          <h2>Waiting for you</h2>
          {waiting.length === 0 ? (
            <p className="empty-inline">Nothing is waiting on you.</p>
          ) : (
            <ul className="plain">
              {waiting.map((task) => {
                const owner = state.staff.find((person) => person.id === task.assigneeId)
                return (
                  <li key={task.id}>
                    <a href={`#/tasks/${task.id}`}>{task.title}</a>
                    <span className="fine block">{owner?.name ?? 'Unassigned'} · {statusLabel(task.status)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
      <div className="split">
        <section className="panel">
          <h2>Approvals needed</h2>
          {approvals.length === 0 ? (
            <p className="empty-inline">No approvals waiting.</p>
          ) : (
            <ul className="plain">
              {approvals.map((approval) => (
                <li key={approval.id}>
                  <a href="#/approvals">{approval.summary}</a>
                  <span className="fine block">{approval.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>Recent results</h2>
          {results.length === 0 ? (
            <p className="empty-inline">No results yet. When a task is ready for review, the owner of it walks to you.</p>
          ) : (
            <ul className="plain">
              {results.map((task) => (
                <li key={task.id}>
                  <a href={`#/tasks/${task.id}`}>{task.title}</a>
                  <span className="fine block">{task.result}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>On the floor</h2>
        <ul className="chips">
          {state.staff.filter((person) => isStaffActive(state, person)).map((person) => (
            <li key={person.id}>
              <a href={`#/people/${person.id}`}>
                {person.name}
                <small>{activityLabel(state, person, now)}</small>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Latest activity</h2>
        {state.events.length === 0 ? (
          <p className="empty-inline">The log is empty.</p>
        ) : (
          <ol className="activity">
            {state.events.slice(0, 6).map((event) => (
              <li key={event.id}>
                <time dateTime={event.at}>{formatWhen(event.at, now)}</time>
                <p>{activityLine(event.actorName, event.message)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
