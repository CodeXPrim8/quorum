import { useState } from 'react'
import { activityLine, formatWhen } from '../lib/format'
import type { AppState } from '../types'

export function ActivityLog({ state, now }: { state: AppState; now: number }) {
  const [query, setQuery] = useState('')
  const [auditOnly, setAuditOnly] = useState(false)
  const [staffId, setStaffId] = useState('all')
  const needle = query.trim().toLowerCase()
  const events = state.events.filter((event) => {
    if (auditOnly && !event.audit) return false
    if (staffId !== 'all' && event.staffId !== staffId && event.actorId !== staffId) return false
    if (!needle) return true
    return activityLine(event.actorName, event.message).toLowerCase().includes(needle)
  })

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Audit</p>
          <h1>Activity</h1>
          <p className="lede">Who asked, who approved, and what the outcome was. External systems are named only when they were not contacted.</p>
        </div>
      </header>
      <div className="toolbar">
        <label>
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          Person
          <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            <option value="all">Everyone</option>
            {state.staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={auditOnly} onChange={(event) => setAuditOnly(event.target.checked)} />
          Audit trail only
        </label>
      </div>
      {events.length === 0 ? (
        <div className="empty">
          <h2>No matching activity</h2>
          <p>Start a task or clear the filters. Company, permission, and approval events are kept even when a task is done.</p>
        </div>
      ) : (
        <ol className="activity full">
          {events.map((event) => (
            <li key={event.id}>
              <time dateTime={event.at}>{formatWhen(event.at, now)}</time>
              <p>
                {activityLine(event.actorName, event.message)}
                {event.audit && <span className="tag">Audit</span>}
                {event.taskId && (
                  <a href={`#/tasks/${event.taskId}`}> View task</a>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
