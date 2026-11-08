import { isStaffActive } from '../domain/active'
import { lineThreadId } from '../domain/reports'
import type { AppState, ChatMessage, ChatThread, Staff } from '../types'

export const COMPANY_THREAD = 'thread_company'
export const QUORUM_THREAD = 'thread_quorum'

export function directThreadId(staffId: string): string {
  return `thread_dm_${staffId}`
}

export function freshQuorumId(): string {
  return `thread_quorum_${Date.now().toString(36)}`
}

export function titleFromAsk(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line) return 'New chat'
  if (line.length <= 42) return line
  return `${line.slice(0, 40).trim()}…`
}

export function emptyQuorumId(state: Pick<AppState, 'threads' | 'chat'>): string | undefined {
  return state.threads.find(
    (thread) => thread.kind === 'quorum' && !state.chat.some((message) => message.threadId === thread.id),
  )?.id
}

export function quorumHistory(state: Pick<AppState, 'threads' | 'chat'>): ChatThread[] {
  const lastIndex = (id: string) => {
    for (let i = state.chat.length - 1; i >= 0; i -= 1) {
      if (state.chat[i].threadId === id) return i
    }
    return -1
  }
  return state.threads
    .filter((thread) => thread.kind === 'quorum' && state.chat.some((message) => message.threadId === thread.id))
    .sort((a, b) => lastIndex(b) - lastIndex(a) || a.name.localeCompare(b.name))
}

function activeStaff(state: AppState): Staff[] {
  return state.staff.filter((person) => isStaffActive(state, person)).sort((a, b) => a.name.localeCompare(b.name))
}

function sameThread(a: ChatThread, b: ChatThread): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.name === b.name &&
    a.memberIds.join('|') === b.memberIds.join('|') &&
    a.ownerReadAt === b.ownerReadAt
  )
}

function keepThread(prev: ChatThread | undefined, thread: ChatThread): ChatThread {
  return { ...thread, ownerReadAt: prev?.ownerReadAt ?? thread.ownerReadAt ?? new Date().toISOString() }
}

function titledQuorum(thread: ChatThread, chat: ChatMessage[]): ChatThread {
  if (thread.name !== 'Quorum' && thread.name !== 'New chat') return thread
  const first = chat.find((message) => message.threadId === thread.id && message.authorId === 'owner')
  if (!first) return thread
  return { ...thread, name: titleFromAsk(first.text) }
}

