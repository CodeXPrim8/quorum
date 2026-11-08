import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { officeMood, sceneOpening } from './call-scene'

const now = 1_700_000_000_000

function clearPressure(state: ReturnType<typeof createSampleState>) {
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.status === 'blocked' || task.status === 'waiting_for_owner' ? { ...task, status: 'in_progress' as const } : task,
    ),
  }
}

describe('human call opening', () => {
  it('greets the owner and colleagues from the floor mood, not a chair script', () => {
    const state = clearPressure(createSampleState(now))
    const morning = { ...state, clock: { ...state.clock, minute: 9 * 60 + 10 } }
    const roster = morning.staff.filter((person) =>
      ['staff_morgan', 'staff_priya', 'staff_ruth', 'staff_maya'].includes(person.id),
    )
    const lines = sceneOpening(morning, roster)
    const spoken = lines.map((line) => line.text).join(' ')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(new Set(lines.map((line) => line.staffId)).size).toBeGreaterThan(1)
    expect(spoken).toMatch(/Riley|sir/)
    expect(spoken.toLowerCase()).toMatch(/morning|hey|hi|glad/)
    expect(spoken).not.toMatch(/will write the minutes for this meeting/)
  })

  it('changes who speaks first when the clock and mood change', () => {
    const state = createSampleState(now)
    const roster = state.staff.filter((person) =>
      ['staff_morgan', 'staff_priya', 'staff_ruth', 'staff_maya'].includes(person.id),
    )
    const morningState = { ...clearPressure(state), clock: { ...state.clock, minute: 8 * 60 + 5 } }
    const morning = sceneOpening(morningState, roster)
    const tenseState = { ...state, clock: { ...state.clock, minute: 16 * 60 + 40 } }
    const tense = sceneOpening(tenseState, roster)
    expect(officeMood(morningState).kind).toBe('morning')
    expect(officeMood(tenseState).kind).toBe('blocked')
    expect(tense.map((line) => line.text).join(' ').toLowerCase()).toMatch(/honest|stuck|problem|frustrated|tension|unhappy/)
    expect(morning[0]?.staffId).not.toBe(tense[0]?.staffId)
  })
})
