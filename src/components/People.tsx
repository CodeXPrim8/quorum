import { useState } from 'react'
import { isStaffActive, staffById } from '../domain/active'
import { PERMISSIONS } from '../types'
import { activityLabel, assignmentFor } from '../domain/selectors'
import { formatWhen, money } from '../lib/format'
import { actionLabel } from '../engine/outcomes'
import { Face } from './Face'
import { directThreadId } from '../chat/threads'
import type { AppState, Command, PermissionId } from '../types'

export function People({
  state,
  dispatch,
  selectedId,
  roleId,
  now,
  onJoinCall,
}: {
  state: AppState
  dispatch: (command: Command) => void
  selectedId?: string
  roleId?: string
  now: number
  onJoinCall?: (threadId: string, memberIds: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [departmentId, setDepartmentId] = useState('all')
  const creating = selectedId === 'new'
  const roleFromHash = roleId
  const people = state.staff.filter((person) => {
    if (departmentId !== 'all' && person.departmentId !== departmentId) return false
    if (!query.trim()) return true
    return `${person.name} ${person.title} ${person.purpose}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  const selected = state.staff.find((person) => person.id === selectedId) ?? null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Directory</p>
          <h1>People</h1>
        </div>
        <a className="btn btn-primary" href="#/people/new">
          Add team member
        </a>
      </header>
      <div className="toolbar">
        <label>
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          Department
          <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="all">All departments</option>
            {state.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="split">
        <div className="panel flush">
          {people.length === 0 ? (
            <p className="empty-inline">No people match. Add a team member or clear the search.</p>
          ) : (
            <ul className="task-list">
              {people.map((person) => (
                <li key={person.id}>
                  <a href={`#/people/${person.id}`} aria-current={person.id === selectedId ? 'true' : undefined}>
                    {person.photo ? (
                      <img className="swatch photo" src={person.photo} alt="" />
                    ) : (
                      <span className="swatch" style={{ background: person.appearance.shirt }} />
                    )}
                    <span>
                      <strong>{person.name}</strong>
                      <small>
                        {person.title} · {activityLabel(state, person, now)}
                      </small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          {creating || roleFromHash ? (
            <AddPerson state={state} dispatch={dispatch} roleId={roleFromHash} />
          ) : selected ? (
            <Profile state={state} staffId={selected.id} dispatch={dispatch} now={now} onJoinCall={onJoinCall} />
          ) : (
            <p className="empty-inline">Select someone.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Profile({
  state,
  staffId,
  dispatch,
  now,
  onJoinCall,
}: {
  state: AppState
  staffId: string
  dispatch: (command: Command) => void
  now: number
  onJoinCall?: (threadId: string, memberIds: string[]) => void
}) {
  const person = state.staff.find((item) => item.id === staffId)
  const [responsibilities, setResponsibilities] = useState<string | null>(null)
  const [purpose, setPurpose] = useState<string | null>(null)
  if (!person) return <p className="empty-inline">That person is not on the roster.</p>
  const manager = staffById(state, person.managerId)
  const task = assignmentFor(state, person.id)
  const events = state.events.filter((event) => event.staffId === person.id || event.actorId === person.id).slice(0, 8)
  const reports = state.staff.filter((item) => item.managerId === person.id)
  const active = isStaffActive(state, person)

  return (
    <article>
      <div className="people-hero">
        <Face person={person} className="people-face" />
        <label className="people-photo">
          Change photo
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void readPortrait(file).then((photo) => dispatch({ type: 'UPDATE_STAFF', staffId: person.id, patch: { photo } }))
            }}
          />
        </label>
        {person.photo && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'UPDATE_STAFF', staffId: person.id, patch: { photo: null } })}>
            Remove photo
          </button>
        )}
      </div>
      <p className="eyebrow">{person.title}</p>
      <h2>{person.name}</h2>
      <p>{purpose ?? person.purpose}</p>
      <div className="life-pills">
        <span>{money(person.life.balance)}</span>
        <span>{money(person.life.salary)} pay</span>
        <span>{person.life.marital === 'married' ? `Married${person.life.spouse ? ` · ${person.life.spouse}` : ''}` : 'Single'}</span>
        {person.life.car && <span>Car</span>}
        {person.life.house && <span>House</span>}
      </div>
      <dl className="facts">
        <div>
          <dt>Manager</dt>
          <dd>{manager ? <a href={`#/people/${manager.id}`}>{manager.name}</a> : state.company?.ownerName ?? 'You'}</dd>
        </div>
        <div>
          <dt>On the floor</dt>
          <dd>{active ? activityLabel(state, person, now) : 'Inactive'}</dd>
        </div>
        <div>
          <dt>Current assignment</dt>
          <dd>{task ? <a href={`#/tasks/${task.id}`}>{task.title}</a> : 'None'}</dd>
        </div>
      </dl>
      <h3>Responsibilities</h3>
      <label>
        One per line
        <textarea
          rows={4}
          value={responsibilities ?? person.responsibilities.join('\n')}
          onChange={(event) => setResponsibilities(event.target.value)}
        />
      </label>
      <label>
        Purpose
        <textarea rows={2} value={purpose ?? person.purpose} onChange={(event) => setPurpose(event.target.value)} />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            dispatch({
              type: 'UPDATE_STAFF',
              staffId: person.id,
              patch: {
                purpose: purpose ?? person.purpose,
                responsibilities: (responsibilities ?? person.responsibilities.join('\n')).split('\n'),
              },
            })
          }
        >
          Save role
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => dispatch({ type: 'SET_STAFF_ENABLED', staffId: person.id, enabled: !person.enabled })}
        >
          {person.enabled ? 'Take off the floor' : 'Return to the floor'}
        </button>
        {active && (
          <button type="button" className="btn" onClick={() => onJoinCall?.(directThreadId(person.id), [person.id])}>
            Private call
          </button>
        )}
      </div>
      {reports.length > 0 && (
        <>
          <h3>Team</h3>
          <ul className="plain">
            {reports.map((report) => (
              <li key={report.id}>
                <a href={`#/people/${report.id}`}>{report.name}</a>
                <span className="fine"> · {report.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Access</h3>
      <p className="fine">
        Everyday tools can be used on sample data inside Quorum. Consequential tools only let them ask. You still
        approve each publish, message, purchase, finance change, hire, or desktop request.
      </p>
      <ul className="perms">
        {PERMISSIONS.filter((item) => item.group !== 'desktop').map((item) => (
          <li key={item.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={person.grants[item.id] === true}
                onChange={(event) =>
                  dispatch({
                    type: 'SET_PERMISSION',
                    staffId: person.id,
                    permissionId: item.id as PermissionId,
                    granted: event.target.checked,
                  })
                }
              />
              <span>
                {item.label}
                {item.group === 'consequential' && <small>Approval required · {actionLabel(item.action)}</small>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="desktop-card">
        <h3>Desktop control</h3>
        <p>
          Separate from every other tool. Granting it only lets {person.name.split(' ')[0]} request a session. This
          build has no desktop agent, so the screen stays private and the pointer never moves.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={person.grants['desktop.control'] === true}
            onChange={(event) =>
              dispatch({
                type: 'SET_PERMISSION',
                staffId: person.id,
                permissionId: 'desktop.control',
                granted: event.target.checked,
              })
            }
          />
          May request desktop control
        </label>
        <p className="fine">Session active: no. Agent connected: no.</p>
      </div>
      <h3>Recent activity</h3>
      {events.length === 0 ? (
        <p className="empty-inline">No activity recorded for {person.name} yet.</p>
      ) : (
        <ol className="activity">
          {events.map((event) => (
            <li key={event.id}>
              <time dateTime={event.at}>{formatWhen(event.at, now)}</time>
              <p>{event.message}</p>
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}

function AddPerson({
  state,
  dispatch,
  roleId,
}: {
  state: AppState
  dispatch: (command: Command) => void
  roleId?: string
}) {
  const roles = state.roles.filter((role) => role.enabled)
  const [chosenRole, setChosenRole] = useState(roleId && roles.some((role) => role.id === roleId) ? roleId : roles[0]?.id ?? '')
  const role = roles.find((item) => item.id === chosenRole)
  const [name, setName] = useState('')
  const [title, setTitle] = useState(role?.title ?? '')
  const [purpose, setPurpose] = useState(role?.purpose ?? '')
  const [responsibilities, setResponsibilities] = useState(role?.responsibilities.join('\n') ?? '')
  const managers = state.staff.filter((person) => isStaffActive(state, person))
  const defaultManager = role?.reportsToRoleId
    ? managers.find((person) => person.roleId === role.reportsToRoleId)?.id ?? ''
    : ''
  const [managerId, setManagerId] = useState(defaultManager)

  if (!role) return <p className="empty-inline">Activate a role before adding someone.</p>

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault()
        dispatch({
          type: 'ADD_STAFF',
          input: {
            name,
            title,
            roleId: role.id,
            departmentId: role.departmentId,
            managerId: managerId || null,
            purpose,
            responsibilities: responsibilities.split('\n'),
          },
        })
        window.location.hash = '#/people'
      }}
    >
      <h2>Add a team member</h2>
      <label>
        Role
        <select
          value={role.id}
          onChange={(event) => {
            const next = roles.find((item) => item.id === event.target.value)
            setChosenRole(event.target.value)
            if (!next) return
            setTitle(next.title)
            setPurpose(next.purpose)
            setResponsibilities(next.responsibilities.join('\n'))
            const manager = managers.find((person) => person.roleId === next.reportsToRoleId)
            setManagerId(manager?.id ?? '')
          }}
        >
          {roles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Reports to
        <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
          <option value="">You</option>
          {managers.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Purpose
        <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} />
      </label>
      <label>
        Responsibilities, one per line
        <textarea value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} rows={4} />
      </label>
      <p className="fine">They inherit the role’s default tools. Consequential and desktop access stay off unless that template already allows a request.</p>
      <button type="submit" className="btn btn-primary">
        Add to the team
      </button>
    </form>
  )
}

function readPortrait(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 256
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not draw the photo'))
        return
      }
      const scale = Math.max(size / image.width, size / image.height)
      const width = image.width * scale
      const height = image.height * scale
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That photo could not be read'))
    }
    image.src = url
  })
}
