import { useState } from 'react'
import { businessTypePresets, departmentTemplates, roleTemplates } from '../domain/catalog'
import type { Command, CompanyInput, OwnerGender } from '../types'

export function Setup({ dispatch }: { dispatch: (command: Command) => void }) {
  const [businessType, setBusinessType] = useState(businessTypePresets[0])
  const [customType, setCustomType] = useState('')
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerTitle, setOwnerTitle] = useState<'Chairman' | 'CEO'>('Chairman')
  const [ownerGender, setOwnerGender] = useState<OwnerGender | ''>('')
  const [goal, setGoal] = useState('')
  const [appointMd, setAppointMd] = useState(true)
  const [departments, setDepartments] = useState<string[]>(departmentTemplates.map((item) => item.key))
  const [roles, setRoles] = useState<string[]>(roleTemplates.map((item) => item.key))
  const [error, setError] = useState('')

  function toggle(list: string[], key: string, set: (next: string[]) => void) {
    set(list.includes(key) ? list.filter((item) => item !== key) : [...list, key])
  }

  function create() {
    if (!name.trim() || !goal.trim() || !ownerName.trim() || !ownerGender) {
      setError('Add a company name, your name, whether you are a woman or a man, and one goal.')
      return
    }
    const input: CompanyInput = {
      name,
      businessType: businessType === 'Other' ? customType : businessType,
      goals: [goal],
      ownerName,
      ownerTitle,
      ownerGender,
      appointMd,
      enabledDepartmentKeys: departments,
      enabledRoleKeys: appointMd ? roles : roles.filter((key) => key !== 'md'),
    }
    if (input.enabledDepartmentKeys.length === 0 || input.enabledRoleKeys.length === 0) {
      setError('Activate at least one department and one role, or open the sample company.')
      return
    }
    dispatch({ type: 'CREATE_COMPANY', input })
    window.location.hash = '#/overview'
  }

  const visibleRoles = roleTemplates.filter((role) => {
    if (role.key === 'md' && !appointMd) return false
    return departments.includes(role.departmentKey)
  })

  return (
    <div className="setup">
      <section className="setup-hero">
        <p className="eyebrow">Quorum</p>
        <h1>Run the company from the chair.</h1>
        <p>
          Appoint AI executives, give them staff, and delegate work. The office moves when a task changes hands — and
          stops when someone is waiting on you.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            dispatch({ type: 'LOAD_SAMPLE' })
            window.location.hash = '#/overview'
          }}
        >
          Open the Northline sample
        </button>
        <p className="fine">
          Northline Supply Co. sells IT hardware, devices, and software. The cast, stock figures, and drafts are sample
          data. With Supabase signed in, that company is saved to your account.
        </p>
      </section>
      <form
        className="setup-form panel"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <h2>Or create a company</h2>
        <label>
          Company name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Your name
          <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required />
        </label>
        <fieldset>
          <legend>Your title</legend>
          <label className="check">
            <input type="radio" name="title" checked={ownerTitle === 'Chairman'} onChange={() => setOwnerTitle('Chairman')} />
            Chairman
          </label>
          <label className="check">
            <input type="radio" name="title" checked={ownerTitle === 'CEO'} onChange={() => setOwnerTitle('CEO')} />
            CEO
          </label>
        </fieldset>
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
        <label>
          Business type
          <select value={businessType} onChange={(event) => setBusinessType(event.target.value)}>
            {businessTypePresets.map((preset) => (
              <option key={preset}>{preset}</option>
            ))}
          </select>
        </label>
        {businessType === 'Other' && (
          <label>
            Describe the business
            <input value={customType} onChange={(event) => setCustomType(event.target.value)} />
          </label>
        )}
        <label>
          First goal
          <input value={goal} onChange={(event) => setGoal(event.target.value)} required />
        </label>
        <label className="check">
          <input type="checkbox" checked={appointMd} onChange={(event) => setAppointMd(event.target.checked)} />
          Appoint an AI Managing Director
        </label>
        <fieldset>
          <legend>Departments</legend>
          {departmentTemplates.map((department) => (
            <label key={department.key} className="check">
              <input
                type="checkbox"
                checked={departments.includes(department.key)}
                onChange={() => toggle(departments, department.key, setDepartments)}
              />
              {department.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Roles</legend>
          {visibleRoles.map((role) => (
            <label key={role.key} className="check">
              <input type="checkbox" checked={roles.includes(role.key)} onChange={() => toggle(roles, role.key, setRoles)} />
              <span>
                {role.title}
                <small>{role.purpose}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary">
          Create company
        </button>
        <p className="fine">
          Roles are a starting library. Rename them, turn them off, or add your own after the company exists. New
          people begin with least-privilege access from the role template.
        </p>
      </form>
    </div>
  )
}
