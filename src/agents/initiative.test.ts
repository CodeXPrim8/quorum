import { describe, expect, it } from 'vitest'
import { declinedGoalTexts, goalAngle, goalRepeats } from './initiative'
import type { AppState, GoalProposal } from '../types'

function proposal(text: string, status: GoalProposal['status']): GoalProposal {
  return { id: text, text, status, proposedById: 'md', createdAt: '2026-11-10T00:00:00.000Z' }
}

describe('declined company goals', () => {
  const procurex = "Increase ProcureX's recurring SaaS revenue by 30% year-over-year by expanding the platform into mid-market procurement teams."

  it('treats a rephrase of a declined goal as the same goal', () => {
    const prior = [procurex]
    expect(goalRepeats(procurex, prior)).toBe(true)
    expect(
      goalRepeats('Grow ProcureX recurring SaaS revenue 30% by selling the platform to mid-market procurement teams.', prior),
    ).toBe(true)
    expect(goalRepeats('Cut the time to onboard a new procurement team to under ten days.', prior)).toBe(false)
  })

  it('keeps each declined sentence once and moves the next angle', () => {
    const state = {
      goalProposals: [proposal(procurex, 'rejected'), proposal(procurex, 'rejected'), proposal('Win a second buyer this month.', 'approved')],
    } as AppState
    expect(declinedGoalTexts(state)).toEqual([procurex])
    expect(goalAngle(0)).not.toBe(goalAngle(1))
  })
})
