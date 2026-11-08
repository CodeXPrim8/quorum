import { useState } from 'react'
import { actionLabel } from '../engine/outcomes'
import { formatWhen } from '../lib/format'
import type { AppState, Command } from '../types'

export function Approvals({ state, dispatch, now }: { state: AppState; dispatch: (command: Command) => void; now: number }) {
  const [filter, setFilter] = useState<'pending' | 'decided'>('pending')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [goalText, setGoalText] = useState<Record<string, string>>({})
  const proposals = (state.goalProposals ?? []).filter((item) => item.status === 'pending')
  const rows = state.approvals.filter((approval) => (filter === 'pending' ? approval.status === 'pending' : approval.status !== 'pending'))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Least privilege</p>
          <h1>Approvals</h1>
          <p className="lede">
            Day-to-day work starts without you. A new company goal, and anything that publishes, sends, buys, pays, hires,
            or uses this computer, stops here. Approving records the decision in Quorum. It does not call a live outside network.
          </p>
        </div>
      </header>
      {proposals.length > 0 && (
        <section className="panel">
          <p className="eyebrow">Company direction</p>
          <h2>Proposed goals</h2>
          <ul className="plain">
            {proposals.map((proposal) => {
              const person = state.staff.find((item) => item.id === proposal.proposedById)
              const text = goalText[proposal.id] ?? proposal.text
              return (
                <li key={proposal.id}>
                  <p className="fine">
                    {person?.name ?? 'Managing director'} · {formatWhen(proposal.createdAt, now)}
                  </p>
                  <label>
                    Goal
                    <textarea
                      rows={2}
                      value={text}
                      onChange={(event) => setGoalText((current) => ({ ...current, [proposal.id]: event.target.value }))}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => dispatch({ type: 'DECIDE_GOAL', proposalId: proposal.id, decision: 'approved', text })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => dispatch({ type: 'DECIDE_GOAL', proposalId: proposal.id, decision: 'rejected' })}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
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
