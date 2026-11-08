import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { applyCommand } from '../engine/apply'
import { earlierDesktopPrompt, grantsDesktop, needsDesktop, pendingQuorumPrompt, needsResearch } from './quorum'

const now = 1_700_000_000_000

describe('Quorum assistant', () => {
  it('treats a lookup as research and waits for a reply after the owner speaks', () => {
    expect(needsResearch('look up solar inverter standards in Nigeria')).toBe(true)
    expect(needsResearch('hello')).toBe(false)
    let state = applyCommand(
      createSampleState(now),
      { type: 'SEND_MESSAGE', threadId: 'thread_quorum', text: 'What should I say in a client intro?', wake: false },
      now,
    )
    expect(pendingQuorumPrompt(state)?.text).toMatch(/client intro/)
    expect(pendingQuorumPrompt(state)?.threadId).toBe('thread_quorum')
    state = applyCommand(state, { type: 'QUORUM_MESSAGE', text: 'Lead with reliability and certified installs.' }, now + 1)
    expect(pendingQuorumPrompt(state)).toBeNull()
  })

  it('still answers a new line while a desktop ask is open', () => {
    let state = applyCommand(
      createSampleState(now),
      { type: 'SEND_MESSAGE', threadId: 'thread_quorum', text: 'Open notepad', wake: false },
      now,
    )
    state = applyCommand(
      state,
      { type: 'ASK_QUORUM_DESKTOP', reason: 'Open Notepad on this computer.', prompt: 'Open notepad' },
      now + 1,
    )
    expect(pendingQuorumPrompt(state)).toBeNull()
    state = applyCommand(
      state,
      { type: 'SEND_MESSAGE', threadId: 'thread_quorum', text: 'Also draft a one-line intro', wake: false },
      now + 2,
    )
    expect(pendingQuorumPrompt(state)?.text).toMatch(/one-line intro/)
  })

  it('treats an open Zoho mail request as computer work and a later yes as permission', () => {
    const ask = 'In the window I have opened my zoho mail, draft a reply to iwewezinemstephen@gmail.com about the solar quote.'
    expect(needsDesktop(ask)).toBe(true)
    expect(grantsDesktop('yes')).toBe(true)
    expect(grantsDesktop('i allow a desktop session.')).toBe(true)
    expect(grantsDesktop(ask)).toBe(false)
    let state = applyCommand(createSampleState(now), { type: 'SEND_MESSAGE', threadId: 'thread_quorum', text: ask, wake: false }, now)
    expect(earlierDesktopPrompt(state, 'thread_quorum', 'i allow a desktop session.')).toBe(ask)
  })
})
