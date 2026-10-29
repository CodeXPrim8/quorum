import { describe, expect, it } from 'vitest'
import { offeringsFromGoals, planProduct } from './calendar'
import type { Product } from '../types'

const dock: Product = { id: 'prod_dock', name: 'Dock Pro', kind: 'hardware', fact: 'A desk dock.' }
const os: Product = { id: 'prod_os', name: 'Classroom OS', kind: 'software', fact: 'Offline quiz sync.' }
const books: Product = { id: 'prod_books', name: 'Clinic books', kind: 'service', fact: 'Monthly books for a clinic.' }

describe('content calendar', () => {
  it('puts each kind of product on the platform that fits it', () => {
    expect(planProduct(dock, 5).map((post) => [post.day, post.platform, post.format])).toEqual([
      [5, 'instagram', 'flyer'],
      [6, 'tiktok', 'cover'],
      [7, 'youtube', 'thumbnail'],
    ])
    expect(planProduct(os, 5).map((post) => post.platform)).toEqual(['youtube', 'instagram', 'tiktok'])
    expect(planProduct(books, 5).map((post) => post.platform)).toEqual(['instagram', 'youtube', 'tiktok'])
  })

  it('does not turn an approval rule into a product', () => {
    const products = offeringsFromGoals({
      businessType: 'Professional services',
      goals: [
        { id: 'goal_rule', text: 'Publish nothing externally until you approve the exact copy.' },
        { id: 'goal_work', text: 'Bookkeeping for clinics' },
      ],
    })
    expect(products).toHaveLength(1)
    expect(products[0]?.kind).toBe('service')
    expect(products[0]?.name).toBe('Bookkeeping for clinics')
  })
})