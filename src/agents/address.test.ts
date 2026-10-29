import { describe, expect, it } from 'vitest'
import type { Staff } from '../types'
import { peopleNamed, personForTopic, voiceKind } from './address'

function person(id: string, name: string, title: string, purpose: string): Staff {
  return { id, name, title, purpose, responsibilities: [] } as unknown as Staff
}

const sofia = person('staff_sofia', 'Sofia Alvarez', 'Systems Engineer', 'Keeps the company systems running')
const david = person('staff_david', 'David Chen', 'Finance Manager', 'Watches the margin and the money')

describe('call names', () => {
  it('hears Sophia as Sofia and David as David, with their own voices', () => {
    expect(voiceKind(sofia)).toBe('woman')
    expect(voiceKind(david)).toBe('man')
    expect(peopleNamed('Sophia, do this', [david, sofia]).map((item) => item.id)).toEqual(['staff_sofia'])
    expect(peopleNamed('David, can you hear me?', [david, sofia]).map((item) => item.id)).toEqual(['staff_david'])
  })

  it('gives an update question to the person whose work it is', () => {
    const match = personForTopic('What is the update on the margin?', [sofia, david], [
      { assigneeId: 'staff_david', title: 'Review the margin', status: 'in_progress' },
    ])
    expect(match?.id).toBe('staff_david')
  })
})
