import { describe, expect, it } from 'vitest'
import { applyCommand } from '../engine/apply'
import { createSampleState } from '../engine/fixture'
import { ensureChat, markParts, quorumHistory, titleFromAsk, withoutMarks, withoutSpeaker } from './threads'

describe('withoutSpeaker', () => {
  it('drops a leading name from a direct reply', () => {
    expect(withoutSpeaker('Morgan Hale', 'Morgan Hale: Yes sir, I have.')).toBe('Yes sir, I have.')
    expect(withoutSpeaker('Morgan Hale', 'Morgan: Yes sir.')).toBe('Yes sir.')
  })

  it('leaves a reply that does not start with the name', () => {
    expect(withoutSpeaker('Morgan Hale', 'Yes sir, I have.')).toBe('Yes sir, I have.')
  })
})

describe('markParts', () => {
  it('turns markdown bold into strong parts without leaving asterisks', () => {
    expect(withoutMarks('- **Website or copy** — tighten the homepage')).toBe('- Website or copy — tighten the homepage')
    expect(markParts('- **Planning** — a calendar')).toEqual([
      { text: '- ' },
      { text: 'Planning', strong: true },
      { text: ' — a calendar' },
    ])
  })
})

describe('Quorum history', () => {
  it('titles a chat from the first ask and keeps later threads', () => {
    expect(titleFromAsk('  Research the Lagos office lease  ')).toBe('Research the Lagos office lease')
    const now = 1_700_000_000_000
    let state = createSampleState(now)
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: 'thread_quorum', text: 'Hello', wake: false }, now)
    state = applyCommand(state, { type: 'NEW_QUORUM_CHAT', id: 'thread_quorum_2' }, now + 1)
    state = applyCommand(state, { type: 'SEND_MESSAGE', threadId: 'thread_quorum_2', text: 'Second topic', wake: false }, now + 2)
    const kept = ensureChat(state)
    expect(kept.threads.filter((thread) => thread.kind === 'quorum')).toHaveLength(2)
    expect(kept.threads.find((thread) => thread.id === 'thread_quorum')?.name).toBe('Hello')
    expect(kept.threads.find((thread) => thread.id === 'thread_quorum_2')?.name).toBe('Second topic')
  })

  it('lists the most recently messaged Quorum chat first', () => {
    const threads = [
      { id: 'thread_quorum', kind: 'quorum' as const, name: 'Hello', memberIds: [], createdAt: '1' },
      { id: 'thread_quorum_2', kind: 'quorum' as const, name: 'Second topic', memberIds: [], createdAt: '2' },
    ]
    const chat = [
      { id: '1', threadId: 'thread_quorum', at: '1', authorId: 'owner', authorName: 'A', text: 'Hello', mentions: [] },
      { id: '2', threadId: 'thread_quorum_2', at: '2', authorId: 'owner', authorName: 'A', text: 'Second', mentions: [] },
    ]
    expect(quorumHistory({ threads, chat }).map((thread) => thread.name).sort()).toEqual(['Hello', 'Second topic'])
  })
})
