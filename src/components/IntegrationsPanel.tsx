import { useEffect, useState } from 'react'
import { endDesktopServerSession, startDesktopServerSession } from '../agents/desktop'
import { lookupBook, type BookHit, type TradingVenue } from '../domain/venues'
import type { AppState, Command, CompanyMetaStatus, DesktopMode, Integration } from '../types'

const GROUPS: Array<{ title: string; ids: string[] }> = [
  { title: 'AI', ids: ['staff_brain'] },
  { title: 'Sales and records', ids: ['catalog', 'crm', 'email', 'whatsapp', 'calendar', 'suppliers', 'finance', 'hr'] },
  { title: 'Marketing', ids: ['content_calendar', 'graphics', 'social', 'pr'] },
  { title: 'This computer', ids: ['desktop'] },
]

const LINES: Record<string, string> = {
  staff_brain: 'Drafts the day-to-day work for every role.',
  catalog: 'Products and the facts staff are allowed to repeat.',
  crm: 'Lead and account notes for Sales.',
  email: 'Approved mail stays in the Quorum outbox.',
  whatsapp: 'Each company connects its own WhatsApp Cloud API line. Quorum replies and hands the work to staff.',
  content_calendar: 'A month of posts, sizes, and captions.',
  graphics: 'Promotional graphics and in-house flyers.',
  social: 'Each company connects its own Instagram Business account. Approved posts go live on that account.',
  pr: 'Approved announcements held here.',
  calendar: 'Planning notes kept in Quorum.',
  suppliers: 'Purchase notes filed after you approve them.',
  finance: 'Margin notes and ledger entries.',
  hr: 'Hiring packs filed after you approve them.',
  desktop: 'A visible session on this computer. You start it and you can end it.',
}

function metaFromHash(): URLSearchParams {
  const query = window.location.hash.split('?')[1] ?? ''
  return new URLSearchParams(query)
}

function clearMetaQuery() {
  const path = window.location.hash.split('?')[0] || '#/integrations'
  if (window.location.hash !== path) window.location.hash = path
}

