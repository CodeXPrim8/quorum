import { useState } from 'react'
import { businessTypePresets, departmentTemplates, roleTemplates } from '../domain/catalog'
import { invalidSocial, normalizeSocial, type CompanySocial } from '../domain/social'
import { normalizeWebsite } from '../domain/website'
import { SocialFields } from './SocialFields'
import type { Command, CompanyInput, OwnerGender } from '../types'

export function Setup({ dispatch }: { dispatch: (command: Command) => void }) {
  const [businessType, setBusinessType] = useState(businessTypePresets[0])
  const [customType, setCustomType] = useState('')
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerTitle, setOwnerTitle] = useState<'Chairman' | 'CEO'>('Chairman')
  const [ownerGender, setOwnerGender] = useState<OwnerGender | ''>('')
  const [website, setWebsite] = useState('')
  const [social, setSocial] = useState<CompanySocial>({})
  const [departments, setDepartments] = useState<string[]>(departmentTemplates.map((item) => item.key))
  const [roles, setRoles] = useState<string[]>(roleTemplates.map((item) => item.key))
  const [openRole, setOpenRole] = useState<string | null>(null)
  const [error, setError] = useState('')

  function toggle(list: string[], key: string, set: (next: string[]) => void) {
    set(list.includes(key) ? list.filter((item) => item !== key) : [...list, key])
  }

  function create() {
    if (!name.trim() || !ownerName.trim() || !ownerGender) {
      setError('Add a company name, your name, and your gender.')
      return
    }
    if (website.trim() && !normalizeWebsite(website)) {
      setError('Enter a website like example.com, or leave it blank.')
      return
    }
    const badSocial = invalidSocial(social)
    if (badSocial) {
      setError('Enter a full social link, or leave it blank.')
      return
    }
    const input: CompanyInput = {
      name,
      businessType: businessType === 'Other' ? customType : businessType,
      goals: [],
      ownerName,
      ownerTitle,
      ownerGender,
      website: normalizeWebsite(website),
      social: normalizeSocial(social),
      appointMd: roles.includes('md'),
      enabledDepartmentKeys: departments,
      enabledRoleKeys: roles,
    }
    if (input.enabledDepartmentKeys.length === 0 || input.enabledRoleKeys.length === 0) {
      setError('Choose at least one department and one role.')
      return
    }
    dispatch({ type: 'CREATE_COMPANY', input })
    window.location.hash = '#/overview'
  }

  const visibleRoles = roleTemplates.filter((role) => role.key === 'md' || departments.includes(role.departmentKey))

  return (
    <div className="setup">
      <section className="setup-hero">
        <p className="eyebrow">Quorum</p>
        <h1>Set up the company.</h1>
        <p>Tell Quorum who you are, then appoint the directors and managers who will run the day.</p>
      </section>
      <form
        className="setup-form panel"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <h2>The company</h2>
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
          Company website
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="example.com"
            inputMode="url"
            autoComplete="url"
          />
        </label>
        <SocialFields
          values={social}
          onChange={(network, value) => setSocial((current) => ({ ...current, [network]: value }))}
        />
        <fieldset>
          <legend>Departments</legend>
          <div className="pick-row">
            {departmentTemplates.map((department) => {
              const on = departments.includes(department.key)
              return (
                <button
                  key={department.key}
                  type="button"
                  className={on ? 'pick on' : 'pick'}
                  aria-pressed={on}
                  onClick={() => toggle(departments, department.key, setDepartments)}
                >
                  {department.name}
                </button>
              )
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend>Roles</legend>
          <p className="fine">Tick a name to appoint them. Click the name to read the role.</p>
          <div className="role-list">
            {visibleRoles.map((role, index) => {
              const department = departmentTemplates.find((item) => item.key === role.departmentKey)
              const previous = visibleRoles[index - 1]
              const showDepartment = department && previous?.departmentKey !== role.departmentKey
              return (
                <div key={role.key}>
                  {showDepartment && <p className="role-dept">{department.name}</p>}
                  <RolePick
                    title={role.title}
                    purpose={role.purpose}
                    responsibilities={role.responsibilities}
                    kpi={role.kpi}
                    checked={roles.includes(role.key)}
                    open={openRole === role.key}
                    onToggle={() => toggle(roles, role.key, setRoles)}
                    onOpen={() => setOpenRole((current) => (current === role.key ? null : role.key))}
                  />
                </div>
              )
            })}
          </div>
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary">
          Create company
        </button>
        <p className="fine">You can rename a role or add your own after the company exists.</p>
      </form>
    </div>
  )
}

function RolePick({
  title,
  purpose,
  responsibilities,
  kpi,
  checked,
  open,
  onToggle,
  onOpen,
}: {
  title: string
  purpose: string
  responsibilities: string[]
  kpi: string
  checked: boolean
  open: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  return (
    <div className={open ? 'role-pick is-open' : 'role-pick'}>
      <div className="role-pick-bar">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Appoint ${title}`} />
        <button type="button" className="role-pick-name" aria-expanded={open} onClick={onOpen}>
          <span>{title}</span>
          <i aria-hidden="true" />
        </button>
      </div>
      <div className="role-fold">
        <div aria-hidden={open ? undefined : true}>
          <p className="role-kpi">
            <span>KPI</span> {kpi}
          </p>
          <p>{purpose}</p>
          <ul>
            {responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
