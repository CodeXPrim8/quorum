import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/apply'
import { ownerReportDue, reportCadence } from './reports'

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
  })
})
