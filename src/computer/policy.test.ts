import { describe, expect, it } from 'vitest'
import { gateComputerAction, parseComputerAction, parseComputerPlan, resolveModelAction, stepsForPrompt } from './policy'

describe('computer-use policy', () => {
  it('allows a named click and holds a purchase', () => {
    expect(
      gateComputerAction(
        { kind: 'click', controlId: 'c1' },
        { processName: 'chrome', control: { id: 'c1', name: 'Visit website', role: 'Button' } },
      ).gate,
    ).toBe('allow')
    expect(
      gateComputerAction(
        { kind: 'click', controlId: 'c2' },
        { processName: 'msedge', control: { id: 'c2', name: 'Buy now', role: 'Button' } },
      ).gate,
    ).toBe('approve')
  })

  it('lets an approved slip confirm, and still holds a purchase', () => {
    expect(
      gateComputerAction(
        { kind: 'click', controlId: 'c4' },
        { processName: 'chrome', approvedStake: true, control: { id: 'c4', name: 'Submit', role: 'Button' } },
      ).gate,
    ).toBe('allow')
    expect(
      gateComputerAction(
        { kind: 'click', controlId: 'c5' },
        { processName: 'chrome', approvedStake: true, control: { id: 'c5', name: 'Buy now', role: 'Button' } },
      ).gate,
    ).toBe('approve')
  })

  it('hands passwords and card numbers back to the owner', () => {
    expect(
      gateComputerAction(
        { kind: 'type', text: 'hunter2' },
        { processName: 'chrome', control: { id: 'c3', name: 'Password', role: 'Edit' } },
      ).gate,
    ).toBe('handoff')
    expect(gateComputerAction({ kind: 'type', text: '4111 1111 1111 1111' }, { processName: 'notepad' }).gate).toBe(
      'handoff',
    )
  })

  it('refuses keys that leave the selected window', () => {
    expect(gateComputerAction({ kind: 'key', key: 'c' }, { processName: 'chrome' }).gate).toBe('allow')
    expect(gateComputerAction({ kind: 'key', key: 'win+r' }, { processName: 'notepad' }).gate).toBe('deny')
    expect(gateComputerAction({ kind: 'key', key: 'ctrl+l' }, { processName: 'notepad' }).gate).toBe('deny')
    expect(gateComputerAction({ kind: 'key', key: 'ctrl+l' }, { processName: 'msedge' }).gate).toBe('allow')
  })

  it('opens a public page only inside a browser the owner selected', () => {
    expect(stepsForPrompt('open the trustpilot website', 'msedge').map((step) => step.kind)).toEqual([
      'key',
      'type',
      'key',
      'wait',
    ])
    expect(stepsForPrompt('open the trustpilot website', 'notepad')).toEqual([])
    const farm = stepsForPrompt('open Chrome and navigate to www.steaders8.farm', 'chrome')
    expect(farm[1]).toEqual({ kind: 'type', text: 'https://www.steaders8.farm' })
    expect(
      stepsForPrompt(
        'draft the meeting request in the Zoho window already open. here is the email iwewezinemstephen@gmail.com',
        'chrome',
      ),
    ).toEqual([])
    expect(parseComputerAction('{"kind":"click","controlId":"c4"}')).toEqual({ kind: 'click', controlId: 'c4' })
    expect(
      resolveModelAction('{"kind":"click","control":"New Mail"}', [
        { id: 'c0', name: 'Reply', role: 'Button' },
        { id: 'c1', name: 'New Mail', role: 'Button' },
      ]),
    ).toEqual({ kind: 'click', controlId: 'c1' })
    expect(parseComputerAction('{"kind":"click","x":12,"y":40}')).toBeNull()
    expect(
      parseComputerPlan(
        '[{"kind":"type","text":"iwewezinemstephen@gmail.com"},{"kind":"key","key":"tab"},{"kind":"done","note":"drafted"}]',
        [],
      ),
    ).toEqual([
      { kind: 'type', text: 'iwewezinemstephen@gmail.com' },
      { kind: 'key', key: 'tab' },
    ])
  })
})
