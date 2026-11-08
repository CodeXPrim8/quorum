import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { dayPart, minutesTaker, ownerHonorific, seniorOnCall, spokenClock } from './meeting'

const now = 1_700_000_000_000

describe('group call roles', () => {
  it('addresses the owner as sir or ma from the saved gender', () => {
    expect(ownerHonorific('male')).toBe('sir')
    expect(ownerHonorific('female')).toBe('ma')
    expect(ownerHonorific(undefined)).toBeNull()
  })

  it('names the hour on the office clock', () => {
    expect(dayPart(new Date('2026-10-28T09:10:00'))).toBe('Good morning')
    expect(dayPart(new Date('2026-10-28T15:05:00'))).toBe('Good afternoon')
    expect(dayPart(new Date('2026-10-28T19:40:00'))).toBe('Good evening')
    expect(spokenClock(new Date('2026-10-28T15:05:00'))).toBe("It's 3:05.")
  })

  it('lets the Managing Director chair and asks HR to take minutes', () => {
    const state = createSampleState(now)
    const roster = state.staff.filter((person) =>
      ['staff_morgan', 'staff_priya', 'staff_ruth', 'staff_maya'].includes(person.id),
    )
    const host = seniorOnCall(roster, state)
    expect(host?.id).toBe('staff_morgan')
    const clerk = minutesTaker(roster, host!, state)
    expect(clerk?.id).toBe('staff_ruth')
  })
})
