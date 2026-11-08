import { describe, expect, it } from 'vitest'
import { staffModelUrl } from './model-catalog'

describe('staff glTF catalog', () => {
  it('keeps the built-in person until a file is wired', () => {
    expect(staffModelUrl('staff_morgan')).toBeUndefined()
  })
})