/** Company group, one direct chat per person, and any groups already created. */
export function ensureChat(state: AppState): AppState {
  let chatChanged = false
  const chat = (state.chat ?? []).map((message) => {
    if (message.threadId && message.mentions) return message
    chatChanged = true
    const next: ChatMessage = {
      ...message,
      threadId: message.threadId || COMPANY_THREAD,
      mentions: message.mentions ?? [],
    }
    return next
  })
  if (!state.company) {
    const threads = state.threads ?? []
    if (!chatChanged && state.threads && state.chat && state.agentSeen && state.agentPulse !== undefined) return state
    return {
      ...state,
      threads,
      chat,
      agentSeen: state.agentSeen ?? {},
      agentPulse: state.agentPulse ?? 0,
    }
  }
  const people = activeStaff(state)
  const previous = state.threads ?? []
  const companyPrev = previous.find((thread) => thread.id === COMPANY_THREAD)
  const company: ChatThread = keepThread(companyPrev, {
    id: COMPANY_THREAD,
    kind: 'company',
    name: state.company.name,
    memberIds: people.map((person) => person.id),
    createdAt: companyPrev?.createdAt ?? state.company.createdAt,
  })
  const quorums = previous
    .filter((thread) => thread.kind === 'quorum')
    .map((thread) => {
      const named = titledQuorum(keepThread(thread, thread), chat)
      return named
    })
  if (quorums.length === 0) {
    quorums.push(
      keepThread(undefined, {
        id: QUORUM_THREAD,
        kind: 'quorum',
        name: 'Quorum',
        memberIds: [],
        createdAt: state.company.createdAt,
      }),
    )
  }
  const groups = previous.filter((thread) => thread.kind === 'group').map((thread) => keepThread(thread, thread))
  const directs = new Map(previous.filter((thread) => thread.kind === 'direct').map((thread) => [thread.id, thread]))
  const lines = new Map(previous.filter((thread) => thread.kind === 'line').map((thread) => [thread.id, thread]))
  const threads: ChatThread[] = [company, ...quorums, ...groups]
  for (const person of people) {
    const id = directThreadId(person.id)
    const prev = directs.get(id)
    threads.push(
      keepThread(prev, {
        id,
        kind: 'direct',
        name: person.name,
        memberIds: [person.id],
        createdAt: prev?.createdAt ?? state.company.createdAt,
      }),
    )
  }
  for (const person of people) {
    if (!person.managerId) continue
    const manager = people.find((item) => item.id === person.managerId)
    if (!manager) continue
    const id = lineThreadId(person.id)
    const prev = lines.get(id)
    threads.push(
      keepThread(prev, {
        id,
        kind: 'line',
        name: `${person.name} → ${manager.name}`,
        memberIds: [person.id, manager.id],
        createdAt: prev?.createdAt ?? state.company.createdAt,
      }),
    )
  }
  const agentsWorking = state.settings.agentsWorking ?? true
  const same =
    !chatChanged &&
    state.settings.agentsWorking === agentsWorking &&
    previous.length === threads.length &&
    threads.every((thread, index) => previous[index] && sameThread(previous[index], thread))
  if (same && state.agentSeen && state.agentPulse !== undefined) return state
  return {
    ...state,
    settings: { ...state.settings, agentsWorking },
    threads,
    chat,
    agentSeen: state.agentSeen ?? {},
    agentPulse: state.agentPulse ?? 0,
  }
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** @all tags everyone in the thread. @Full Name tags one person. A unique first name works too. */
export function mentionsIn(text: string, staff: Staff[], memberIds: string[]): string[] {
  const pool = staff.filter((person) => memberIds.includes(person.id))
  if (/@(all|everyone)\b/i.test(text)) return memberIds.filter((id) => pool.some((person) => person.id === id))
  const found: string[] = []
  const byLength = [...pool].sort((a, b) => b.name.length - a.name.length)
  for (const person of byLength) {
    if (new RegExp(`@${escapeReg(person.name)}\\b`, 'i').test(text)) {
      found.push(person.id)
      continue
    }
    const first = person.name.split(' ')[0] ?? person.name
    const sameFirst = pool.filter((item) => (item.name.split(' ')[0] ?? '').toLowerCase() === first.toLowerCase())
    if (sameFirst.length === 1 && new RegExp(`@${escapeReg(first)}\\b`, 'i').test(text)) found.push(person.id)
  }
  return found
}

/** Markdown bold in a model reply becomes ordinary words, or strong parts for the bubble. */
export function markParts(text: string): { text: string; strong?: boolean }[] {
  return text.split(/(\*\*[^*\n]+?\*\*)/g).flatMap((part) => {
    if (!part) return []
    const bold = /^\*\*([^*\n]+)\*\*$/.exec(part)
    return bold ? [{ text: bold[1], strong: true }] : [{ text: part }]
  })
}

export function withoutMarks(text: string): string {
  return markParts(text)
    .map((part) => part.text)
    .join('')
}

/** The chat header already names the person, so a leading "Morgan Hale:" is dropped. */
export function withoutSpeaker(name: string, text: string): string {
  const full = name.trim()
  if (!full) return text
  const first = full.split(/\s+/)[0] ?? ''
  const forms = first && first.toLowerCase() !== full.toLowerCase() ? [full, first] : [full]
  let next = text.trim()
  for (const form of forms) {
    next = next.replace(new RegExp(`^${escapeReg(form)}\\s*[:\\-—–]\\s*`, 'i'), '')
  }
  return next.trim() || text
}
