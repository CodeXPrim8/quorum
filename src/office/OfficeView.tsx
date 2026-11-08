import { useEffect, useState } from 'react'
import { isStaffActive } from '../domain/active'
import { activityLabel, assignmentFor } from '../domain/selectors'
import { FLOOR_MEETING } from '../engine/apply'
import { clockOpen } from '../engine/life'
import { activityLine, formatClock, formatWhen } from '../lib/format'
import { OfficeScene } from './OfficeScene'
import type { AppState, Command } from '../types'

type Props = {
  state: AppState
  dispatch: (command: Command) => void
  onOpenStaff: (id: string) => void
  onOpenTask: (id: string) => void
}

export function OfficeView({ state, dispatch, onOpenStaff, onOpenTask }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [focusId, setFocusId] = useState<string | null>(null)
  const reduced = state.settings.reducedMotion
  const showFloor = state.settings.showFloor
  const activeStaff = state.staff.filter((person) => isStaffActive(state, person))
  const someoneMoving = activeStaff.some((person) => person.presence.movingUntil > Date.now() || person.presence.pose === 'drink')
  const open = clockOpen(state.clock)

  useEffect(() => {
    if (!someoneMoving) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [someoneMoving])

  const latest = state.events[0]

  return (
    <div className="page office-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {open ? 'Open' : state.clock.minute >= 7 * 60 && state.clock.minute < state.clock.openMinute ? 'Arriving' : 'Closed'} · {formatClock(state.clock.minute)}
          </p>
          <h1>The office</h1>
        </div>
        <div className="button-row">
          <button
            type="button"
            className={activeStaff.some((person) => person.presence.meetingTaskId === FLOOR_MEETING) ? 'btn' : 'btn btn-primary'}
            onClick={() =>
              dispatch({
                type: activeStaff.some((person) => person.presence.meetingTaskId === FLOOR_MEETING) ? 'END_MEETING' : 'CALL_MEETING',
              })
            }
          >
            {activeStaff.some((person) => person.presence.meetingTaskId === FLOOR_MEETING) ? 'End meeting' : 'Call meeting'}
          </button>
        </div>
      </header>

      {showFloor ? (
        <div className={reduced ? 'stage is-reduced' : 'stage'}>
          <OfficeScene
            state={state}
            now={now}
            departmentId="all"
            staffId="all"
            onSelect={setFocusId}
            cityHour={state.clock.minute / 60}
            ownedLots={[]}
            focus={null}
          />
        </div>
      ) : (
        <p className="note">The office is hidden. The list below still shows where everyone is.</p>
      )}
      {focusId && (
        <FocusLine state={state} staffId={focusId} now={now} onOpen={() => onOpenStaff(focusId)} />
      )}

      <div aria-live="polite" className="live">
        {latest ? `Latest: ${activityLine(latest.actorName, latest.message)}` : 'No activity yet.'}
      </div>

      <div className="split">
        <section className="panel">
          <h2>Where everyone is</h2>
          {activeStaff.length === 0 ? (
            <p className="empty-inline">No AI staff are on the floor. Activate a department and a role, then add a person.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Status</th>
                    <th>Assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((person) => {
                      const task = assignmentFor(state, person.id)
                      return (
                        <tr key={person.id}>
                          <td>
                            <button type="button" className="linkish" onClick={() => onOpenStaff(person.id)}>
                              {person.name}
                            </button>
                            <span className="fine block">{person.title}</span>
                          </td>
                          <td>{activityLabel(state, person, now)}</td>
                          <td>
                            {task ? (
                              <button type="button" className="linkish" onClick={() => onOpenTask(task.id)}>
                                {task.title}
                              </button>
                            ) : (
                              'No current task'
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Task activity</h2>
          {state.events.length === 0 ? (
            <p className="empty-inline">Nothing has happened yet. Start a task and it will show up here.</p>
          ) : (
            <ol className="activity compact">
              {state.events.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <time dateTime={event.at}>{formatWhen(event.at, now)}</time>
                  <p>{activityLine(event.actorName, event.message)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

function FocusLine({
  state,
  staffId,
  now,
  onOpen,
}: {
  state: AppState
  staffId: string
  now: number
  onOpen: () => void
}) {
  const person = state.staff.find((item) => item.id === staffId)
  if (!person) return null
  const life = person.life
  return (
    <p className="focus-line">
      <button type="button" className="linkish" onClick={onOpen}>
        {person.name}
      </button>
      <span>{activityLabel(state, person, now)}</span>
      <span>{life.marital === 'married' ? `Married${life.spouse ? ` to ${life.spouse}` : ''}` : 'Single'}</span>
      <span>{life.balance.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })}</span>
    </p>
  )
}

export function DemoBanner({ running: _running }: { running?: boolean }) {
  return (
    <p className="banner">Staff work with the linked AI brain inside Quorum. Nothing is sent outside until you connect that channel.</p>
  )
}
