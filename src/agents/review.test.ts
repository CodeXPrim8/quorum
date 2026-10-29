import { describe, expect, it } from 'vitest'
import type { AppState, Design } from '../types'
import { judgeGraphic } from './review'

function design(patch: Partial<Design>): Design {
  return {
    id: 'design_1',
    title: 'Dock Pro',
    brief: 'One still frame of the product on a desk. A desk dock sold with the Classroom laptop bundle.',
    caption: '',
    svg: '',
    createdById: 'staff_maya',
    status: 'in_review',
    revision: 1,
    calendarId: 'cal_1',
    platform: 'instagram',
    format: 'flyer',
    reviewer: 'marketing',
    ...patch,
  }
}

const state = {
  products: [{ id: 'prod_dock', name: 'Dock Pro', kind: 'hardware', fact: 'A desk dock sold with the Classroom laptop bundle.' }],
  calendar: [{ id: 'cal_1', productId: 'prod_dock', day: 5, title: 'Dock Pro', brief: '', platform: 'instagram', format: 'flyer', status: 'in_review', designId: 'design_1' }],
} as AppState

describe('marketing review', () => {
  it('approves a graphic that keeps the product fact and names a platform', () => {
    expect(judgeGraphic(state, design({})).decision).toBe('approved')
  })

  it('asks for a correction when the claim leaves the product, and declines a live post', () => {
    expect(judgeGraphic(state, design({ brief: 'A holiday sale with half off everything.' })).decision).toBe('changes')
    expect(judgeGraphic(state, design({ brief: 'Publish now on a live account.' })).decision).toBe('declined')
  })
})