import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { produceStaffWork } from './work'

const now = 1_700_000_000_000

describe('staff AI work', () => {
  it('drafts role work inside Quorum without claiming an outside send', async () => {
    const state = createSampleState(now)
    const priya = state.staff.find((person) => person.id === 'staff_priya')
    const task = state.tasks.find((item) => item.id === 'task_riverside')
    expect(priya && task).toBeTruthy()
    const deliverable = await produceStaffWork(state, priya!, task!)
    expect(deliverable.text.length).toBeGreaterThan(20)
    expect(deliverable.text.toLowerCase()).not.toMatch(/email was sent|posted to instagram|order was placed/)
    expect(deliverable.result).toBeTruthy()
  })
})
