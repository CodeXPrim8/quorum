import { describe, expect, it } from 'vitest'
import { applyCommand } from '../engine/apply'
import { createSampleState } from '../engine/fixture'
import { directThreadId } from '../chat/threads'
import { badgeCount, handUp, unreadFrom, unreadIn } from './attention'

const now = 1_700_000_000_000

describe('staff attention', () => {
  it('counts unread messages after the owner last opened the chat', () => {
    let state = createSampleState(now)
    const threadId = directThreadId('staff_morgan')
    state = applyCommand(state, { type: 'READ_THREAD', threadId }, now)
    expect(unreadFrom(state, 'staff_morgan')).toBe(0)
    state = applyCommand(
      state,
      { type: 'AGENT_MESSAGE', threadId, staffId: 'staff_morgan', text: 'Sir, I need a word on the goal.' },
      now + 5_000,
    )
    expect(unreadFrom(state, 'staff_morgan')).toBe(1)
    expect(unreadIn(state, threadId)).toBe(1)
    state = applyCommand(state, { type: 'READ_THREAD', threadId }, now + 6_000)
    expect(unreadFrom(state, 'staff_morgan')).toBe(0)
  })

  it('raises a hand when that person is waiting on the owner', () => {
    const state = createSampleState(now)
    const waiting = state.staff.find((person) =>
      state.tasks.some((task) => task.assigneeId === person.id && (task.status === 'waiting_for_owner' || task.status === 'in_review')),
    )
    const asked = state.staff.find((person) => state.approvals.some((item) => item.status === 'pending' && item.requestedById === person.id))
    const person = waiting ?? asked
    expect(person).toBeTruthy()
    expect(handUp(state, person!.id)).toBe(true)
    expect(badgeCount(120)).toBe('99+')
  })
})
