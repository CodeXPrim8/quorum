import { useState } from 'react'
import { getSupabase } from '../cloud/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const db = getSupabase()
    if (!db) {
      setError('Supabase is not configured on this computer.')
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
      if (mode === 'up') {
        const { data, error: failed } = await db.auth.signUp({ email: email.trim(), password })
        if (failed) throw failed
        if (!data.session) {
          setNote('Check that email for a confirm link, then sign in. You can turn confirm-email off in the Supabase Auth settings if this is only you.')
          return
        }
      } else {
        const { error: failed } = await db.auth.signInWithPassword({ email: email.trim(), password })
        if (failed) throw failed
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in did not complete.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <section className="setup-hero">
        <p className="eyebrow">Quorum</p>
        <h1>Sign in to the company.</h1>
        <p>
          Your company is saved on Supabase for this account. The same email on another computer opens the same
          company. Model and voice keys still stay in this browser.
        </p>
      </section>
      <form
        className="setup-form panel"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <h2>{mode === 'in' ? 'Sign in' : 'Create an account'}</h2>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {note && <p className="fine">{note}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'One moment' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setError('')
            setNote('')
          }}
        >
          {mode === 'in' ? 'I need an account' : 'I already have an account'}
        </button>
      </form>
    </div>
  )
}
