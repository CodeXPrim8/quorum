import { describe, expect, it } from 'vitest'
import { lessonFromOwner, memoryBrief, remember, siteLesson } from './memory'

describe('company memory', () => {
  it('keeps an owner instruction and skips chatter', () => {
    expect(lessonFromOwner('Remember we sell solar, CCTV, and office tech.')).toContain('solar')
    expect(lessonFromOwner('hello')).toBeNull()
  })

  it('stores a site fact once', () => {
    const text = siteLesson('Read https://clemxtech.com.ng/\nTitle: Clemx\nDescription: Solar, CCTV, and office technology.')
    expect(text).toContain('Clemx')
    const once = remember([], { id: 'mem_1', at: 't', kind: 'site', text: text! })
    const twice = remember(once, { id: 'mem_2', at: 't', kind: 'site', text: text! })
    expect(twice).toHaveLength(1)
    expect(memoryBrief(twice)).toContain('What this company has learned')
  })
})
