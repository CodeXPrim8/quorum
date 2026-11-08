import { SOCIAL_NETWORKS, socialLabel, socialPlaceholder, type CompanySocial, type SocialNetwork } from '../domain/social'

export function SocialFields({
  values,
  onChange,
}: {
  values: CompanySocial
  onChange: (network: SocialNetwork, value: string) => void
}) {
  return (
    <fieldset className="social-accounts">
      <legend>Social accounts</legend>
      <div className="social-list">
        {SOCIAL_NETWORKS.map((network) => (
          <div className="social-row" key={network}>
            <SocialMark network={network} />
            <span className="social-name">{socialLabel(network)}</span>
            <input
              value={values[network] ?? ''}
              onChange={(event) => onChange(network, event.target.value)}
              placeholder={socialPlaceholder(network)}
              aria-label={socialLabel(network)}
              inputMode="url"
              autoComplete="url"
            />
          </div>
        ))}
      </div>
    </fieldset>
  )
}

function SocialMark({ network }: { network: SocialNetwork }) {
  return (
    <span className={`social-mark social-mark-${network}`} aria-hidden="true">
      {network === 'youtube' && (
        <svg viewBox="0 0 24 24">
          <path fill="#fff" d="M10 8.5v7l6-3.5-6-3.5z" />
        </svg>
      )}
      {network === 'tiktok' && (
        <svg viewBox="0 0 24 24">
          <path
            fill="#fff"
            d="M14.2 3.2c.5 2.4 1.8 3.8 4.1 4v2.4c-1.4 0-2.7-.4-4-1.2v6.4c0 3.3-2.6 5.8-6 5.8S2.4 18.1 2.4 14.8c0-3.2 2.5-5.7 5.7-5.8v2.6c-1.7.1-3 1.5-3 3.2 0 1.8 1.4 3.2 3.2 3.2s3.2-1.4 3.2-3.2V3.2h2.7z"
          />
        </svg>
      )}
      {network === 'instagram' && (
        <svg viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="17" cy="7" r="1" fill="#fff" />
        </svg>
      )}
      {network === 'linkedin' && (
        <svg viewBox="0 0 24 24">
          <path fill="#fff" d="M7.2 9.4H4.4V19h2.8V9.4zM5.8 4.6A1.7 1.7 0 1 0 5.8 8a1.7 1.7 0 0 0 0-3.4zM19.6 19h-2.8v-5.1c0-1.4-.6-2.2-1.7-2.2-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V19h-2.8s.04-8.3 0-9.6h2.8v1.6c.4-.7 1.3-1.8 3.2-1.8 2.2 0 3.3 1.4 3.3 4.2V19z" />
        </svg>
      )}
    </span>
  )
}
