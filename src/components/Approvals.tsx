import { useState } from 'react'
import { actionLabel } from '../engine/outcomes'
import { formatWhen } from '../lib/format'
import type { AppState, Command } from '../types'

export function Approvals({ state, dispatch, now }: { state: AppState; dispatch: (command: Command) => void; now: number }) {
  const [filter, setFilter] = useState<'pending' | 'decided'>('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const rows = state.approvals.filter((approval) => (filter === 'pending' ? approval.status === 'pending' : approval.status !== 'pending'))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Least privilege</p>
          <h1>Approvals</h1>
          <p className="lede">
            Publishing, external messages, purchases, finance changes, hiring, and desktop control stop here. Approving
            records your decision. It does not perform the action while the service is disconnected.
          </p>
        </div>
      </header>
      <div className="toolbar">
        <button type="button" className={filter === 'pending' ? 'btn btn-primary' : 'btn'} onClick={() => setFilter('pending')}>
          Pending
        </button>
        <button type="button" className={filter === 'decided' ? 'btn btn-primary' : 'btn'} onClick={() => setFilter('decided')}>
          Decided
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <h2>{filter === 'pending' ? 'Nothing is waiting' : 'No decisions yet'}</h2>
          <p>
            {filter === 'pending'
              ? 'When a staff member asks to publish, buy, hire, or use the computer, the request shows up here.'
              : 'Approved and declined requests stay in the audit trail.'}
          </p>
        </div>
      ) : (
        <ul className="approval-list">
          {rows.map((approval) => {
            const person = state.staff.find((item) => item.id === approval.requestedById)
            const task = state.tasks.find((item) => item.id === approval.taskId)
            return (
              <li key={approval.id} className="panel">
                <p className="eyebrow">{actionLabel(approval.action)}</p>
                <h2>{approval.summary}</h2>
                <p>{approval.detail}</p>
                <p className="fine">
                  Requested by {person?.name ?? 'Unknown'}
                  {task ? (
                    <>
                      {' '}
                      · <a href={`#/tasks/${task.id}`}>{task.title}</a>
                    </>
                  ) : null}{' '}
                  · {formatWhen(approval.createdAt, now)}
                </p>
                {approval.status === 'pending' ? (
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      event.preventDefault()
                    }}
                  >
                    <label>
                      Note
                      <input
                        value={notes[approval.id] ?? ''}
                        onChange={(event) => setNotes((current) => ({ ...current, [approval.id]: event.target.value }))}
                      />
                    </label>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() =>
                          dispatch({
                            type: 'DECIDE_APPROVAL',
                            approvalId: approval.id,
                            decision: 'approved',
                            note: notes[approval.id] ?? '',
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() =>
                          dispatch({
                            type: 'DECIDE_APPROVAL',
                            approvalId: approval.id,
                            decision: 'rejected',
                            note: notes[approval.id] ?? '',
                          })
                        }
                      >
                        Decline
                      </button>
                    </div>
                  </form>
                ) : (
                  <blockquote>
                    {approval.outcome} {approval.decidedAt ? `(${formatWhen(approval.decidedAt, now)})` : ''}
                  </blockquote>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
