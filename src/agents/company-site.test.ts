import { describe, expect, it } from 'vitest'
import { readingRequest } from './company-site'

describe('reading request', () => {
  it('opens the saved company site when the owner asks about it', () => {
    expect(readingRequest('https://clemxtech.com.ng/', 'have you gone through our website ?')).toEqual({
      urls: ['https://clemxtech.com.ng/'],
      missing: false,
    })
  })

  it('opens a public link the owner names', () => {
    expect(readingRequest(undefined, 'Look at https://example.com/about').urls).toEqual(['https://example.com/about'])
  })

  it('stays quiet on an ordinary greeting', () => {
    expect(readingRequest('https://clemxtech.com.ng/', 'Good morning')).toEqual({ urls: [], missing: false })
  })

  it('says the site is missing when none is saved', () => {
    expect(readingRequest(undefined, 'have you gone through our website')).toEqual({ urls: [], missing: true })
  })
})
