import { describe, expect, it } from 'vitest'
import { BILLING_PLANS, PLAN_CARDS, billingMonth, ownBill, payoutOf, planOf } from './billing'

describe('billing', () => {
  it('prices Cloud plans after AI and social payout', () => {
    const lite = payoutOf(planOf('lite'))
    const standard = payoutOf(planOf('starter'))
    const pro = payoutOf(planOf('pro'))
    const enterprise = payoutOf(planOf('enterprise'))
    const byok = payoutOf(planOf('byok'))
    expect(lite.total).toBeCloseTo(1.62, 2)
    expect(standard.total).toBeCloseTo(11.6, 1)
    expect(pro.total).toBeCloseTo(42.2, 1)
    expect(enterprise.total).toBeCloseTo(116, 1)
    expect(byok.total).toBe(0)
    expect(planOf('starter').name).toBe('Standard')
    expect(PLAN_CARDS.map((plan) => plan.id)).toEqual(['lite', 'starter', 'pro', 'enterprise'])
    expect(BILLING_PLANS.map((plan) => plan.features.length).every((n) => n >= 4)).toBe(true)
  })

  it('rolls a month of companies into making and paying out', () => {
    const month = billingMonth({ lite: 0, starter: 5, pro: 2, enterprise: 0, byok: 1 })
    expect(month.making).toBe(5 * 39 + 2 * 129 + 19)
    expect(month.paying).toBeCloseTo(5 * 11.6 + 2 * 42.2, 1)
    expect(month.keeping).toBeCloseTo(month.making - month.paying, 1)
    expect(month.social).toBeGreaterThan(0)
  })

  it('bills CLEMX usage separately', () => {
    expect(ownBill({ turns: 400, minutes: 40, photos: 8, handles: 4, publishes: 20 })).toBeCloseTo(16.72, 2)
  })
})
