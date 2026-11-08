import { describe, expect, it } from 'vitest'
import { applyCommand } from '../engine/apply'
import { createSampleState } from '../engine/fixture'
import { nextJob } from './jobs'
import { artCommand, pendingArt } from './studio'

const now = 1_700_000_000_000

describe('design studio jobs', () => {
  it('waits for the photograph before the marketing manager reviews, and does not post', () => {
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'PLAN_CALENDAR' }, now)
    const today = state.calendar.find((post) => post.day === state.clock.day)
    state = applyCommand(state, { type: 'REQUEST_DESIGN', brief: today!.brief, calendarId: today!.id }, now + 1)
    expect(pendingArt(state)?.id).toBe(state.designs[0]?.id)
    expect(nextJob(state, now + 40_000)?.intent).not.toBe('review')
    state = applyCommand(state, artCommand(state.designs[0]!.id, 'data:image/jpeg;base64,abc'), now + 2)
    expect(pendingArt(state)).toBeUndefined()
    expect(nextJob(state, now + 40_000)?.intent).toBe('review')
    expect(state.integrations.find((item) => item.id === 'social')?.status).toBe('in_app')
  })
})
