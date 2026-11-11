import { useState } from 'react'
import { getSupabase } from '../cloud/supabase'
import { businessTypePresets, departmentTemplates, roleTemplates } from '../domain/catalog'
import { invalidSocial, normalizeSocial, type CompanySocial } from '../domain/social'
import { normalizeWebsite } from '../domain/website'
import { PENDING_COMPANY_KEY } from '../store/Store'
import { SocialFields } from './SocialFields'
import type { Command, CompanyInput, OwnerGender } from '../types'

export function Setup({
  dispatch,
  needsAccount = false,
  account,
  onSignOut,
}: {
  dispatch: (command: Command) => void
  needsAccount?: boolean
  account?: string
  onSignOut?: () => void
}) {
  const [businessType, setBusinessType] = useState(businessTypePresets[0])
  const [customType, setCustomType] = useState('')
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerTitle, setOwnerTitle] = useState<'Chairman' | 'CEO'>('Chairman')
  const [ownerGender, setOwnerGender] = useState<OwnerGender | ''>('')
  const [website, setWebsite] = useState('')
  const [social, setSocial] = useState<CompanySocial>({})
  const [departments, setDepartments] = useState<string[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [openRole, setOpenRole] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [accountMode, setAccountMode] = useState<'up' | 'in'>('up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  function toggleDepartment(key: string) {
    const next = departments.includes(key) ? departments.filter((item) => item !== key) : [...departments, key]
    setDepartments(next)
    if (!next.includes(key)) {
      const drop = new Set(roleTemplates.filter((role) => role.departmentKey === key).map((role) => role.key))
      setRoles((current) => current.filter((item) => !drop.has(item)))
    }
  }

  function toggle(list: string[], key: string, set: (next: string[]) => void) {
    set(list.includes(key) ? list.filter((item) => item !== key) : [...list, key])
  }

  function companyInput(): CompanyInput | null {
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
      setError('Choose the departments and roles you want. Nothing is selected until you tick it.')
      return null
    }
    return input
  }

  async function create() {
    if (needsAccount && accountMode === 'in') {
      const db = getSupabase()
      if (!db) {
        setError('Account sign-in is not configured on this computer.')
        return
      }
      if (!email.trim() || password.length < 6) {
        setError('Use your email and a password of at least six characters.')
        return
      }
      setBusy(true)
      setError('')
      setNote('')
      try {
        sessionStorage.removeItem(PENDING_COMPANY_KEY)
        const { error: failed } = await db.auth.signInWithPassword({ email: email.trim(), password })
        if (failed) throw failed
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign in did not complete.')
      } finally {
        setBusy(false)
      }
      return
    }
    const input = companyInput()
    if (!input) return
    if (!needsAccount) {
      dispatch({ type: 'CREATE_COMPANY', input })
      window.location.hash = '#/overview'
      return
    }
    const db = getSupabase()
    if (!db) {
      setError('Account sign-up is not configured on this computer.')
      return
    }
    if (!email.trim() || password.length < 6) {
      setError('Use your email and a password of at least six characters.')
      return
    }
    if (password !== confirm) {
      setError('Enter the same password in both fields.')
      return
    }
    setBusy(true)
    setError('')
    setNote('')
    try {
      sessionStorage.setItem(PENDING_COMPANY_KEY, JSON.stringify(input))
      const { data, error: failed } = await db.auth.signUp({ email: email.trim(), password })
      if (failed) throw failed
      if (!data.session) {
        setNote('Check that email for a confirm link, then come back and sign in. The company you chose will be created then.')
      }
    } catch (err) {
      sessionStorage.removeItem(PENDING_COMPANY_KEY)
      setError(err instanceof Error ? err.message : 'The account could not be created.')
    } finally {
      setBusy(false)
    }
  }

  const visibleRoles = roleTemplates.filter((role) => departments.includes(role.departmentKey))

  return (
    <div className="setup">
      <section className="setup-hero">
        <p className="eyebrow">QSI</p>
        <h1>Set up the company.</h1>
        <p>
          {needsAccount && accountMode === 'in'
            ? 'Sign in with the email and password you already created.'
            : needsAccount
              ? 'First time here, create an account with your email and a password. Then tick only the roles you want.'
              : 'Tick only the departments and roles you want. Nothing is selected for you.'}
        </p>
        {onSignOut && (
          <p className="setup-session">
            {account && <span>Signed in as {account}</span>}
            <button type="button" className="btn" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        )}
      </section>
      <form
        className="setup-form panel"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        {needsAccount && (
          <>
            <div className="account-switch" role="group" aria-label="Account">
              <button
                type="button"
                className={accountMode === 'up' ? 'btn on' : 'btn'}
                aria-pressed={accountMode === 'up'}
                onClick={() => {
                  setAccountMode('up')
                  setError('')
                  setNote('')
                }}
              >
                Create account
              </button>
              <button
                type="button"
                className={accountMode === 'in' ? 'btn on' : 'btn'}
                aria-pressed={accountMode === 'in'}
                onClick={() => {
                  setAccountMode('in')
                  setError('')
                  setNote('')
                }}
              >
                Sign in
              </button>
            </div>
            <h2>{accountMode === 'up' ? 'Create your account' : 'Sign in'}</h2>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <SecretField
              label="Password"
              value={password}
              onChange={setPassword}
              shown={showPassword}
              onToggle={() => setShowPassword((current) => !current)}
              autoComplete={accountMode === 'up' ? 'new-password' : 'current-password'}
            />
            {accountMode === 'up' && (
              <SecretField
                label="Confirm password"
                value={confirm}
                onChange={setConfirm}
                shown={showConfirm}
                onToggle={() => setShowConfirm((current) => !current)}
                autoComplete="new-password"
              />
            )}
          </>
        )}
        {(accountMode === 'up' || !needsAccount) && (
        <>
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
          <p className="fine">Choose the ones you want. None are on until you select them.</p>
          <div className="pick-row">
            {departmentTemplates.map((department) => {
              const on = departments.includes(department.key)
              return (
                <button
                  key={department.key}
                  type="button"
                  className={on ? 'pick on' : 'pick'}
                  aria-pressed={on}
                  onClick={() => toggleDepartment(department.key)}
                >
                  {department.name}
                </button>
              )
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend>Roles</legend>
          <p className="fine">Tick only the people you want. Click a name to read the role. None start selected.</p>
          {visibleRoles.length === 0 && <p className="fine">Select a department to see its roles.</p>}
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
        </>
        )}
        {error && <p className="form-error">{error}</p>}
        {note && <p className="fine">{note}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'One moment' : needsAccount && accountMode === 'in' ? 'Sign in' : needsAccount ? 'Create account and company' : 'Create company'}
        </button>
        {accountMode === 'up' && <p className="fine">You can rename a role or add your own after the company exists.</p>}
      </form>
    </div>
  )
}

function SecretField({
  label,
  value,
  onChange,
  shown,
  onToggle,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  shown: boolean
  onToggle: () => void
  autoComplete: string
}) {
  return (
    <label>
      {label}
      <span className="secret">
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={6}
          required
        />
        <button
          type="button"
          className="secret-toggle"
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          onClick={onToggle}
        >
          <Eye open={shown} />
        </button>
      </span>
    </label>
  )
}

function Eye({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {open ? (
        <>
          <path d="M3 3l18 18" strokeLinecap="round" />
          <path d="M10.5 6.2A10 10 0 0 1 12 6c6.2 0 10 6 10 6a17 17 0 0 1-3.1 3.7" strokeLinecap="round" />
          <path d="M6.2 6.8C3.7 8.4 2 12 2 12s3.8 6 10 6c1.5 0 2.9-.3 4.1-.8" strokeLinecap="round" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
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
