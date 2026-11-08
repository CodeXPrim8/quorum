import { describe, expect, it } from 'vitest'
import { planAllowsPublish } from './social'

describe('social publish allowance', () => {
  it('lets Standard and Pro publish, and holds Lite and Bring-your-key', () => {
    expect(planAllowsPublish('starter')).toBe(true)
    expect(planAllowsPublish('pro')).toBe(true)
    expect(planAllowsPublish('lite')).toBe(false)
    expect(planAllowsPublish('byok')).toBe(false)
  })
})
