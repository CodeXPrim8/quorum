import { describe, expect, it } from 'vitest'
import { requestLines } from './price-lines'

describe('price lines', () => {
  it('lists each thing the customer asked for', () => {
    const lines = requestLines([
      { author: 'client', text: '10 100w lights, on 140w fridge , 1.5hp ac 4 smart TV, PS5, gaming PC rtx5090 i9.' },
      { author: 'client', text: '24/7' },
    ])
    expect(lines).toEqual(['10 100w lights', '140w fridge', '1.5hp ac', '4 smart TV', 'PS5', 'gaming PC rtx5090 i9'])
  })
})
