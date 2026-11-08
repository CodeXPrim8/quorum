import { isStaffActive } from '../domain/active'
import { canOpenDayToDay, DAY_TO_DAY_MANAGER_KEYS, openWorkCount, roleKeyOf } from '../domain/authority'
import { formatLabel, platformLabel } from '../domain/calendar'
import { COMPANY_THREAD, withoutSpeaker } from '../chat/threads'
import { isDesigner } from './local'
import type { AppState, Staff, Task } from '../types'

function currentStep(task: Task) {
  return task.playbook[task.stepIndex] ?? null
}

export type AgentJob = {
  kind: 'reply' | 'initiative'
  threadId: string
  staffId: string
  prompt: string
  intent: 'reply' | 'design' | 'update' | 'calendar' | 'review' | 'work' | 'start' | 'spawn' | 'propose_goal'
  taskTitle?: string
  taskId?: string
  designBrief?: string
  calendarId?: string
  designId?: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

const SPEAK_GAP = 12 * 60_000
const PULSE_GAP = 35_000
const WORK_GAP = 45_000

function historyFor(state: AppState, threadId: string, staffId: string) {
  return state.chat
    .filter((message) => message.threadId === threadId)
    .slice(-10)
    .map((message) => ({
      role: message.authorId === staffId ? ('assistant' as const) : ('user' as const),
      content:
        message.authorId === staffId
          ? withoutSpeaker(message.authorName, message.text)
          : `${message.authorName}: ${withoutSpeaker(message.authorName, message.text)}`,
    }))
}

function unanswered(state: AppState, threadId: string, staffId: string, at: string): boolean {
  return !state.chat.some(
    (message) => message.threadId === threadId && message.authorId === staffId && message.at >= at,
  )
}

function wantsDesign(state: AppState, person: Staff, text: string): boolean {
  return isDesigner(person, state.roles) && /design|graphic|poster|logo|visual|artwork|banner|draw|flyer|meeting|agenda/i.test(text)
}

function inRole(state: AppState, key: string): Staff | null {
  const ids = new Set(state.roles.filter((role) => role.key === key && role.enabled).map((role) => role.id))
  return state.staff.find((person) => ids.has(person.roleId) && isStaffActive(state, person)) ?? null
}

function priorityRank(priority: AppState['tasks'][number]['priority']): number {
  if (priority === 'urgent') return 0
  if (priority === 'high') return 1
  if (priority === 'medium') return 2
  return 3
}

/** The next person who should speak: a tagged reply first, then one piece of unprompted role work. */
export function nextJob(state: AppState, now: number): AgentJob | null {
  const company = state.company
  if (!state.settings.agentsWorking || !company) return null
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
    const waiting = (state.designs ?? []).find(
      (design) =>
        design.status === 'in_review' &&
        design.reviewer === 'marketing' &&
        design.audience !== 'internal' &&
        design.artStatus !== 'pending',
    )
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
  const marketer = inRole(state, 'marketing_manager')
  if (marketer && products.length > 0 && unplanned.length > 0) {
    return {
      kind: 'initiative',
      threadId: COMPANY_THREAD,
      staffId: marketer.id,
      prompt:
        'Write a detailed monthly content calendar for every product: weekdays, Instagram Feed / Carousel / Reels sizes, TikTok, YouTube thumbnails, captions, and objectives. File it as a PDF. Nothing is posted.',
      intent: 'calendar',
      history: historyFor(state, COMPANY_THREAD, marketer.id),
    }
  }
  const designer = inRole(state, 'graphic_designer') ?? state.staff.find((person) => isDesigner(person, state.roles) && isStaffActive(state, person))
  const openDesign = (state.designs ?? []).some((design) => design.status === 'in_review')
  const due = calendar
    .filter((post) => post.status === 'planned' && post.day === state.clock.day)
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.platform.localeCompare(b.platform))
  if (designer && !openDesign && due[0]) {
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

  const md = inRole(state, 'md')
  const pendingGoal = (state.goalProposals ?? []).some((item) => item.status === 'pending')
  if (md && company.management === 'managing_director' && company.goals.length === 0 && !pendingGoal) {
    return {
      kind: 'initiative',
      threadId: COMPANY_THREAD,
      staffId: md.id,
      prompt: company.businessType,
      intent: 'propose_goal',
      history: historyFor(state, COMPANY_THREAD, md.id),
    }
  }

  const opener = state.staff.find((person) => {
    const key = roleKeyOf(state, person)
    if (!DAY_TO_DAY_MANAGER_KEYS.has(key) || !isStaffActive(state, person)) return false
    if (key === 'md' && company.management !== 'managing_director') return false
    if (openWorkCount(state, person.id) >= 2) return false
    const laneBusy = state.tasks.some(
      (task) =>
        task.status === 'ready' &&
        (key === 'md' || task.departmentId === person.departmentId),
    )
    if (laneBusy) return false
    return company.goals.length > 0 && canOpenDayToDay(state, person, person.departmentId)
  })
  if (opener && company.goals[0]) {
    return {
      kind: 'initiative',
      threadId: COMPANY_THREAD,
      staffId: opener.id,
      prompt: company.goals[0].text,
      intent: 'spawn',
      taskTitle: company.goals[0].text,
      history: historyFor(state, COMPANY_THREAD, opener.id),
    }
  }

  const startable = state.tasks
    .filter((task) => task.status === 'ready' && task.assigneeId && isStaffIdActive(state, task.assigneeId))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title))[0]
  if (startable?.assigneeId) {
    return {
      kind: 'initiative',
      threadId: COMPANY_THREAD,
      staffId: startable.assigneeId,
      prompt: startable.title,
      intent: 'start',
      taskId: startable.id,
      taskTitle: startable.title,
      history: historyFor(state, COMPANY_THREAD, startable.assigneeId),
    }
  }

  const workable = state.tasks
    .filter((task) => {
      if (task.status !== 'in_progress' || !task.assigneeId || task.handoff) return false
      const step = currentStep(task)
      if (step?.kind !== 'work') return false
      return isStaffIdActive(state, task.assigneeId)
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.stepStartedAt ?? 0) - (b.stepStartedAt ?? 0))[0]
  if (workable?.assigneeId) {
    const person = state.staff.find((item) => item.id === workable.assigneeId)
    if (person && (state.agentSeen[person.id] ?? 0) + WORK_GAP <= now) {
      const already = state.chat.some(
        (message) => message.authorId === person.id && message.text.includes(workable.title) && message.at >= new Date((workable.stepStartedAt ?? now) - 1000).toISOString(),
      )
      if (!already) {
        return {
          kind: 'initiative',
          threadId: COMPANY_THREAD,
          staffId: person.id,
          prompt: workable.title,
          intent: 'work',
          taskId: workable.id,
          taskTitle: workable.title,
          history: historyFor(state, COMPANY_THREAD, person.id),
        }
      }
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

function isStaffIdActive(state: AppState, staffId: string | null): boolean {
  if (!staffId) return false
  const person = state.staff.find((item) => item.id === staffId)
  return person ? isStaffActive(state, person) : false
}
