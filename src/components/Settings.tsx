import { useState } from 'react'
import { rooms } from '../office/layout'
import { reportCadence } from '../domain/reports'
import { invalidSocial, normalizeSocial, type CompanySocial } from '../domain/social'
import { normalizeWebsite } from '../domain/website'
import { SocialFields } from './SocialFields'
import type { AppState, Command, Company, OwnerGender, ReportCadence } from '../types'

export function Settings({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const company = state.company
  const [name, setName] = useState(company?.name ?? '')
  const [businessType, setBusinessType] = useState(company?.businessType ?? '')
  const [ownerName, setOwnerName] = useState(company?.ownerName ?? '')
  const [ownerTitle, setOwnerTitle] = useState<'Chairman' | 'CEO'>(company?.ownerTitle ?? 'Chairman')
  const [ownerGender, setOwnerGender] = useState<OwnerGender | ''>(company?.ownerGender ?? '')
  const [website, setWebsite] = useState(company?.website ?? '')
  const [social, setSocial] = useState<CompanySocial>({
    youtube: company?.social?.youtube ?? '',
    tiktok: company?.social?.tiktok ?? '',
    instagram: company?.social?.instagram ?? '',
    linkedin: company?.social?.linkedin ?? '',
  })
  const [goal, setGoal] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [departmentSummary, setDepartmentSummary] = useState('')
  const [roomId, setRoomId] = useState('flex')
  const [roleTitle, setRoleTitle] = useState('')
  const [rolePurpose, setRolePurpose] = useState('')
  const [roleDepartment, setRoleDepartment] = useState(state.departments[0]?.id ?? '')
  const [reportsTo, setReportsTo] = useState('')
  const [confirm, setConfirm] = useState<'reset' | null>(null)
  if (!company) return null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Company</h1>
          <p className="lede">Departments, roles, and who the managers report to.</p>
        </div>
      </header>
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          if (!ownerGender) return
          if (website.trim() && !normalizeWebsite(website)) return
          if (invalidSocial(social)) return
          dispatch({
            type: 'UPDATE_COMPANY',
            patch: {
              name,
              businessType,
              ownerName,
              ownerTitle,
              ownerGender,
              website: normalizeWebsite(website) ?? '',
              social: normalizeSocial(social) ?? {},
            },
          })
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
          <legend>Gender</legend>
          <label className="check">
            <input type="radio" name="ownerGender" checked={ownerGender === 'male'} onChange={() => setOwnerGender('male')} />
            Male
          </label>
          <label className="check">
            <input type="radio" name="ownerGender" checked={ownerGender === 'female'} onChange={() => setOwnerGender('female')} />
            Female
          </label>
        </fieldset>
        <label>
          Company website
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="example.com"
            inputMode="url"
            autoComplete="url"
          />
        </label>
        <p className="fine">Optional. Goal and tax work read this site when it is filled in.</p>
        <SocialFields
          values={social}
          onChange={(network, value) => setSocial((current) => ({ ...current, [network]: value }))}
        />
        <button type="submit" className="btn btn-primary" disabled={!ownerGender || (website.trim() !== '' && !normalizeWebsite(website)) || Boolean(invalidSocial(social))}>
          Save profile
        </button>
      </form>
      <InvoiceFields company={company} dispatch={dispatch} />
      <section className="panel">
        <h2>Office time</h2>
        <p>Staff match your morning, afternoon, and night. Turn it off to use the office clock.</p>
        <label className="check">
          <input
            type="checkbox"
            checked={state.settings.realTime === true}
            onChange={(event) => dispatch({ type: 'SET_REAL_TIME', value: event.target.checked })}
          />
          Use my local time
        </label>
      </section>
      <section className="panel">
        <h2>Line reports</h2>
        <p className="lede">Staff report to their manager each day. You choose how often you get the compiled report.</p>
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
        <h2>Staff AI</h2>
        <p>
          When agents are working, staff use the model linked under Chat to draft real desk work in Quorum. Outside
          holds (email, social, PR) file inside Quorum and do not hit live networks. Desktop needs an owner-started session. Walks that have started still finish
          if you pause agents.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => dispatch({ type: 'SET_AGENTS', working: !state.settings.agentsWorking })}
        >
          {state.settings.agentsWorking ? 'Pause staff AI' : 'Run staff AI'}
        </button>
      </section>
      <section className="panel">
        <h2>Reset</h2>
        <div className="button-row">
          <button type="button" className="btn btn-danger" onClick={() => setConfirm('reset')}>
            Clear this company
          </button>
        </div>
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

function InvoiceFields({ company, dispatch }: { company: Company; dispatch: (command: Command) => void }) {
  const saved = company.invoiceProfile
  const [bankName, setBankName] = useState(saved?.bankName ?? '')
  const [accountName, setAccountName] = useState(saved?.accountName ?? '')
  const [accountNumber, setAccountNumber] = useState(saved?.accountNumber ?? '')
  const [template, setTemplate] = useState<'classic' | 'plain'>(saved?.template ?? 'classic')
  const [extra, setExtra] = useState(saved?.extra ?? '')
  return (
    <form
      className="panel form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        dispatch({
          type: 'UPDATE_COMPANY',
          patch: {
            invoiceProfile: {
              bankName: bankName.trim(),
              accountName: accountName.trim(),
              accountNumber: accountNumber.trim(),
              template,
              extra: extra.trim(),
            },
          },
        })
      }}
    >
      <h2>Invoice</h2>
      <p>These details are printed on invoices for this company. Fill them in, or leave a line blank if it should not appear.</p>
      <label>
        Bank
        <input value={bankName} onChange={(event) => setBankName(event.target.value)} />
      </label>
      <label>
        Account name
        <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
      </label>
      <label>
        Account number
        <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} />
      </label>
      <label>
        Template
        <select value={template} onChange={(event) => setTemplate(event.target.value as 'classic' | 'plain')}>
          <option value="classic">Classic</option>
          <option value="plain">Plain</option>
        </select>
      </label>
      <label>
        Extra line
        <input value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="Address, tax number, or a payment note" />
      </label>
      <button type="submit" className="btn btn-primary">
        Save invoice details
      </button>
    </form>
  )
}
