import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { staffVoice, voiceKind } from './staff-voice'

const now = 1_700_000_000_000

describe('staff voices', () => {
  it('gives men male voices and women female voices, one sound each', () => {
    const state = createSampleState(now)
    const men = ['staff_jonah', 'staff_samir', 'staff_marco', 'staff_david', 'staff_tom', 'staff_jules']
    const women = [
      'staff_morgan',
      'staff_priya',
      'staff_lena',
      'staff_nina',
      'staff_maya',
      'staff_casey',
      'staff_helen',
      'staff_aisha',
      'staff_ruth',
      'staff_elise',
      'staff_sofia',
      'staff_imani',
    ]
    for (const id of men) {
      const person = state.staff.find((item) => item.id === id)!
      const voice = staffVoice(person)
      expect(voiceKind(person)).toBe('man')
      expect(voice.kind).toBe('man')
      expect(['ash', 'echo', 'ballad', 'cedar']).toContain(voice.live)
      expect(['onyx', 'echo', 'ash', 'fable']).toContain(voice.tts)
    }
    for (const id of women) {
      const person = state.staff.find((item) => item.id === id)!
      const voice = staffVoice(person)
      expect(voiceKind(person)).toBe('woman')
      expect(voice.kind).toBe('woman')
      expect(['coral', 'sage', 'shimmer', 'verse', 'marin']).toContain(voice.live)
      expect(['nova', 'shimmer', 'coral', 'sage']).toContain(voice.tts)
    }
    const priya = staffVoice(state.staff.find((item) => item.id === 'staff_priya')!)
    const david = staffVoice(state.staff.find((item) => item.id === 'staff_david')!)
    expect(priya.live).not.toBe(david.live)
    expect(priya.tts).not.toBe(david.tts)
  })
})
