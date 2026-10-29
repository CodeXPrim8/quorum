import { useEffect, useState } from 'react'
import { isStaffActive } from '../domain/active'
import { activityLabel, assignmentFor } from '../domain/selectors'
import { FLOOR_MEETING } from '../engine/apply'
import { clockOpen } from '../engine/life'
import { activityLine, formatClock, formatWhen } from '../lib/format'
import { OfficeScene } from './OfficeScene'
import { LOTS } from './xoral-layout'
import type { AppState, Command } from '../types'

type Props = {
  state: AppState
  dispatch: (command: Command) => void
  onOpenStaff: (id: string) => void
  onOpenTask: (id: string) => void
}

export function OfficeView({ state, dispatch, onOpenStaff, onOpenTask }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [departmentId, setDepartmentId] = useState('all')
  const [staffId, setStaffId] = useState('all')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [cityHour, setCityHour] = useState(15)
  const [cityRuns, setCityRuns] = useState(false)
  const [ownedLots, setOwnedLots] = useState<string[]>([])
  const [place, setPlace] = useState<{ x: number; z: number; token: number } | null>(null)
  const reduced = state.settings.reducedMotion
  const showFloor = state.settings.showFloor
  const activeStaff = state.staff.filter((person) => isStaffActive(state, person))
  const someoneMoving = activeStaff.some((person) => person.presence.movingUntil > Date.now() || person.presence.pose === 'drink')
  const open = clockOpen(state.clock)

  useEffect(() => {
    if (!cityRuns) return
    const id = window.setInterval(() => setCityHour((hour) => (hour + 0.2) % 24), 800)
    return () => window.clearInterval(id)
  }, [cityRuns])

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
          <button type="button" className="btn" onClick={() => dispatch({ type: 'ADVANCE_TASK' })}>
            Advance one demo step
          </button>
          <button
            type="button"
            className={state.settings.engineRunning ? 'btn btn-primary' : 'btn'}
            onClick={() => dispatch({ type: 'SET_ENGINE', running: !state.settings.engineRunning })}
          >
            {state.settings.engineRunning ? 'Pause demo engine' : 'Run demo engine'}
          </button>
        </div>
      </header>

      <DemoBanner running={state.settings.engineRunning} />

      <div className="toolbar">
        <label>
          Department
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="all">All departments</option>
            {state.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
                {department.enabled ? '' : ' (off)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Person
          <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            <option value="all">Everyone</option>
            {activeStaff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(event) => dispatch({ type: 'SET_REDUCED_MOTION', value: event.target.checked })}
          />
          Reduced motion
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showFloor}
            onChange={(event) => dispatch({ type: 'SET_FLOOR', visible: event.target.checked })}
          />
          Animated floor
        </label>
      </div>

      <div className="city-bar">
        <div>
          <p className="eyebrow">Xoral City</p>
          <p className="fine">The city of AI agents, around this office. The office itself stays as it is. Staff monitoring stays in the list below.</p>
        </div>
        <label>
          City hour {formatCityHour(cityHour)}
          <input
            type="range"
            min={0}
            max={24}
            step={0.25}
            value={cityHour}
            onChange={(event) => setCityHour(Number(event.target.value))}
          />
        </label>
        <button type="button" className={cityRuns ? 'btn btn-primary' : 'btn'} onClick={() => setCityRuns((value) => !value)}>
          {cityRuns ? 'Pause city time' : 'Let city time run'}
        </button>
        <button type="button" className="btn" onClick={() => setPlace({ x: 12, z: 12, token: Date.now() })}>
          Return to the office
        </button>
        <div className="city-lots">
          <span className="fine">Northline office</span>
          {LOTS.map((lot) => {
            const owned = ownedLots.includes(lot.id)
            return (
              <span key={lot.id}>
                <button type="button" className="btn" onClick={() => setPlace({ x: lot.x, z: lot.z, token: Date.now() })}>
                  {lot.name}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOwnedLots((current) => (current.includes(lot.id) ? current.filter((id) => id !== lot.id) : [...current, lot.id]))}
                >
                  {owned ? 'Release lot' : 'Acquire lot'}
                </button>
              </span>
            )
          })}
        </div>
      </div>

      {showFloor ? (
        <div className={reduced ? 'stage is-reduced' : 'stage'}>
          <OfficeScene
            state={state}
            now={now}
            departmentId={departmentId}
            staffId={staffId}
            onSelect={setFocusId}
            cityHour={cityHour}
            ownedLots={ownedLots}
            focus={place}
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
                  {activeStaff
                    .filter((person) => departmentId === 'all' || person.departmentId === departmentId)
                    .filter((person) => staffId === 'all' || person.id === staffId)
                    .map((person) => {
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

function formatCityHour(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour % 1) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function DemoBanner({ running }: { running: boolean }) {
  return (
    <p className="banner">
      Practice company in this browser. Nothing is sent outside.{running ? ' Task steps are advancing.' : ''}
    </p>
  )
}