export function IntegrationsPanel({
  state,
  dispatch,
}: {
  state: AppState
  dispatch: (command: Command) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const byId = new Map(state.integrations.map((item) => [item.id, item]))
  const companyId = state.company?.id

  useEffect(() => {
    if (!companyId) return
    let stop = false
    const load = async () => {
      try {
        const response = await fetch(`/api/meta/status?companyId=${encodeURIComponent(companyId)}`)
        if (!response.ok || stop) return
        const data = (await response.json()) as CompanyMetaStatus
        if (!stop) dispatch({ type: 'SET_COMPANY_META', meta: data })
      } catch {
        /* Dev server may be down. */
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 12_000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [companyId, dispatch])

  useEffect(() => {
    const params = metaFromHash()
    const meta = params.get('meta')
    if (!meta) return
    if (meta === 'error') {
      setFlash(params.get('message') || 'Meta connect failed.')
      setOpenId('social')
    } else if (meta === 'instagram') {
      const username = params.get('username')
      setFlash(username ? `Instagram connected as @${username}.` : 'Instagram connected for this company.')
      setOpenId('social')
      if (companyId) {
        void fetch(`/api/meta/status?companyId=${encodeURIComponent(companyId)}`)
          .then((response) => response.json())
          .then((data: CompanyMetaStatus) => dispatch({ type: 'SET_COMPANY_META', meta: data }))
          .catch(() => undefined)
      }
    }
    clearMetaQuery()
  }, [companyId, dispatch])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Connection points</p>
          <h1>Integrations</h1>
          <p className="lede">Open a name to see what it does. Each company connects its own Meta accounts here.</p>
        </div>
      </header>
      <MarketsConnect companyId={companyId} />
      {flash && (
        <p className="note int-flash" role="status">
          {flash}
          <button type="button" className="btn" onClick={() => setFlash(null)}>
            Dismiss
          </button>
        </p>
      )}
      <div className="int-groups">
        {GROUPS.map((group) => {
          const items = group.ids.flatMap((id) => {
            const integration = byId.get(id)
            return integration ? [integration] : []
          })
          if (items.length === 0) return null
          return (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <ul className="int-list">
                {items.map((integration) => (
                  <IntegrationRow
                    key={integration.id}
                    integration={integration}
                    desktop={state.desktop}
                    meta={state.meta}
                    companyId={companyId}
                    dispatch={dispatch}
                    open={openId === integration.id}
                    onOpen={() => setOpenId((current) => (current === integration.id ? null : integration.id))}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function MarketsConnect({ companyId }: { companyId: string | undefined }) {
  const [venues, setVenues] = useState<Array<TradingVenue & { connected: boolean }>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState<BookHit | null>(null)

  const load = async () => {
    if (!companyId) return
    const response = await fetch(`/api/venues/status?companyId=${encodeURIComponent(companyId)}`)
    if (!response.ok) return
    const data = (await response.json()) as { venues?: Array<TradingVenue & { connected: boolean }> }
    setVenues(data.venues ?? [])
  }

  useEffect(() => {
    void load().catch(() => undefined)
  }, [companyId])

  const connect = async (venueId: string, extra?: { name: string; loginUrl: string }) => {
    if (!companyId) {
      setError('Open a company first.')
      return
    }
    setBusy(venueId)
    setError(null)
    try {
      const response = await fetch('/api/venues/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, venueId, name: extra?.name, loginUrl: extra?.loginUrl }),
      })
      const data = (await response.json()) as { loginUrl?: string; error?: string }
      if (!response.ok || !data.loginUrl) throw new Error(data.error || 'Could not connect.')
      window.open(data.loginUrl, '_blank', 'noopener,noreferrer')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect.')
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (venueId: string) => {
    if (!companyId) return
    setBusy(venueId)
    setError(null)
    try {
      const response = await fetch('/api/venues/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, venueId }),
      })
      if (!response.ok) throw new Error('Could not disconnect.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect.')
    } finally {
      setBusy(null)
    }
  }

  const search = () => {
    const found = lookupBook(query)
    setHit(found)
    if (!found) setError('Type a bookmaker name or paste its web address.')
    else setError(null)
  }

  const trading = venues.filter((venue) => venue.market !== 'sports')
  const books = venues.filter((venue) => venue.market === 'sports')
  const hitVisible = hit && !books.some((venue) => venue.id === hit.id)

  return (
    <>
      <section className="markets-gallery">
        <h2>Trading platforms</h2>
        <p className="lede">
          Click Connect and log in. Quorum stays linked and can trade on that account until you Disconnect. Live orders still wait for your approval. Nothing is withdrawn.
        </p>
        <VenueList venues={trading} busy={busy} companyId={companyId} connect={connect} disconnect={disconnect} />
      </section>
      <section className="markets-gallery">
        <h2>Bookmakers</h2>
        <p className="lede">
          Near-sure pattern from the research. You approve the stake. The link lasts until Disconnect. Quorum will not call a bet a guaranteed win.
        </p>
        <form
          className="book-search"
          onSubmit={(event) => {
            event.preventDefault()
            search()
          }}
        >
          <input
            aria-label="Search bookmakers"
            placeholder="Search a bookmaker or paste its address"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="btn">
            Search
          </button>
        </form>
        {hitVisible && hit && (
          <div className="int-row">
            <div className="int-bar">
              <strong>{hit.name}</strong>
              <span className="fine">{hit.listed ? 'Listed' : 'Use this address, or paste the login page'}</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === hit.id || !companyId}
                onClick={() => void connect(hit.id, hit.listed ? undefined : { name: hit.name, loginUrl: hit.loginUrl })}
              >
                Connect
              </button>
            </div>
          </div>
        )}
        <VenueList venues={books} busy={busy} companyId={companyId} connect={connect} disconnect={disconnect} />
        {error && <p className="note">{error}</p>}
      </section>
    </>
  )
}

function VenueList({
  venues,
  busy,
  companyId,
  connect,
  disconnect,
}: {
  venues: Array<TradingVenue & { connected: boolean }>
  busy: string | null
  companyId: string | undefined
  connect: (venueId: string, extra?: { name: string; loginUrl: string }) => Promise<void>
  disconnect: (venueId: string) => Promise<void>
}) {
  return (
    <ul className="int-list">
      {venues.map((venue) => (
        <li key={venue.id} className="int-row">
          <div className="int-bar">
            <strong>{venue.name}</strong>
            <span className="fine">{venue.market === 'crypto' ? 'Crypto' : venue.market === 'forex' ? 'Forex' : 'Sports'}</span>
            <span className={venue.connected ? 'tag on' : 'tag'}>{venue.connected ? 'Connected' : 'Not connected'}</span>
            {venue.connected ? (
              <button type="button" className="btn" disabled={busy === venue.id} onClick={() => void disconnect(venue.id)}>
                Disconnect
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy === venue.id || !companyId} onClick={() => void connect(venue.id)}>
                Connect
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function IntegrationRow({
  integration,
  desktop,
  meta,
  companyId,
  dispatch,
  open,
  onOpen,
}: {
  integration: Integration
  desktop: AppState['desktop']
  meta: CompanyMetaStatus | undefined
  companyId: string | undefined
  dispatch: (command: Command) => void
  open: boolean
  onOpen: () => void
}) {
  const [mode, setMode] = useState<DesktopMode>('approved')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDesktop = integration.id === 'desktop'
  const isWhatsApp = integration.id === 'whatsapp'
  const isSocial = integration.id === 'social'
  const channelConnected =
    (isWhatsApp && meta?.whatsapp.connected) || (isSocial && meta?.instagram.connected) || false
  const statusLabel =
    isDesktop && desktop.sessionActive
      ? 'Session on'
      : isDesktop && !desktop.agentConnected
        ? 'Agent offline'
        : (isWhatsApp || isSocial) && channelConnected
          ? 'Connected'
          : (isWhatsApp || isSocial) && meta
            ? 'Not connected'
            : integration.status === 'in_app'
              ? 'Active'
              : 'Not connected'

  const startSession = async () => {
    setBusy(true)
    setError(null)
    try {
      await startDesktopServerSession()
      dispatch({ type: 'START_DESKTOP_SESSION', mode })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the desktop session.')
    } finally {
      setBusy(false)
    }
  }

  const endSession = async () => {
    setBusy(true)
    setError(null)
    try {
      await endDesktopServerSession()
      dispatch({ type: 'END_DESKTOP_SESSION' })
    } catch (err) {
      dispatch({ type: 'END_DESKTOP_SESSION' })
      setError(err instanceof Error ? err.message : 'Session ended locally.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={open ? 'int-row is-open' : 'int-row'}>
      <button type="button" className="int-bar" aria-expanded={open} onClick={onOpen}>
        <strong>{integration.name}</strong>
        <span
          className={
            integration.status === 'in_app' ||
            (isDesktop && desktop.sessionActive) ||
            channelConnected
              ? 'tag on'
              : 'tag'
          }
        >
          {statusLabel}
        </span>
      </button>
      <div className="int-fold">
        <div aria-hidden={!open}>
          <p>{LINES[integration.id] ?? integration.connectionPoint}</p>
          {isSocial && (
            <InstagramConnect
              companyId={companyId}
              meta={meta}
              dispatch={dispatch}
            />
          )}
          {isWhatsApp && (
            <WhatsAppConnect
              companyId={companyId}
              meta={meta}
              dispatch={dispatch}
            />
          )}
          {isDesktop && (
            <>
              <dl className="facts">
                <div>
                  <dt>Agent</dt>
                  <dd>{desktop.agentConnected ? 'Connected' : 'Not connected'}</dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>{desktop.sessionActive ? 'Active' : 'No session'}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{desktop.mode === 'live' ? 'Live' : desktop.mode === 'approved' ? 'Approved' : '—'}</dd>
                </div>
              </dl>
              {desktop.sessionActive ? (
                <div className="desktop-actions">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void endSession()}>
                    End session
                  </button>
                </div>
              ) : (
                <div className="desktop-actions">
                  <fieldset className="desktop-modes" disabled={busy || !desktop.agentConnected}>
                    <legend>Session mode</legend>
                    <label className="check">
                      <input type="radio" name="desktop-mode" checked={mode === 'approved'} onChange={() => setMode('approved')} />
                      Approved
                    </label>
                    <label className="check">
                      <input type="radio" name="desktop-mode" checked={mode === 'live'} onChange={() => setMode('live')} />
                      Live
                    </label>
                  </fieldset>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !desktop.agentConnected}
                    onClick={() => void startSession()}
                  >
                    Start session
                  </button>
                </div>
              )}
              {error && <p className="note">{error}</p>}
            </>
          )}
        </div>
      </div>
    </li>
  )
}

function InstagramConnect({
  companyId,
  meta,
  dispatch,
}: {
  companyId: string | undefined
  meta: CompanyMetaStatus | undefined
  dispatch: (command: Command) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ig = meta?.instagram
  const connected = ig?.connected === true

  const connect = () => {
    if (!companyId) {
      setError('Open a company first.')
      return
    }
    window.location.href = `/api/meta/instagram/connect?companyId=${encodeURIComponent(companyId)}`
  }

  const disconnect = async () => {
    if (!companyId) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/meta/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, channel: 'instagram' }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Disconnect failed.')
      const status = await fetch(`/api/meta/status?companyId=${encodeURIComponent(companyId)}`).then(
        (res) => res.json() as Promise<CompanyMetaStatus>,
      )
      dispatch({ type: 'SET_COMPANY_META', meta: status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="desktop-actions meta-connect">
      <dl className="facts">
        <div>
          <dt>Account</dt>
          <dd>
            {connected
              ? ig?.username
                ? `@${ig.username}`
                : ig?.accountId || 'Connected'
              : 'Not connected'}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{ig?.source === 'company' ? 'This company' : ig?.source === 'env' ? 'Server .env fallback' : '—'}</dd>
        </div>
        <div>
          <dt>Image host</dt>
          <dd>{meta?.canHost ? 'Ready' : 'Needs META_PUBLIC_BASE (https)'}</dd>
        </div>
      </dl>
      {!meta?.appReady && (
        <p className="note">
          Platform setup: set META_APP_ID, META_APP_SECRET, META_ENCRYPT_KEY, and META_PUBLIC_BASE on the server, then
          restart. Each company then connects its own Instagram here — not a shared personal account.
        </p>
      )}
      <div className="meta-actions">
        {connected && ig?.source === 'company' ? (
          <button type="button" className="btn" disabled={busy || !companyId} onClick={() => void disconnect()}>
            Disconnect Instagram
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!companyId || !meta?.appReady}
            onClick={connect}
          >
            Connect Instagram
          </button>
        )}
      </div>
      {error && <p className="note">{error}</p>}
    </div>
  )
}

function WhatsAppConnect({
  companyId,
  meta,
  dispatch,
}: {
  companyId: string | undefined
  meta: CompanyMetaStatus | undefined
  dispatch: (command: Command) => void
}) {
  const [token, setToken] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [displayPhone, setDisplayPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wa = meta?.whatsapp
  const connected = wa?.connected === true

  const save = async () => {
    if (!companyId) {
      setError('Open a company first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/meta/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, token, phoneNumberId, displayPhone: displayPhone || undefined }),
      })
      const data = (await response.json()) as { error?: string; whatsapp?: CompanyMetaStatus['whatsapp'] } & Partial<CompanyMetaStatus>
      if (!response.ok) throw new Error(data.error || 'WhatsApp could not be saved.')
      const status = await fetch(`/api/meta/status?companyId=${encodeURIComponent(companyId)}`).then(
        (res) => res.json() as Promise<CompanyMetaStatus>,
      )
      dispatch({ type: 'SET_COMPANY_META', meta: status })
      setToken('')
      setPhoneNumberId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'WhatsApp could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!companyId) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/meta/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, channel: 'whatsapp' }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Disconnect failed.')
      const status = await fetch(`/api/meta/status?companyId=${encodeURIComponent(companyId)}`).then(
        (res) => res.json() as Promise<CompanyMetaStatus>,
      )
      dispatch({ type: 'SET_COMPANY_META', meta: status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="desktop-actions meta-connect">
      <dl className="facts">
        <div>
          <dt>Line</dt>
          <dd>
            {connected
              ? wa?.displayPhone || wa?.phoneNumberId || 'Connected'
              : 'Not connected'}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{wa?.source === 'company' ? 'This company' : wa?.source === 'env' ? 'Server .env fallback' : '—'}</dd>
        </div>
      </dl>
      {connected && wa?.source === 'company' ? (
        <div className="meta-actions">
          <button type="button" className="btn" disabled={busy || !companyId} onClick={() => void disconnect()}>
            Disconnect WhatsApp
          </button>
        </div>
      ) : (
        <form
          className="meta-form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label>
            Cloud API token
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </label>
          <label>
            Phone number id
            <input
              type="text"
              autoComplete="off"
              value={phoneNumberId}
              onChange={(event) => setPhoneNumberId(event.target.value)}
              required
            />
          </label>
          <label>
            Display number (optional)
            <input
              type="text"
              autoComplete="off"
              value={displayPhone}
              onChange={(event) => setDisplayPhone(event.target.value)}
              placeholder="+1 …"
            />
          </label>
          <p className="note">
            Paste this company’s WhatsApp Cloud API credentials. Tokens are encrypted on the server. Webhook verify still
            uses the platform WHATSAPP_VERIFY_TOKEN in .env.
          </p>
          <button type="submit" className="btn btn-primary" disabled={busy || !companyId || !token || !phoneNumberId}>
            Save WhatsApp line
          </button>
        </form>
      )}
      {error && <p className="note">{error}</p>}
    </div>
  )
}
