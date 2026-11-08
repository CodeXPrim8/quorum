import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { pickSpeakers } from './route-spoken'

const now = 1_700_000_000_000

describe('spoken routing stays in Quorum', () => {
  it('sends a named request to that staff member, not to a generic OpenAI reply', () => {
    const state = createSampleState(now)
    const roster = state.staff.filter((person) => ['staff_priya', 'staff_morgan', 'staff_david'].includes(person.id))
    const morgan = roster.find((person) => person.id === 'staff_morgan')!
    expect(pickSpeakers('Priya, how is the lead?', roster, state, null, morgan).map((person) => person.id)).toEqual(['staff_priya'])
    expect(pickSpeakers('What is the update on the margin?', roster, state, null, morgan).map((person) => person.id)).toEqual(['staff_david'])
  })
})
