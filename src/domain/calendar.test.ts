import { describe, expect, it } from 'vitest'
import { monthStart, offeringsFromGoals, planMissing, planProduct, planProductMonth, sizeLabel, weekdayName } from './calendar'
import type { Product } from '../types'

const dock: Product = { id: 'prod_dock', name: 'Dock Pro', kind: 'hardware', fact: 'A desk dock.' }
const os: Product = { id: 'prod_os', name: 'Classroom OS', kind: 'software', fact: 'Offline quiz sync.' }
const books: Product = { id: 'prod_books', name: 'Clinic books', kind: 'service', fact: 'Monthly books for a clinic.' }

describe('content calendar', () => {
  it('plans Feed, Carousel, and Reels for the first three product posts', () => {
    expect(planProduct(dock, 5).map((post) => [post.day, post.platform, post.format, post.size])).toEqual([
      [5, 'instagram', 'flyer', 'feed_square'],
      [6, 'instagram', 'carousel', 'carousel'],
      [7, 'instagram', 'cover', 'reel'],
    ])
    expect(sizeLabel('reel', 'instagram')).toMatch(/Reels/)
    expect(sizeLabel('feed_square', 'instagram')).toMatch(/1080/)
    expect(planProduct(os, 5)[0]?.platform).toBe('instagram')
    expect(planProduct(books, 5)[0]?.platform).toBe('instagram')
  })

  it('builds a detailed month with weekdays and never invents an approval-rule product', () => {
    const month = planProductMonth(dock, 5)
    expect(month).toHaveLength(20)
    expect(month.every((post) => post.weekday && post.sizeLabel && post.caption && post.objective)).toBe(true)
    expect(month.some((post) => post.size === 'reel' && post.platform === 'instagram')).toBe(true)
    expect(month.some((post) => post.format === 'carousel' && post.slides === 4)).toBe(true)
    expect(month.some((post) => post.platform === 'youtube' && post.size === 'thumbnail')).toBe(true)
    expect(weekdayName(1)).toBe('Monday')
    expect(monthStart(5)).toBe(1)
    const products = offeringsFromGoals({
      businessType: 'Professional services',
      goals: [
        { id: 'goal_rule', text: 'Publish nothing externally until you approve the exact copy.' },
        { id: 'goal_work', text: 'Bookkeeping for clinics' },
      ],
    })
    expect(products).toHaveLength(1)
    expect(planMissing(products, [], 5)).toHaveLength(20)
  })
})
