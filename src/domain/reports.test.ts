import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { isOfficeLife, ownerReportDue, reportCadence } from './reports'

const now = 1_700_000_000_000

describe('line reports', () => {
  it('defaults to a daily compiled report for the owner', () => {
    const state = createSampleState(now)
    expect(reportCadence(state)).toBe('daily')
    expect(ownerReportDue('daily', -1, 5)).toBe(true)
    expect(ownerReportDue('weekly', 5, 6)).toBe(false)
    expect(ownerReportDue('weekly', 5, 10)).toBe(true)
    expect(ownerReportDue('monthly', 5, 24)).toBe(false)
    expect(ownerReportDue('monthly', 5, 26)).toBe(true)
    expect(isOfficeLife('Went for water.')).toBe(true)
    expect(isOfficeLife('Eating in the cafeteria.')).toBe(true)
    expect(isOfficeLife('Filed the solar survey for the client site.')).toBe(false)
  })
})
