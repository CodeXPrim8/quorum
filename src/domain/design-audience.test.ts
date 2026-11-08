import { describe, expect, it } from 'vitest'
import { designAudience } from './design-audience'

describe('design audience', () => {
  it('keeps calendar and product work promotional, and meetings in-house', () => {
    expect(designAudience('Dock Pro launch', 'cal_1')).toBe('promotional')
    expect(designAudience('Instagram flyer for Classroom OS')).toBe('promotional')
    expect(designAudience('Flyer for tomorrow’s all-hands meeting')).toBe('internal')
    expect(designAudience('Internal notice about office hours')).toBe('internal')
    expect(designAudience('Standup agenda graphic')).toBe('internal')
  })
})
