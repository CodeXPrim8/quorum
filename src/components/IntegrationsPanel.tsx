import { useState } from 'react'
import type { AppState, Integration } from '../types'

export function IntegrationsPanel({ state }: { state: AppState }) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Connection points</p>
          <h1>Integrations</h1>
          <p className="lede">
            Email, social, bank, and desktop stay disconnected. Company save uses Supabase when you are signed in.
            Cards marked “Demo data” use sample figures. “Not connected” means there is no credential and no client.
          </p>
        </div>
      </header>
      <ul className="integration-grid">
        {state.integrations.map((integration) => (
          <li key={integration.id}>
            <IntegrationCard integration={integration} desktop={state.desktop} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function IntegrationCard({
  integration,
  desktop,
}: {
  integration: Integration
  desktop: AppState['desktop']
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = integration.id === 'desktop'
  return (
    <article className="panel integration">
      <div className="integration-top">
        <h2>{integration.name}</h2>
        <span className={integration.status === 'demo_data' ? 'tag demo' : 'tag'}>
          {integration.status === 'demo_data' ? 'Demo data' : 'Not connected'}
        </span>
      </div>
      <p className="fine">{integration.category}</p>
      <p>{integration.summary}</p>
      <p className="fine">Used by {integration.usedBy}</p>
      {isDesktop && (
        <dl className="facts">
          <div>
            <dt>Agent</dt>
            <dd>{desktop.agentConnected ? 'Connected' : 'Not connected'}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{desktop.sessionActive ? 'Active' : 'No session'}</dd>
          </div>
        </dl>
      )}
      <button type="button" className="btn" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide connection point' : 'View connection point'}
      </button>
      {open && <p className="note">{integration.connectionPoint}</p>}
    </article>
  )
}
