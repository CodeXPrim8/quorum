import { PLAN_CARDS, planOf, usd } from '../domain/billing'
import type { Command, Company } from '../types'

export function Billing({
  company,
  dispatch,
}: {
  company: Company
  dispatch: (command: Command) => void
}) {
  const current = company.planId ?? 'starter'
  const currentPrice = planOf(current).price
  const byok = planOf('byok')
  const byokOn = current === 'byok'

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Billing</h1>
          <p className="lede">Pick a plan for {company.name}. USD per month.</p>
        </div>
      </header>

      <div className="plan-grid">
        {PLAN_CARDS.map((plan) => {
          const on = plan.id === current
          const action = on ? 'Current plan' : plan.price > currentPrice ? 'Upgrade' : 'Switch'
          return (
            <article key={plan.id} className={on ? 'plan-card is-current' : 'plan-card'}>
              <header className="plan-card-head">
                <strong>{plan.name}</strong>
                {on && <span className="plan-tag">Current</span>}
              </header>
              <p className="plan-price">
                {usd(plan.price)} <small>/ mo</small>
              </p>
              <ul>
                {plan.features.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button
                type="button"
                className={on ? 'btn' : 'btn btn-primary'}
                disabled={on}
                onClick={() => dispatch({ type: 'SET_BILLING_PLAN', planId: plan.id })}
              >
                {action}
              </button>
            </article>
          )
        })}
      </div>

      <div className={byokOn ? 'plan-option is-current' : 'plan-option'}>
        <div>
          <strong>Bring your key</strong>
          {byokOn && <span className="plan-tag">Current</span>}
          <p>
            Software only. You pay DeepSeek and OpenAI. Handles stay on the company card. Posts stay held. {usd(byok.price)} / mo.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={byokOn}
          onClick={() => dispatch({ type: 'SET_BILLING_PLAN', planId: 'byok' })}
        >
          {byokOn ? 'Current option' : 'Use this option'}
        </button>
      </div>
    </div>
  )
}
