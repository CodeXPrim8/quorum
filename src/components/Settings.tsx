import { useState } from 'react'
import { rooms } from '../office/layout'
import { reportCadence } from '../domain/reports'
import type { AppState, Command, OwnerGender, ReportCadence } from '../types'

export function Settings({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const company = state.company
  const [name, setName] = useState(company?.name ?? '')
  const [businessType, setBusinessType] = useState(company?.businessType ?? '')
  const [ownerName, setOwnerName] = useState(company?.ownerName ?? '')
  const [ownerTitle, setOwnerTitle] = useState<'Chairman' | 'CEO'>(company?.ownerTitle ?? 'Chairman')
  const [ownerGender, setOwnerGender] = useState<OwnerGender | ''>(company?.ownerGender ?? '')
  const [goal, setGoal] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [departmentSummary, setDepartmentSummary] = useState('')
  const [roomId, setRoomId] = useState('flex')
  const [roleTitle, setRoleTitle] = useState('')
  const [rolePurpose, setRolePurpose] = useState('')
  const [roleDepartment, setRoleDepartment] = useState(state.departments[0]?.id ?? '')
  const [reportsTo, setReportsTo] = useState('')
  const [confirm, setConfirm] = useState<'sample' | 'reset' | null>(null)
  if (!company) return null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Company</h1>
          <p className="lede">Departments, roles, and who the managers report to. The sample cast is only one setup.</p>
        </div>
      </header>
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          if (!ownerGender) return
          dispatch({ type: 'UPDATE_COMPANY', patch: { name, businessType, ownerName, ownerTitle, ownerGender } })
        }}
      >
        <h2>Profile</h2>
        <label>
          Company name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Business type
          <input value={businessType} onChange={(event) => setBusinessType(event.target.value)} />
        </label>
        <label>
          Your name
          <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} />
        </label>
        <label>
          Title
          <select value={ownerTitle} onChange={(event) => setOwnerTitle(event.target.value as 'Chairman' | 'CEO')}>
            <option>Chairman</option>
            <option>CEO</option>
          </select>
        </label>
        <fieldset>
          <legend>You are</legend>
          <label className="check">
            <input type="radio" name="ownerGender" checked={ownerGender === 'male'} onChange={() => setOwnerGender('male')} />
            A man — staff address you as sir
          </label>
          <label className="check">
            <input type="radio" name="ownerGender" checked={ownerGender === 'female'} onChange={() => setOwnerGender('female')} />
            A woman — staff address you as ma
          </label>
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={!ownerGender}>
          Save profile
        </button>
      </form>
      <section className="panel">
        <h2>Line reports</h2>
        <p className="lede">Staff file to their manager at close every office day. You choose how often those managers send the compiled report to you. The notes stay in this browser.</p>
        <label>
          Send compiled reports to me
          <select
            value={reportCadence(state)}
            onChange={(event) => dispatch({ type: 'SET_REPORT_CADENCE', cadence: event.target.value as ReportCadence })}
          >
            <option value="daily">Every office day</option>
            <option value="weekly">Once a week</option>
            <option value="monthly">Once a month</option>
          </select>
        </label>
      </section>
      <section className="panel">
        <h2>Goals</h2>
        <ul className="plain">
          {company.goals.map((item) => (
            <li key={item.id}>
              {item.text}{' '}
              <button type="button" className="linkish" onClick={() => dispatch({ type: 'REMOVE_GOAL', goalId: item.id })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        {company.goals.length === 0 && <p className="empty-inline">Add a goal so the overview has somewhere to point.</p>}
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({ type: 'ADD_GOAL', text: goal })
            setGoal('')
          }}
        >
          <label>
            New goal
            <input value={goal} onChange={(event) => setGoal(event.target.value)} />
          </label>
          <button type="submit" className="btn">
            Add goal
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Management</h2>
        <p>
          {company.management === 'managing_director'
            ? 'An AI Managing Director coordinates the other executives.'
            : 'You manage the executives directly.'}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() =>
            dispatch({
              type: 'SET_MANAGEMENT',
              mode: company.management === 'managing_director' ? 'direct' : 'managing_director',
            })
          }
        >
          {company.management === 'managing_director' ? 'Manage directly' : 'Appoint a Managing Director'}
        </button>
      </section>
      <section className="panel">
        <h2>Departments</h2>
        <ul className="perms">
          {state.departments.map((department) => (
            <li key={department.id}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={department.enabled}
                  onChange={(event) =>
                    dispatch({ type: 'SET_DEPARTMENT', departmentId: department.id, enabled: event.target.checked })
                  }
                />
                <span>
                  {department.name}
                  <small>{department.summary}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({ type: 'ADD_DEPARTMENT', name: departmentName, summary: departmentSummary, roomId })
            setDepartmentName('')
            setDepartmentSummary('')
          }}
        >
          <h3>Add a department</h3>
          <label>
            Name
            <input value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} required />
          </label>
          <label>
            What it is for
            <input value={departmentSummary} onChange={(event) => setDepartmentSummary(event.target.value)} />
          </label>
          <label>
            Room
            <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              {rooms.filter((room) => room.id !== 'owner').map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">
            Add department
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Roles</h2>
        <ul className="perms">
          {state.roles.map((role) => {
            const reports = state.roles.find((item) => item.id === role.reportsToRoleId)
            return (
              <li key={role.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={role.enabled}
                    onChange={(event) => dispatch({ type: 'SET_ROLE', roleId: role.id, enabled: event.target.checked })}
                  />
                  <span>
                    {role.title}
                    <small>
                      {role.purpose} Reports to {reports?.title ?? 'you'}.
                    </small>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({
              type: 'ADD_ROLE',
              input: {
                title: roleTitle,
                purpose: rolePurpose,
                responsibilities: [],
                departmentId: roleDepartment,
                reportsToRoleId: reportsTo || null,
              },
            })
            setRoleTitle('')
            setRolePurpose('')
          }}
        >
          <h3>Add a role</h3>
          <label>
            Title
            <input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} required />
          </label>
          <label>
            Purpose
            <input value={rolePurpose} onChange={(event) => setRolePurpose(event.target.value)} />
          </label>
          <label>
            Department
            <select value={roleDepartment} onChange={(event) => setRoleDepartment(event.target.value)}>
              {state.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reports to
            <select value={reportsTo} onChange={(event) => setReportsTo(event.target.value)}>
              <option value="">You</option>
              {state.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">
            Add role
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Demo engine</h2>
        <p>
          The engine advances sample playbooks already in progress. It does not call a model and it does not leave this
          browser. Walks that have started still finish when the engine is paused.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => dispatch({ type: 'SET_ENGINE', running: !state.settings.engineRunning })}
        >
          {state.settings.engineRunning ? 'Pause demo engine' : 'Run demo engine'}
        </button>
      </section>
      <section className="panel">
        <h2>Replace or reset</h2>
        <div className="button-row">
          <button type="button" className="btn" onClick={() => setConfirm('sample')}>
            Replace with the Northline sample
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setConfirm('reset')}>
            Clear this company
          </button>
        </div>
        {confirm === 'sample' && (
          <div className="note">
            <p>This replaces the current company, tasks, and audit log in this browser.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                dispatch({ type: 'LOAD_SAMPLE' })
                setConfirm(null)
                window.location.hash = '#/overview'
              }}
            >
              Yes, load Northline
            </button>
          </div>
        )}
        {confirm === 'reset' && (
          <div className="note">
            <p>This removes the company from this browser and returns to setup.</p>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                dispatch({ type: 'RESET' })
                setConfirm(null)
                window.location.hash = '#/setup'
              }}
            >
              Yes, clear it
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
