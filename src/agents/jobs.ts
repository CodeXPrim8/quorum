import { isStaffActive } from '../domain/active'
import { formatLabel, offeringsFromGoals, platformLabel } from '../domain/calendar'
import { COMPANY_THREAD } from '../chat/threads'
import { isDesigner } from './local'
import type { AppState, Staff } from '../types'

export type AgentJob = {
  kind: 'reply' | 'initiative'
  threadId: string
  staffId: string
  prompt: string
  intent: 'reply' | 'design' | 'update' | 'calendar' | 'review'
  taskTitle?: string
  designBrief?: string
  calendarId?: string
  designId?: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

const SPEAK_GAP = 12 * 60_000
const PULSE_GAP = 35_000

function historyFor(state: AppState, threadId: string, staffId: string) {
  return state.chat
    .filter((message) => message.threadId === threadId)
    .slice(-10)
    .map((message) => ({
      role: message.authorId === staffId ? ('assistant' as const) : ('user' as const),
      content: `${message.authorName}: ${message.text}`,
    }))
}

function unanswered(state: AppState, threadId: string, staffId: string, at: string): boolean {
  return !state.chat.some(
    (message) => message.threadId === threadId && message.authorId === staffId && message.at >= at,
  )
}

function wantsDesign(state: AppState, person: Staff, text: string): boolean {
  return isDesigner(person, state.roles) && /design|graphic|poster|logo|visual|artwork|banner|draw|flyer/i.test(text)
}

function inRole(state: AppState, key: string): Staff | null {
  const ids = new Set(state.roles.filter((role) => role.key === key && role.enabled).map((role) => role.id))
  return state.staff.find((person) => ids.has(person.roleId) && isStaffActive(state, person)) ?? null
}

/** The next person who should speak: a tagged reply first, then one piece of unprompted role work. */
export function nextJob(state: AppState, now: number): AgentJob | null {
  if (!state.settings.agentsWorking || !state.company) return null
  for (const message of state.chat) {
    if (message.authorId !== 'owner' || message.mentions.length === 0) continue
    for (const staffId of message.mentions) {
      const person = state.staff.find((item) => item.id === staffId)
      if (!person || !isStaffActive(state, person)) continue
      if (!unanswered(state, message.threadId, staffId, message.at)) continue
      return {
        kind: 'reply',
        threadId: message.threadId,
        staffId,
        prompt: message.text,
        intent: wantsDesign(state, person, message.text) ? 'design' : 'reply',
        history: historyFor(state, message.threadId, staffId),
      }
    }
  }
  if (state.settings.marketingReviews !== false) {
    const waiting = (state.designs ?? []).find((design) => design.status === 'in_review' && design.reviewer === 'marketing')
    const marketer = inRole(state, 'marketing_manager')
    if (waiting && marketer) {
      return {
        kind: 'initiative',
        threadId: COMPANY_THREAD,
        staffId: marketer.id,
        prompt: `${waiting.title}. ${waiting.brief}`,
        intent: 'review',
        designId: waiting.id,
        history: historyFor(state, COMPANY_THREAD, marketer.id),
      }
    }
  }
  if (now - (state.agentPulse ?? 0) < PULSE_GAP) return null
  const products = state.products ?? []
  const calendar = state.calendar ?? []
  const unplanned = products.filter((product) => !calendar.some((post) => post.productId === product.id))
  const goalsNeedProducts = products.length === 0 && offeringsFromGoals(state.company).length > 0
  const marketer = inRole(state, 'marketing_manager')
  if (marketer && (unplanned.length > 0 || goalsNeedProducts)) {
    return {
      kind: 'initiative',
      threadId: COMPANY_THREAD,
      staffId: marketer.id,
      prompt: 'Write the content calendar.',
      intent: 'calendar',
      history: historyFor(state, COMPANY_THREAD, marketer.id),
    }
  }
  const designer = inRole(state, 'graphic_designer') ?? state.staff.find((person) => isDesigner(person, state.roles) && isStaffActive(state, person))
  const open = (state.designs ?? []).some((design) => design.status === 'in_review')
  const due = calendar
    .filter((post) => post.status === 'planned' && post.day === state.clock.day)
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.platform.localeCompare(b.platform))
  if (designer && !open && due[0]) {
    const post = due[0]
    const product = products.find((item) => item.id === post.productId)
    return {
      kind: 'initiative',
      threadId: COMPANY_THREAD,
      staffId: designer.id,
      prompt: `I’ll design the ${formatLabel(post.format)} for ${product?.name ?? 'the product'}. It is the ${platformLabel(post.platform)} post on today’s calendar. I’ll put it in the company chat for review. Nothing is posted.`,
      intent: 'design',
      designBrief: post.brief,
      calendarId: post.id,
      history: historyFor(state, COMPANY_THREAD, designer.id),
    }
  }
  const task = state.tasks.find((item) => {
    if (item.status !== 'in_progress' || !item.assigneeId) return false
    const assignee = state.staff.find((person) => person.id === item.assigneeId)
    return assignee ? isStaffActive(state, assignee) : false
  })
  if (!task?.assigneeId) return null
  const person = state.staff.find((item) => item.id === task.assigneeId)
  if (!person || (state.agentSeen[person.id] ?? 0) + SPEAK_GAP > now) return null
  const already = state.chat.some((message) => message.authorId === person.id && message.text.includes(task.title))
  if (already) return null
  return {
    kind: 'initiative',
    threadId: COMPANY_THREAD,
    staffId: person.id,
    prompt: task.title,
    intent: 'update',
    taskTitle: task.title,
    history: historyFor(state, COMPANY_THREAD, person.id),
  }
}
