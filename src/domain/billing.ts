export const VENDOR_COST = {
  turn: 0.004,
  liveMin: 0.1,
  photo: 0.04,
  handle: 2.5,
  publish: 0.04,
}

export type PlanId = 'lite' | 'starter' | 'pro' | 'enterprise' | 'byok'

export type BillingPlan = {
  id: PlanId
  name: string
  price: number
  turns: number
  liveMin: number
  photos: number
  handles: number
  publishes: number
  cloud: boolean
  included: string
  features: string[]
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'lite',
    name: 'Lite',
    price: 5,
    turns: 250,
    liveMin: 5,
    photos: 3,
    handles: 0,
    publishes: 0,
    cloud: true,
    included: '250 turns, 5 Live min, 3 photos, no social',
    features: ['250 chat turns', '5 minutes of Live voice', '3 generated photos', 'No social accounts', 'Posts stay held'],
  },
  {
    id: 'starter',
    name: 'Standard',
    price: 39,
    turns: 800,
    liveMin: 20,
    photos: 5,
    handles: 2,
    publishes: 30,
    cloud: true,
    included: '800 turns, 20 Live min, 5 photos, 2 handles, 30 publishes',
    features: ['800 chat turns', '20 minutes of Live voice', '5 generated photos', '2 connected social handles', '30 publishes'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 129,
    turns: 3000,
    liveMin: 150,
    photos: 40,
    handles: 4,
    publishes: 90,
    cloud: true,
    included: '3,000 turns, 150 Live min, 40 photos, Instagram, TikTok, YouTube, LinkedIn, 90 publishes',
    features: [
      '3,000 chat turns',
      '150 minutes of Live voice',
      '40 generated photos',
      'Instagram, TikTok, YouTube, LinkedIn',
      '90 publishes',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 299,
    turns: 8000,
    liveMin: 600,
    photos: 150,
    handles: 4,
    publishes: 200,
    cloud: true,
    included: '8,000 turns, 600 Live min, 150 photos, 4 handles, 200 publishes',
    features: ['8,000 chat turns', '600 minutes of Live voice', '150 generated photos', '4 connected social handles', '200 publishes'],
  },
  {
    id: 'byok',
    name: 'Bring your key',
    price: 19,
    turns: 0,
    liveMin: 0,
    photos: 0,
    handles: 0,
    publishes: 0,
    cloud: false,
    included: 'Software only. You pay DeepSeek and OpenAI. Handles stay on the company card. Posts stay held.',
    features: ['Software only', 'You pay DeepSeek and OpenAI', 'Handles stay on the company card', 'Posts stay held'],
  },
]

export const PLAN_CARDS = BILLING_PLANS.filter((plan) => plan.cloud)

export function planOf(id: PlanId): BillingPlan {
  return BILLING_PLANS.find((plan) => plan.id === id) ?? BILLING_PLANS[1]!
}

export function isPlanId(value: string): value is PlanId {
  return BILLING_PLANS.some((plan) => plan.id === value)
}

export type PlanPayout = {
  deepseek: number
  live: number
  maya: number
  social: number
  total: number
}

export function payoutOf(plan: BillingPlan): PlanPayout {
  if (!plan.cloud) return { deepseek: 0, live: 0, maya: 0, social: 0, total: 0 }
  const deepseek = plan.turns * VENDOR_COST.turn
  const live = plan.liveMin * VENDOR_COST.liveMin
  const maya = plan.photos * VENDOR_COST.photo
  const social = plan.handles * VENDOR_COST.handle + plan.publishes * VENDOR_COST.publish
  return { deepseek, live, maya, social, total: deepseek + live + maya + social }
}

export type CompanyCounts = Record<PlanId, number>

export function ownBill(input: {
  turns: number
  minutes: number
  photos: number
  handles: number
  publishes: number
}): number {
  return (
    input.turns * VENDOR_COST.turn +
    input.minutes * VENDOR_COST.liveMin +
    input.photos * VENDOR_COST.photo +
    input.handles * VENDOR_COST.handle +
    input.publishes * VENDOR_COST.publish
  )
}

export function billingMonth(counts: CompanyCounts) {
  const rows = BILLING_PLANS.map((plan) => {
    const n = Math.max(0, Math.floor(counts[plan.id] || 0))
    const unit = payoutOf(plan)
    const making = n * plan.price
    const paying = n * unit.total
    return {
      plan,
      n,
      unit,
      making,
      paying,
      keeping: making - paying,
      deepseek: n * unit.deepseek,
      live: n * unit.live,
      maya: n * unit.maya,
      social: n * unit.social,
    }
  })
  return {
    rows,
    making: rows.reduce((sum, row) => sum + row.making, 0),
    paying: rows.reduce((sum, row) => sum + row.paying, 0),
    keeping: rows.reduce((sum, row) => sum + row.keeping, 0),
    deepseek: rows.reduce((sum, row) => sum + row.deepseek, 0),
    live: rows.reduce((sum, row) => sum + row.live, 0),
    maya: rows.reduce((sum, row) => sum + row.maya, 0),
    social: rows.reduce((sum, row) => sum + row.social, 0),
  }
}

export function usd(n: number, digits = 0): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function marginPct(keeping: number, making: number): string {
  if (making <= 0) return '—'
  return `${Math.round((keeping / making) * 100)}%`
}
