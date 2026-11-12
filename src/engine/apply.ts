/**
 * Company command engine.
 *
 * The UI dispatches commands and renders the returned state. Walks, meetings,
 * and desk work are presence fields — the office must not animate anything
 * that is not represented here.
 *
 * Desktop control only runs while the owner has started an explicit, revocable
 * session (see START_DESKTOP_SESSION).
 */
import { isStaffActive, isStaffIdActive, staffById } from '../domain/active'
import { grantsFrom, permissionMeta } from '../domain/catalog'
import { COMPANY_THREAD, QUORUM_THREAD, directThreadId, emptyQuorumId, ensureChat, mentionsIn, titleFromAsk, withoutMarks } from '../chat/threads'
import {
  compileForOwner,
  isLineManager,
  lineThreadId,
  noteFor,
  ownerReportDue,
  reportCadence,
  reportsTo,
} from '../domain/reports'
import { designAudience } from '../domain/design-audience'
import { composePoster } from '../domain/poster'
import {
  calendarDocument,
  calendarSummary,
  formatLabel,
  monthNameForDay,
  offeringsFromGoals,
  planMissing,
  platformLabel,
} from '../domain/calendar'
import { documentPdf, pdfDataUrl } from '../lib/pdf'
import { invoicePdf } from '../lib/invoice-pdf'
import { proposalPdf } from '../lib/proposal-pdf'
import { documentOf, parseDocument, withWriter } from '../agents/writing'
import { appearanceAt, blankState, ensureOfferings, instantiateDepartments, instantiateRoles } from '../domain/sample'
import { nameForRole } from '../domain/staff-names'
import { meetingChairs, nextDesk, reportSpots } from '../office/world'
import { arrivalTime, settledPresence, walkingPresence } from '../office/presence'
import { iso, uid } from '../lib/format'
import { advanceLife, defaultLife, freshClock } from './life'
import { canOpenDayToDay, managingDirector } from '../domain/authority'
import { accountFor, normalizeSocial } from '../domain/social'
import { BILLING_PLANS, isPlanId } from '../domain/billing'
import { lessonFromOwner, remember, type MemoryKind } from '../domain/memory'
import { normalizeWebsite } from '../domain/website'
import { fileApprovalRecord } from '../domain/records'
import { clientLane, pickStaff } from '../domain/whatsapp'
import { planClientTurn, quoteText, readOwnerPrice, sameItem } from '../domain/whatsapp-sales'
import { actionLabel, approvalOutcome, rejectionOutcome } from './outcomes'
import type {
  ActivityEvent,
  AppState,
  CalendarDraft,
  CalendarPost,
  ChatMessage,
  Command,
  Design,
  DesignAudience,
  Company,
  CompanyInput,
  CompanyMetaStatus,
  Customer,
  CustomerCall,
  CustomerInvoice,
  ConsequentialAction,
  DesktopMode,
  EventKind,
  Handoff,
  PermissionId,
  PriceEntry,
  PlaybookStep,
  Pose,
  PresenceMode,
  RoleInput,
  Staff,
  StaffInput,
  StaffReport,
  Task,
  TaskInput,
  WaChat,
  WaMessage,
} from '../types'

/** Presence marker for a meeting the owner called from the office. Not a task. */
export const FLOOR_MEETING = 'floor-meeting'

export function currentStep(task: Task): PlaybookStep | null {
  return task.playbook[task.stepIndex] ?? null
}

export function canAdvanceTask(task: Task): boolean {
  if ((task.source !== 'staff' && task.source !== 'owner') || task.status !== 'in_progress') return false
  if (task.handoff) return true
  const step = currentStep(task)
  return step?.kind === 'work' || step?.kind === 'meet'
}

function learn(state: AppState, now: number, kind: MemoryKind, text: string): AppState {
  const memory = remember(state.memory, { id: uid('mem'), at: iso(now), kind, text })
  return memory === state.memory ? state : { ...state, memory }
}

export function applyCommand(incoming: AppState, command: Command, now: number): AppState {
  const state = ensureOfferings(ensureChat(incoming))
  switch (command.type) {
    case 'TICK':
      return scrubOrphanWhatsApp(tick(state, now))
    case 'REMEMBER':
      return learn(state, now, command.kind, command.text)
    case 'RESET':
      return {
        ...blankState(state.settings.reducedMotion),
        settings: {
          reducedMotion: state.settings.reducedMotion,
          showFloor: state.settings.showFloor,
          engineRunning: false,
          agentsWorking: state.settings.agentsWorking,
        },
      }
    case 'CREATE_COMPANY':
      return createCompany(state, command.input, now)
    case 'SET_BILLING_PLAN':
      return setBillingPlan(state, command.planId, now)
    case 'UPDATE_COMPANY':
      return updateCompany(state, command.patch, now)
    case 'ADD_GOAL':
      return addGoal(state, command.text, now)
    case 'REMOVE_GOAL':
      return removeGoal(state, command.goalId, now)
    case 'SET_MANAGEMENT':
      return setManagement(state, command.mode, now)
    case 'SET_DEPARTMENT':
      return setDepartment(state, command.departmentId, command.enabled, now)
    case 'ADD_DEPARTMENT':
      return addDepartment(state, command.name, command.summary, command.roomId, now)
    case 'SET_ROLE':
      return setRole(state, command.roleId, command.enabled, now)
    case 'ADD_ROLE':
      return addRole(state, command.input, now)
    case 'ADD_STAFF':
      return addStaff(state, command.input, now)
    case 'UPDATE_STAFF':
      return updateStaff(state, command.staffId, command.patch, now)
    case 'SET_STAFF_ENABLED':
      return setStaffEnabled(state, command.staffId, command.enabled, now)
    case 'SET_PERMISSION':
      return setPermission(state, command.staffId, command.permissionId, command.granted, now)
    case 'CREATE_TASK':
      return createTask(state, command.input, now)
    case 'UPDATE_TASK':
      return updateTask(state, command.taskId, command.patch, now)
    case 'STAFF_CREATE_TASK':
      return staffCreateTask(state, command.staffId, command.input, command.goalId, now)
    case 'PROPOSE_GOAL':
      return proposeGoal(state, command.staffId, command.text, now)
    case 'DECIDE_GOAL':
      return decideGoal(state, command.proposalId, command.decision, command.text, now)
    case 'SET_PRIORITY':
      return setPriority(state, command.taskId, command.priority, now)
    case 'PAUSE_TASK':
      return pauseTask(state, command.taskId, now)
    case 'RESUME_TASK':
      return resumeTask(state, command.taskId, now)
    case 'START_TASK':
      return startTask(state, command.taskId, now)
    case 'ASSIGN_TASK':
      return assignTask(state, command.taskId, command.staffId, now)
    case 'ADD_BLOCKER':
      return addBlocker(state, command.taskId, command.text, now)
    case 'CLEAR_BLOCKER':
      return clearBlocker(state, command.taskId, command.blockerId, now)
    case 'ADVANCE_TASK':
      return command.taskId ? advanceTask(state, command.taskId, now, true) : advanceAny(state, now)
    case 'COMPLETE_WORK':
      return completeStaffWork(state, command.taskId, command.staffId, command.text, command.result ?? '', now)
    case 'REVIEW_TASK':
      return reviewTask(state, command.taskId, command.decision, command.note, now)
    case 'DECIDE_APPROVAL':
      return decideApproval(state, command.approvalId, command.decision, command.note, now)
    case 'FILE_SPORTS_SLIP':
      return fileSportsSlip(state, command.title, command.detail, now)
    case 'FINISH_STAKE':
      return finishStake(state, command.taskId, command.result, now)
    case 'REQUEST_APPROVAL':
      return requestApproval(state, command.taskId, now)
    case 'CALL_MEETING':
      return callMeeting(state, now)
    case 'END_MEETING':
      return endMeeting(state, now)
    case 'SET_ON_CALL':
      return setOnCall(state, command.staffIds, now)
    case 'REQUEST_DESIGN':
      return requestDesign(state, command.brief, now, command.calendarId, command.audience)
    case 'SET_DESIGN_ART':
      return setDesignArt(state, command.designId, command.image ?? '')
    case 'PLAN_CALENDAR':
      return planCalendar(state, now, command.drafts)
    case 'REVIEW_DESIGN':
      return reviewDesign(state, command.designId, command.decision, command.note ?? '', now, command.by ?? 'owner')
    case 'SET_MARKETING_REVIEW':
      return setMarketingReview(state, command.enabled, now)
    case 'SET_REPORT_CADENCE':
      return setReportCadence(state, command.cadence, now)
    case 'SEND_MESSAGE':
      return sendMessage(state, command.threadId, command.text, now, command.wake !== false)
    case 'NEW_QUORUM_CHAT':
      return newQuorumChat(state, command.id, now)
    case 'RENAME_QUORUM_CHAT':
      return renameQuorumChat(state, command.threadId, command.name)
    case 'DELETE_QUORUM_CHAT':
      return deleteQuorumChat(state, command.threadId)
    case 'QUORUM_MESSAGE':
      return quorumSay(state, command.text, now, command.threadId)
    case 'MAKE_QUORUM_PDF':
      return makeQuorumPdf(state, command.messageId, now)
    case 'EDIT_QUORUM_DOCUMENT':
      return editQuorumDocument(state, command.messageId, command.body, command.title)
    case 'EDIT_OWNER_MESSAGE':
      return editOwnerMessage(state, command.messageId, command.text, now)
    case 'RETRY_QUORUM':
      return retryQuorum(state, command.threadId)
    case 'ASK_QUORUM_DESKTOP':
      return askQuorumDesktop(state, command.reason, command.prompt, now, command.threadId, command.steps)
    case 'DECIDE_QUORUM_DESKTOP':
      return decideQuorumDesktop(state, command.decision, now)
    case 'FINISH_QUORUM_DESKTOP':
      return finishQuorumDesktop(state, now)
    case 'SET_QUORUM_SCREEN':
      return setQuorumScreen(state, command.screen)
    case 'READ_THREAD':
      return readThread(state, command.threadId, now)
    case 'CREATE_GROUP':
      return createGroup(state, command.id, command.name, command.memberIds, now)
    case 'AGENT_MESSAGE':
      return agentMessage(
        state,
        command.threadId,
        command.staffId,
        command.text,
        command.designBrief ?? '',
        command.calendarId ?? '',
        Boolean(command.initiative),
        now,
      )
    case 'POST_MINUTES':
      return postMinutes(state, command.threadId, command.staffId, command.text, command.file, now)
    case 'SET_AGENTS':
      if (command.working === state.settings.agentsWorking) return state
      return { ...state, settings: { ...state.settings, agentsWorking: command.working } }
    case 'SET_REAL_TIME':
      if (command.value === Boolean(state.settings.realTime)) return state
      return withEvent(
        { ...state, settings: { ...state.settings, realTime: command.value } },
        now,
        {
          actorId: 'owner',
          actorName: ownerName(state),
          kind: 'system',
          audit: true,
          message: command.value
            ? 'Staff now follow the time on this computer. Morning, afternoon, and night match where you are.'
            : 'Staff are back on the office clock.',
        },
      )
    case 'SET_ENGINE':
      if (command.running === state.settings.engineRunning) return state
      return withEvent(
        { ...state, settings: { ...state.settings, engineRunning: command.running } },
        now,
        {
          actorId: 'owner',
          actorName: ownerName(state),
          kind: 'system',
          audit: true,
          message: command.running
            ? 'You turned on timed meeting advancement. Staff AI still does the real desk work when agents are working.'
            : 'You paused timed meeting advancement. Walks already in progress still finish. Staff AI can still complete work.',
        },
      )
    case 'SET_REDUCED_MOTION': {
      if (command.value === state.settings.reducedMotion) return state
      const next: AppState = { ...state, settings: { ...state.settings, reducedMotion: command.value } }
      if (!command.value) return next
      // A walk already on the floor should finish in state, not sit mid-stride with the motion removed.
      const snapped: AppState = {
        ...next,
        tasks: next.tasks.map((task) =>
          task.handoff && task.handoff.arriveAt > now
            ? { ...task, handoff: { ...task.handoff, arriveAt: now } }
            : task,
        ),
        staff: next.staff.map((person) =>
          person.presence.movingUntil > now
            ? { ...person, presence: { ...person.presence, movingUntil: now } }
            : person,
        ),
      }
      return resolvePresence(snapped, now)
    }
    case 'SET_FLOOR':
      if (command.visible === state.settings.showFloor) return state
      return { ...state, settings: { ...state.settings, showFloor: command.visible } }
    case 'SET_DESKTOP_AGENT':
      return setDesktopAgent(state, command.connected, now)
    case 'START_DESKTOP_SESSION':
      return startDesktopSession(state, command.mode, now)
    case 'END_DESKTOP_SESSION':
      return endDesktopSession(state, now)
    case 'CLEAR_DESKTOP_GRANT':
      return clearDesktopGrant(state, now)
    case 'SET_COMPANY_META':
      return setCompanyMeta(state, command.meta)
    case 'WHATSAPP_INBOUND':
      return receiveWhatsApp(state, command, now)
    case 'WHATSAPP_DELIVERY':
      return markWhatsAppDelivery(state, command.phone, command.messageId, command.status, now, command.error)
    case 'DECIDE_CALL':
      return decideCall(state, command.callId, command.decision, now)
    case 'COMPLETE_CALL':
      return completeCall(state, command.callId, command.conclusion, command.amount, command.voiceNote, now)
    case 'FOLLOW_UP':
      return followUpCustomer(state, command.customerId, command.channel, now)
    case 'WHATSAPP_DROP':
      return dropWhatsApp(state, command.phone)
    case 'CONFIRM_PRICE':
      return confirmListedPrice(state, command.item, command.amount, command.floor, now)
    case 'INSTAGRAM_RESULT':
      return instagramResult(state, command.designId, command.status, now, command.error, command.mediaId)
    default:
      return state
  }
}

function tick(state: AppState, now: number): AppState {
  const resolved = resolvePresence(state, now)
  const worked = resolved.settings.engineRunning ? advanceOneDueWork(resolved, now) : resolved
  return fileDayReports(advanceLife(worked, now), now)
}

function setReportCadence(state: AppState, cadence: AppState['settings']['reportCadence'], now: number): AppState {
  const next = cadence ?? 'daily'
  if (reportCadence(state) === next && state.settings.reportCadence !== undefined) return state
  const label = next === 'weekly' ? 'once a week' : next === 'monthly' ? 'once a month' : 'every office day'
  return withEvent(
    { ...state, settings: { ...state.settings, reportCadence: next } },
    now,
    {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'system',
      audit: true,
      message: `Line managers will send you the compiled report ${label}. Staff still file to their manager at close every office day. Nothing is emailed.`,
    },
  )
}

function fileDayReports(state: AppState, now: number): AppState {
  if (!state.company || !state.settings.agentsWorking) return state
  if (state.clock.minute < state.clock.closeMinute) return state
  let next = state
  if (next.clock.filedDay !== next.clock.day) next = fileStaffNotes(next, now)
  const cadence = reportCadence(next)
  if (ownerReportDue(cadence, next.clock.ownerReportDay, next.clock.day)) next = fileOwnerReports(next, now, cadence)
  return next
}

function fileStaffNotes(state: AppState, now: number): AppState {
  const day = state.clock.day
  const people = state.staff.filter((person) => isStaffActive(state, person) && person.managerId)
  const reports: StaffReport[] = [...(state.reports ?? []).filter((item) => item.day >= day - 40)]
  const chat = [...state.chat]
  for (const person of people) {
    const manager = state.staff.find((item) => item.id === person.managerId)
    if (!manager || !isStaffActive(state, manager)) continue
    const text = noteFor(person, state, day)
    if (!text) continue
    reports.push({ id: uid('rep'), staffId: person.id, managerId: person.managerId, day, text })
    const thread = state.threads.find((item) => item.id === lineThreadId(person.id))
    if (!thread) continue
    chat.push(
      chatMessage(now, {
        threadId: thread.id,
        authorId: person.id,
        authorName: person.name,
        text: text.slice(0, 700),
        mentions: [],
      }),
    )
  }
  return {
    ...state,
    reports,
    chat,
    clock: { ...state.clock, filedDay: day },
  }
}

function fileOwnerReports(state: AppState, now: number, cadence: NonNullable<AppState['settings']['reportCadence']>): AppState {
  const day = state.clock.day
  const since = state.clock.ownerReportDay
  const managers = state.staff.filter((person) => isStaffActive(state, person) && (isLineManager(state, person) || !person.managerId))
  const chat = [...state.chat]
  let sent = false
  for (const manager of managers) {
    const team = reportsTo(state, manager.id)
    const notes = (state.reports ?? []).filter(
      (item) => item.managerId === manager.id && item.day > since && item.day <= day,
    )
    if (team.length === 0 && notes.length === 0 && manager.managerId) continue
    const own: StaffReport = {
      id: uid('rep'),
      staffId: manager.id,
      managerId: null,
      day,
      text: noteFor(manager, state, day),
    }
    const text = compileForOwner(manager, [...notes, own], day, cadence)
    if (!text) continue
    const thread = state.threads.find((item) => item.id === directThreadId(manager.id))
    if (!thread) continue
    sent = true
    chat.push(
      chatMessage(now, {
        threadId: thread.id,
        authorId: manager.id,
        authorName: manager.name,
        text: text.slice(0, 1400),
        mentions: [],
      }),
    )
  }
  if (!sent) return { ...state, clock: { ...state.clock, ownerReportDay: day } }
  const next = {
    ...state,
    chat,
    clock: { ...state.clock, ownerReportDay: day },
  }
  return withEvent(next, now, {
    actorId: 'system',
    actorName: 'Office',
    kind: 'result',
    audit: false,
    message: `Line managers sent you the ${cadence} report in chat. Nothing was emailed.`,
  })
}

export function prime(state: AppState, now: number): AppState {
  let next = state
  next = startTask(next, 'task_campaign', now - 8_000)
  for (const id of ['task_coordinate', 'task_checklist', 'task_quotes', 'task_margin']) {
    next = startTask(next, id, now - 4_000)
  }
  next = startTask(next, 'task_riverside', now - 20_000)
  next = finishWorkOrMeet(next, 'task_riverside', now)
  next = startTask(next, 'task_social', now - 50_000)
  next = startTask(next, 'task_hire', now - 40_000)
  next = startTask(next, 'task_pr', now - 16_000)
  next = finishWorkOrMeet(next, 'task_pr', now)
  return next
}

/** Finishes walks and meetings that have already reached their time. Does not invent new work. */
export function resolvePresence(state: AppState, now: number): AppState {
  let current = state
  for (let pass = 0; pass < 8; pass += 1) {
    const handoffs = current.tasks.filter((task) => task.handoff && now >= task.handoff.arriveAt).map((task) => task.id)
    const meetings = current.tasks.filter((task) => meetingDue(task, now)).map((task) => task.id)
    if (handoffs.length === 0 && meetings.length === 0) break
    for (const id of handoffs) current = completeHandoffPhase(current, id, now)
    for (const id of meetings) current = finishWorkOrMeet(current, id, now)
  }
  return releaseReports(current, now)
}

/** A result is dropped in your office, then the person goes back to their own desk. */
function releaseReports(state: AppState, now: number): AppState {
  let next = state
  for (const person of state.staff) {
    if (person.presence.mode !== 'reporting') continue
    if (person.presence.movingUntil > now) continue
    if (person.presence.dwellUntil > now) continue
    next = goHome(next, person.id, now)
    next = withEvent(next, now, {
      actorId: person.id,
      actorName: person.name,
      kind: 'result',
      staffId: person.id,
      audit: false,
      message: `${person.name} left your office and went back to their desk.`,
    })
  }
  return next
}

function meetingDue(task: Task, now: number): boolean {
  const step = currentStep(task)
  return (
    step?.kind === 'meet' &&
    task.status === 'in_progress' &&
    task.stepStartedAt != null &&
    !task.handoff &&
    now >= task.stepStartedAt + step.durationMs
  )
}

function advanceAny(state: AppState, now: number): AppState {
  const resolved = resolvePresence(state, now)
  const target = resolved.tasks
    .filter((task) => canAdvanceTask(task))
    .sort((a, b) => (a.stepStartedAt ?? 0) - (b.stepStartedAt ?? 0))[0]
  if (!target) return resolved
  return advanceTask(resolved, target.id, now, true)
}

function advanceOneDueWork(state: AppState, now: number): AppState {
  // Timed auto-advance is for meetings only. Desk work is completed by staff AI (COMPLETE_WORK).
  const candidate = state.tasks
    .filter((task) => {
      const step = currentStep(task)
      return (
        task.status === 'in_progress' &&
        !task.handoff &&
        step?.kind === 'meet' &&
        task.stepStartedAt != null &&
        now >= task.stepStartedAt + step.durationMs &&
        isStaffIdActive(state, task.assigneeId)
      )
    })
    .sort((a, b) => (a.stepStartedAt ?? 0) - (b.stepStartedAt ?? 0))[0]
  if (!candidate) return state
  return finishWorkOrMeet(state, candidate.id, now)
}

function completeStaffWork(
  state: AppState,
  taskId: string,
  staffId: string,
  text: string,
  result: string,
  now: number,
): AppState {
  const task = taskOf(state, taskId)
  const person = state.staff.find((item) => item.id === staffId)
  const step = task ? currentStep(task) : null
  const body = text.trim()
  if (!task || !person || !body || task.assigneeId !== staffId) return state
  if (task.status !== 'in_progress' || task.handoff || step?.kind !== 'work') return state
  const message = chatMessage(now, {
    threadId: COMPANY_THREAD,
    authorId: person.id,
    authorName: person.name,
    text: body.slice(0, 1200),
    mentions: [],
  })
  let next: AppState = {
    ...state,
    chat: [...state.chat, message],
    agentSeen: { ...state.agentSeen, [person.id]: now },
    agentPulse: now,
  }
  next = withEvent(next, now, {
    actorId: person.id,
    actorName: person.name,
    kind: 'result',
    taskId,
    staffId: person.id,
    audit: true,
    message: `${person.name} filed work on “${task.title}” in the company chat.`,
  })
  next = patchTask(next, taskId, now, {
    stepIndex: task.stepIndex + 1,
    result: result.trim() || task.result,
  })
  return startCurrentStep(next, taskId, now)
}

function advanceTask(state: AppState, taskId: string, now: number, force: boolean): AppState {
  const task = taskOf(state, taskId)
  if (!task || !canAdvanceTask(task)) return state
  if (task.handoff) {
    if (!force && now < task.handoff.arriveAt) return state
    const ready = patchTask(state, taskId, now, {
      handoff: { ...task.handoff, arriveAt: Math.min(task.handoff.arriveAt, now) },
    })
    return completeHandoffPhase(ready, taskId, now)
  }
  const step = currentStep(task)
  if ((step?.kind === 'work' || step?.kind === 'meet') && task.stepStartedAt != null) {
    if (!force && now < task.stepStartedAt + step.durationMs) return state
    return finishWorkOrMeet(state, taskId, now)
  }
  return state
}

function finishWorkOrMeet(state: AppState, taskId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  const step = task ? currentStep(task) : null
  if (!task || !step) return state
  if (step.kind === 'work') {
    const person = staffById(state, task.assigneeId)
    let next = patchTask(state, taskId, now, { stepIndex: task.stepIndex + 1 })
    next = withEvent(next, now, {
      actorId: person?.id ?? 'system',
      actorName: person?.name ?? 'Quorum',
      kind: 'task',
      taskId,
      staffId: person?.id,
      audit: true,
      message: step.doneDetail,
    })
    return startCurrentStep(next, taskId, now)
  }
  if (step.kind === 'meet') {
    let next = state
    for (const person of state.staff) {
      if (person.presence.meetingTaskId === taskId) next = goHome(next, person.id, now)
    }
    next = patchTask(next, taskId, now, { stepIndex: task.stepIndex + 1 })
    next = withEvent(next, now, {
      actorId: task.assigneeId ?? 'system',
      actorName: staffById(state, task.assigneeId)?.name ?? 'Quorum',
      kind: 'meeting',
      taskId,
      audit: true,
      message: `The meeting “${task.title}” ended.`,
    })
    return startCurrentStep(next, taskId, now)
  }
  return state
}

function startTask(state: AppState, taskId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task) return state
  if (task.status === 'paused' && task.stepStartedAt != null) return state
  if (task.status !== 'ready' && task.status !== 'paused') return state
  if (task.playbook.length === 0) {
    const person = staffById(state, task.assigneeId)
    let next = patchTask(state, taskId, now, { status: 'in_progress', stepStartedAt: now, blockers: [] })
    if (person && isStaffActive(next, person)) next = placeAtDesk(next, person.id, now, 'desk')
    return withEvent(next, now, {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'task',
      taskId,
      staffId: person?.id,
      audit: true,
      message: person ? `You started “${task.title}” with ${person.name}.` : `You started “${task.title}”.`,
    })
  }
  return startCurrentStep(state, taskId, now)
}

function startCurrentStep(state: AppState, taskId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task) return state
  const step = currentStep(task)
  if (!step) return state
  switch (step.kind) {
    case 'work':
      return startWork(state, task, step, now)
    case 'handoff':
      return startHandoff(state, task, step, now)
    case 'meet':
      return startMeet(state, task, step, now)
    case 'approval':
      return openApproval(state, task, step.action, step.summary, step.detail, now)
    case 'report':
      return startReport(state, task, step.detail, step.result, now)
    default:
      return state
  }
}

function startWork(state: AppState, task: Task, step: Extract<PlaybookStep, { kind: 'work' }>, now: number): AppState {
  const person = staffById(state, task.assigneeId)
  if (!person || !isStaffActive(state, person)) {
    return blockTask(state, task.id, now, 'The assignee is inactive, so this step cannot start.')
  }
  let next = patchTask(state, task.id, now, { status: 'in_progress', stepStartedAt: now })
  next = placeAtDesk(next, person.id, now, 'desk')
  return withEvent(next, now, {
    actorId: person.id,
    actorName: person.name,
    kind: 'task',
    taskId: task.id,
    staffId: person.id,
    audit: false,
    message: step.startDetail,
  })
}

function startHandoff(state: AppState, task: Task, step: Extract<PlaybookStep, { kind: 'handoff' }>, now: number): AppState {
  const from = staffById(state, task.assigneeId)
  const to = staffById(state, step.toStaffId)
  if (!from || !to || !isStaffActive(state, from) || !isStaffActive(state, to)) {
    return blockTask(state, task.id, now, 'The handoff could not start because one of the people is inactive.')
  }
  const arriveAt = arrivalTime(from.presence, { x: to.deskX, y: to.deskY }, now, state.settings.reducedMotion)
  const handoff: Handoff = {
    fromStaffId: from.id,
    toStaffId: to.id,
    phase: 'delivering',
    walkerId: from.id,
    arriveAt,
    detail: step.detail,
    advancesPlaybook: true,
  }
  let next = patchTask(state, task.id, now, { status: 'in_progress', stepStartedAt: now, handoff })
  const room = state.departments.find((department) => department.id === to.departmentId)
  next = moveTo(next, from.id, to.deskX, to.deskY, room?.name ?? 'a desk', now, arriveAt, 'desk', null)
  return withEvent(next, now, {
    actorId: from.id,
    actorName: from.name,
    kind: 'handoff',
    taskId: task.id,
    staffId: from.id,
    audit: true,
    message: step.detail,
  })
}

function completeHandoffPhase(state: AppState, taskId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  const handoff = task?.handoff
  if (!task || !handoff || now < handoff.arriveAt) return state
  if (handoff.phase === 'delivering') {
    const to = staffById(state, handoff.toStaffId)
    const from = staffById(state, handoff.fromStaffId)
    if (!to || !from) return state
    const returnAt = arrivalTime(from.presence, { x: from.deskX, y: from.deskY }, now, state.settings.reducedMotion)
    let next = withEvent(state, now, {
      actorId: to.id,
      actorName: to.name,
      kind: 'arrival',
      taskId,
      staffId: to.id,
      audit: true,
      message: `${to.name} received this from ${from.name}.`,
    })
    next = patchTask(next, taskId, now, {
      assigneeId: to.id,
      departmentId: to.departmentId,
      stepIndex: handoff.advancesPlaybook ? task.stepIndex + 1 : task.stepIndex,
      handoff: { ...handoff, phase: 'returning', walkerId: from.id, arriveAt: returnAt },
    })
    next = moveTo(next, from.id, from.deskX, from.deskY, 'back to their desk', now, returnAt, 'desk', null)
    if (handoff.advancesPlaybook) return startCurrentStep(next, taskId, now)
    next = patchTask(next, taskId, now, { status: 'in_progress', stepStartedAt: now })
    next = placeAtDesk(next, to.id, now, 'desk')
    return withEvent(next, now, {
      actorId: to.id,
      actorName: to.name,
      kind: 'task',
      taskId,
      staffId: to.id,
      audit: true,
      message: `${to.name} took “${task.title}”.`,
    })
  }
  const walker = staffById(state, handoff.walkerId)
  let next = patchTask(state, taskId, now, { handoff: null })
  if (walker) next = goHome(next, walker.id, now)
  if (!walker) return next
  return withEvent(next, now, {
    actorId: walker.id,
    actorName: walker.name,
    kind: 'arrival',
    taskId,
    staffId: walker.id,
    audit: false,
    message: `${walker.name} is back at their desk.`,
  })
}

function setOnCall(state: AppState, staffIds: string[], now: number): AppState {
  const joining = new Set(staffIds)
  return {
    ...state,
    staff: state.staff.map((person) => {
      if (joining.has(person.id) && isStaffActive(state, person) && person.presence.pose !== 'away') {
        const here = person.presence.movingUntil > now ? person.presence : person.presence
        const atDesk = Math.hypot(here.x - person.deskX, here.y - person.deskY) < 0.4 && person.presence.movingUntil <= now
        if (atDesk) {
          return {
            ...person,
            presence: { ...person.presence, pose: 'call', mode: 'desk', label: 'On a call', lifeIntent: 'none' },
          }
        }
        const arriveAt = arrivalTime(person.presence, { x: person.deskX, y: person.deskY }, now, state.settings.reducedMotion)
        return {
          ...person,
          presence: walkingPresence(
            person.presence,
            { x: person.deskX, y: person.deskY },
            'On a call',
            now,
            arriveAt,
            'desk',
            null,
            'call',
            'none',
            state.settings.reducedMotion,
          ),
        }
      }
      if (person.presence.pose === 'call' || person.presence.label === 'On a call') {
        if (joining.has(person.id)) return person
        return {
          ...person,
          presence: {
            ...person.presence,
            pose: 'sit',
            label: person.presence.movingUntil > now ? 'their desk' : 'At desk',
            lifeIntent: person.presence.movingUntil > now ? person.presence.lifeIntent : 'none',
          },
        }
      }
      return person
    }),
  }
}

function callMeeting(state: AppState, now: number): AppState {
  const called = state.staff.filter(
    (person) => isStaffActive(state, person) && person.presence.pose !== 'away' && person.presence.lifeIntent !== 'leave' && !heldElsewhere(state, person),
  )
  if (called.length === 0) {
    return withEvent(state, now, {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'meeting',
      audit: true,
      message: 'You called a meeting, but nobody is in the office to attend.',
    })
  }
  const chairs = meetingChairs(state.staff.filter((person) => isStaffActive(state, person)).length)
  let next = state
  called.forEach((person, index) => {
    const spot = chairs[index % Math.max(chairs.length, 1)]
    if (!spot) return
    const arriveAt = arrivalTime(person.presence, spot, now, next.settings.reducedMotion)
    next = moveTo(next, person.id, spot.x, spot.y, 'Meeting room', now, arriveAt, 'meeting', FLOOR_MEETING, 'sit')
  })
  const held = state.staff.filter((person) => isStaffActive(state, person) && heldElsewhere(state, person)).map((person) => person.name)
  const skipNote = held.length > 0 ? ` ${held.join(', ')} stayed on work already in progress.` : ''
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'meeting',
    audit: true,
    message: `You called a meeting. ${called.length} ${called.length === 1 ? 'person is' : 'people are'} walking to the meeting room.${skipNote}`,
  })
}

function endMeeting(state: AppState, now: number): AppState {
  const attending = state.staff.filter((person) => person.presence.meetingTaskId === FLOOR_MEETING)
  if (attending.length === 0) return state
  let next = state
  for (const person of attending) next = goHome(next, person.id, now)
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'meeting',
    audit: true,
    message: 'You ended the meeting. People are walking back to their desks.',
  })
}

function heldElsewhere(state: AppState, person: Staff): boolean {
  if (person.presence.mode === 'reporting') return true
  if (person.presence.meetingTaskId && person.presence.meetingTaskId !== FLOOR_MEETING) return true
  return state.tasks.some((task) => task.handoff?.walkerId === person.id)
}

function startMeet(state: AppState, task: Task, step: Extract<PlaybookStep, { kind: 'meet' }>, now: number): AppState {
  let next = patchTask(state, task.id, now, { status: 'in_progress', stepStartedAt: now })
  const skipped: string[] = []
  let seat = 0
  for (const id of step.participantIds) {
    const person = staffById(next, id)
    if (!person || !isStaffActive(next, person)) continue
    if (next.tasks.some((item) => item.handoff?.walkerId === person.id)) {
      skipped.push(person.name)
      continue
    }
    const chairs = meetingChairs(next.staff.filter((member) => isStaffActive(next, member)).length)
    const spot = chairs[seat % Math.max(chairs.length, 1)]
    seat += 1
    if (!spot) continue
    const arriveAt = arrivalTime(person.presence, spot, now, next.settings.reducedMotion)
    next = moveTo(next, person.id, spot.x, spot.y, 'Meeting room', now, arriveAt, 'meeting', task.id, 'sit')
  }
  const skipNote = skipped.length > 0 ? ` ${skipped.join(', ')} stayed on a handoff already in progress.` : ''
  return withEvent(next, now, {
    actorId: task.assigneeId ?? 'owner',
    actorName: staffById(state, task.assigneeId)?.name ?? ownerName(state),
    kind: 'meeting',
    taskId: task.id,
    audit: true,
    message: `${step.detail}${skipNote}`,
  })
}

function startReport(state: AppState, task: Task, detail: string, result: string, now: number): AppState {
  const person = staffById(state, task.assigneeId)
  if (!person || !isStaffActive(state, person)) {
    return blockTask(state, task.id, now, 'Nobody active is available to report this result.')
  }
  let next = patchTask(state, task.id, now, { status: 'in_review', result, stepStartedAt: now })
  next = visitOwner(next, person.id, now)
  return withEvent(next, now, {
    actorId: person.id,
    actorName: person.name,
    kind: 'result',
    taskId: task.id,
    staffId: person.id,
    audit: true,
    message: `${person.name} is bringing a result to you. ${detail}`,
  })
}

function openApproval(
  state: AppState,
  task: Task,
  action: ConsequentialAction,
  summary: string,
  detail: string,
  now: number,
): AppState {
  if (state.approvals.some((approval) => approval.taskId === task.id && approval.status === 'pending')) return state
  const person = staffById(state, task.assigneeId)
  if (!person || !isStaffActive(state, person)) {
    return blockTask(state, task.id, now, 'The assignee is inactive, so the approval cannot be requested.')
  }
  if (!canRequest(person, action)) {
    const reason =
      action === 'desktop_control'
        ? `${person.name} cannot request desktop control because that permission is off.`
        : `${person.name} cannot request “${actionLabel(action)}” because that permission is revoked.`
    return blockTask(state, task.id, now, reason)
  }
  let next: AppState = {
    ...state,
    approvals: [
      {
        id: uid('apr'),
        taskId: task.id,
        action,
        requestedById: person.id,
        summary,
        detail,
        status: 'pending',
        createdAt: iso(now),
      },
      ...state.approvals,
    ],
  }
  next = patchTask(next, task.id, now, { status: 'waiting_for_owner', stepStartedAt: now })
  const stillWorking = state.tasks.some(
    (item) => item.assigneeId === person.id && item.id !== task.id && item.status === 'in_progress',
  )
  next = placeAtDesk(next, person.id, now, stillWorking ? 'desk' : 'waiting')
  const asked = summary.charAt(0).toLowerCase() + summary.slice(1)
  return withEvent(next, now, {
    actorId: person.id,
    actorName: person.name,
    kind: 'approval',
    taskId: task.id,
    staffId: person.id,
    audit: true,
    message: `${person.name} asked you to ${asked}`,
  })
}

function requestApproval(state: AppState, taskId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task?.consequential) return state
  if (state.approvals.some((approval) => approval.taskId === taskId && approval.status === 'pending')) return state
  const person = staffById(state, task.assigneeId)
  if (!person) return state
  if (!canRequest(person, task.consequential.action)) {
    return blockTask(
      state,
      taskId,
      now,
      task.consequential.action === 'desktop_control'
        ? `${person.name} cannot request desktop control because that permission is off.`
        : `${person.name} cannot request this because the permission is revoked.`,
    )
  }
  const opened = openApproval(state, task, task.consequential.action, task.consequential.summary, task.description, now)
  return patchTask(opened, taskId, now, { blockers: [] })
}

function decideApproval(
  state: AppState,
  approvalId: string,
  decision: 'approved' | 'rejected',
  note: string,
  now: number,
): AppState {
  const approval = state.approvals.find((item) => item.id === approvalId)
  if (!approval || approval.status !== 'pending') return state
  const outcome =
    decision === 'approved'
      ? approvalOutcome(approval.action, {
          sessionActive: state.desktop.sessionActive,
          mode: state.desktop.mode,
        })
      : rejectionOutcome(approval.action)
  const noted = note.trim() ? `${outcome} Note: ${note.trim()}` : outcome
  let next: AppState = {
    ...state,
    approvals: state.approvals.map((item) =>
      item.id === approvalId
        ? { ...item, status: decision, decidedAt: iso(now), note: note.trim() || undefined, outcome: noted }
        : item,
    ),
  }
  const task = taskOf(next, approval.taskId)
  const person = task ? staffById(next, task.assigneeId) : null
  if (decision === 'approved' && task) {
    const step = currentStep(task)
    if (
      approval.action === 'desktop_control' &&
      next.desktop.sessionActive &&
      next.desktop.mode &&
      person
    ) {
      next = {
        ...next,
        desktop: {
          ...next.desktop,
          grantedStaffId: person.id,
          grantedTaskId: task.id,
        },
      }
      next = patchTask(next, task.id, now, {
        status: 'in_progress',
        result: noted,
        blockers: [],
        stepIndex: step?.kind === 'approval' ? task.stepIndex + 1 : task.stepIndex,
        stepStartedAt: now,
      })
    } else {
      if (approval.action !== 'desktop_control') {
        const filed = fileApprovalRecord(
          next,
          approval.action,
          { id: task.id, title: task.title, description: task.description },
          person?.id,
          now,
        )
        next = filed.state
      }
      if (approval.action === 'bet_place') {
        const book = task.description.match(/https?:\/\/\S+/)?.[0]
        if (book) {
          next = {
            ...next,
            pendingStake: {
              taskId: task.id,
              instruction: `APPROVED STAKE. Open ${book}. Place only the plays named below. Do not withdraw and do not change the stake.\n${task.description}`.slice(
                0,
                4000,
              ),
            },
          }
        }
      }
      next = patchTask(next, task.id, now, {
        status: 'in_review',
        result: noted,
        blockers: [],
        stepIndex: step?.kind === 'approval' ? task.stepIndex + 1 : task.stepIndex,
      })
    }
    if (person) next = visitOwner(next, person.id, now)
  } else if (task) {
    next = patchTask(next, task.id, now, {
      status: 'blocked',
      blockers: [...task.blockers, { id: uid('blk'), text: outcome, at: iso(now) }],
    })
    if (person) next = goHome(next, person.id, now)
  }
  const kind = approval.action === 'desktop_control' ? 'desktop' : 'approval'
  const lesson =
    decision === 'approved'
      ? `The owner approved “${task?.title ?? 'that request'}”.`
      : `The owner rejected “${task?.title ?? 'that request'}”${note.trim() ? `: ${note.trim()}` : ''}.`
  return withEvent(learn(next, now, 'decision', lesson), now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind,
    taskId: approval.taskId,
    staffId: person?.id,
    audit: true,
    message: noted,
  })
}

function fileSportsSlip(state: AppState, title: string, detail: string, now: number): AppState {
  const person =
    state.staff.find((item) => item.id === 'staff_sable') ??
    state.staff.find((item) => state.roles.some((role) => role.id === item.roleId && role.key === 'sports_analyst'))
  const heading = title.trim().slice(0, 120)
  const body = detail.trim().slice(0, 4000)
  if (!state.company || !person || !isStaffActive(state, person) || !heading || !body) return state
  if (state.approvals.some((approval) => approval.status === 'pending' && approval.action === 'bet_place' && approval.summary === heading)) {
    return state
  }
  const id = uid('task')
  const task: Task = {
    id,
    title: heading,
    description: body,
    status: 'ready',
    priority: 'high',
    assigneeId: person.id,
    departmentId: person.departmentId,
    source: 'staff',
    playbook: [],
    stepIndex: 0,
    stepStartedAt: null,
    handoff: null,
    blockers: [],
    result: null,
    consequential: { action: 'bet_place', summary: heading },
    createdAt: iso(now),
    updatedAt: iso(now),
  }
  const withTask = withEvent({ ...state, tasks: [task, ...state.tasks] }, now, {
    actorId: person.id,
    actorName: person.name,
    kind: 'task',
    taskId: id,
    staffId: person.id,
    audit: true,
    message: `${person.name} filed a sports slip for “${heading}”.`,
  })
  return openApproval(withTask, task, 'bet_place', heading, body, now)
}

function finishStake(state: AppState, taskId: string, result: string, now: number): AppState {
  const note = result.trim().slice(0, 2000) || 'Quorum Desktop finished the approved slip.'
  const next = patchTask({ ...state, pendingStake: null }, taskId, now, { status: 'done', result: note })
  return withEvent(next, now, {
    actorId: 'quorum',
    actorName: 'Quorum',
    kind: 'result',
    taskId,
    audit: true,
    message: note,
  })
}

function reviewTask(state: AppState, taskId: string, decision: 'accept' | 'changes', note: string, now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task || task.status !== 'in_review') return state
  const person = staffById(state, task.assigneeId)
  if (decision === 'accept') {
    let next = patchTask(state, taskId, now, { status: 'done', stepIndex: Math.max(task.stepIndex, task.playbook.length) })
    if (person) next = goHome(next, person.id, now)
    const extra = note.trim() ? ` Note: ${note.trim()}` : ''
    return withEvent(learn(next, now, 'decision', `The owner accepted “${task.title}”${extra}`), now, {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'result',
      taskId,
      staffId: person?.id,
      audit: true,
      message: `You accepted the result for “${task.title}”. It stays in the audit log.${extra}`,
    })
  }
  let next = patchTask(state, taskId, now, {
    status: 'ready',
    result: null,
    stepIndex: rewindStep(task),
    stepStartedAt: null,
    handoff: null,
    blockers: [...task.blockers, { id: uid('blk'), text: `Changes requested: ${note.trim() || 'Please revise.'}`, at: iso(now) }],
  })
  if (person) next = goHome(next, person.id, now)
  return withEvent(learn(next, now, 'decision', `The owner wants changes on “${task.title}”: ${note.trim() || 'Please revise.'}`), now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    taskId,
    staffId: person?.id,
    audit: true,
    message: `You asked for changes on “${task.title}”: ${note.trim() || 'Please revise.'}`,
  })
}

function rewindStep(task: Task): number {
  const start = Math.min(task.stepIndex, Math.max(task.playbook.length - 1, 0))
  for (let index = start; index >= 0; index -= 1) {
    const kind = task.playbook[index]?.kind
    if (kind === 'work' || kind === 'approval') return index
  }
  return 0
}

function pauseTask(state: AppState, taskId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task || task.handoff) return state
  if (task.status !== 'in_progress' && task.status !== 'ready') return state
  let next = patchTask(state, taskId, now, { status: 'paused' })
  for (const person of state.staff) {
    if (person.presence.meetingTaskId === taskId) next = goHome(next, person.id, now)
  }
  const person = staffById(next, task.assigneeId)
  if (person && person.presence.mode !== 'reporting') next = goHome(next, person.id, now)
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    taskId,
    audit: true,
    message: `You paused “${task.title}”.`,
  })
}

function resumeTask(state: AppState, taskId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task || task.status !== 'paused') return state
  if (task.playbook.length > 0 && task.stepStartedAt == null) return startCurrentStep(state, taskId, now)
  const person = staffById(state, task.assigneeId)
  let next = patchTask(state, taskId, now, { status: 'in_progress', stepStartedAt: now })
  if (person && isStaffActive(next, person)) next = placeAtDesk(next, person.id, now, 'desk')
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    taskId,
    audit: true,
    message: `You resumed “${task.title}”.`,
  })
}

function assignTask(state: AppState, taskId: string, staffId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  const person = staffById(state, staffId)
  if (!task || !person || !isStaffActive(state, person) || task.handoff || task.status === 'done') return state
  if (task.assigneeId === staffId) return state
  const previous = staffById(state, task.assigneeId)
  const canWalk =
    previous &&
    isStaffActive(state, previous) &&
    (previous.roomId !== person.roomId || previous.deskX !== person.deskX) &&
    (task.status === 'in_progress' || task.status === 'ready')
  if (previous && canWalk) {
    const arriveAt = arrivalTime(previous.presence, { x: person.deskX, y: person.deskY }, now, state.settings.reducedMotion)
    const handoff: Handoff = {
      fromStaffId: previous.id,
      toStaffId: person.id,
      phase: 'delivering',
      walkerId: previous.id,
      arriveAt,
      detail: `${previous.name} is walking “${task.title}” to ${person.name}.`,
      advancesPlaybook: false,
    }
    let next = patchTask(state, taskId, now, { handoff })
    next = moveTo(next, previous.id, person.deskX, person.deskY, person.name, now, arriveAt, 'desk', null)
    return withEvent(next, now, {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'handoff',
      taskId,
      staffId: previous.id,
      audit: true,
      message: `You asked ${previous.name} to hand “${task.title}” to ${person.name}.`,
    })
  }
  let next = patchTask(state, taskId, now, { assigneeId: person.id, departmentId: person.departmentId })
  if (task.status === 'in_progress') next = placeAtDesk(next, person.id, now, 'desk')
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    taskId,
    staffId: person.id,
    audit: true,
    message: `You assigned “${task.title}” to ${person.name}.`,
  })
}

function addBlocker(state: AppState, taskId: string, text: string, now: number): AppState {
  const task = taskOf(state, taskId)
  const trimmed = text.trim()
  if (!task || !trimmed || task.handoff || task.status === 'done') return state
  let next = patchTask(state, taskId, now, {
    status: 'blocked',
    blockers: [...task.blockers, { id: uid('blk'), text: trimmed, at: iso(now) }],
  })
  const person = staffById(state, task.assigneeId)
  if (person) next = goHome(next, person.id, now)
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    taskId,
    audit: true,
    message: `You blocked “${task.title}”: ${trimmed}`,
  })
}

function clearBlocker(state: AppState, taskId: string, blockerId: string, now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task) return state
  const blockers = task.blockers.filter((blocker) => blocker.id !== blockerId)
  const status = blockers.length === 0 && task.status === 'blocked' ? 'ready' : task.status
  return patchTask(state, taskId, now, { blockers, status })
}

function setPriority(state: AppState, taskId: string, priority: Task['priority'], now: number): AppState {
  const task = taskOf(state, taskId)
  if (!task || task.priority === priority) return state
  const next = patchTask(state, taskId, now, { priority })
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    taskId,
    audit: true,
    message: `You set “${task.title}” to ${priority} priority.`,
  })
}

function createTask(state: AppState, input: TaskInput, now: number): AppState {
  const title = input.title.trim()
  const person = staffById(state, input.assigneeId)
  if (!state.company || !title || !person || !isStaffActive(state, person)) return state
  const id = uid('task')
  const created: Task = {
    id,
    title,
    description: input.description.trim(),
    status: 'ready',
    priority: input.priority,
    assigneeId: person.id,
    departmentId: input.departmentId || person.departmentId,
    source: 'owner',
    playbook: [],
    stepIndex: 0,
    stepStartedAt: null,
    handoff: null,
    blockers: [],
    result: null,
    consequential: input.consequential,
    createdAt: iso(now),
    updatedAt: iso(now),
  }
  return withEvent({ ...state, tasks: [created, ...state.tasks] }, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    taskId: id,
    staffId: person.id,
    audit: true,
    message: `You created “${title}” for ${person.name}. It is ready and has not been started.`,
  })
}

function updateTask(
  state: AppState,
  taskId: string,
  patch: Partial<Pick<TaskInput, 'title' | 'description' | 'priority' | 'assigneeId'>>,
  now: number,
): AppState {
  const task = taskOf(state, taskId)
  if (!task || task.status === 'done') return state
  const assignee = patch.assigneeId ? staffById(state, patch.assigneeId) : null
  if (patch.assigneeId && (!assignee || !isStaffActive(state, assignee))) return state
  const title = patch.title !== undefined ? patch.title.trim() : task.title
  if (!title) return state
  return patchTask(state, taskId, now, {
    title,
    description: patch.description !== undefined ? patch.description.trim() : task.description,
    priority: patch.priority ?? task.priority,
    assigneeId: assignee?.id ?? task.assigneeId,
    departmentId: assignee?.departmentId ?? task.departmentId,
  })
}

function staffCreateTask(
  state: AppState,
  staffId: string,
  input: TaskInput,
  goalId: string | undefined,
  now: number,
): AppState {
  const creator = staffById(state, staffId)
  const assignee = staffById(state, input.assigneeId)
  const title = input.title.trim()
  if (!state.company || !creator || !assignee || !title || !isStaffActive(state, assignee)) return state
  const departmentId = input.departmentId || assignee.departmentId
  if (!canOpenDayToDay(state, creator, departmentId)) return state
  if (goalId && !state.company.goals.some((goal) => goal.id === goalId)) return state
  const id = uid('task')
  const created: Task = {
    id,
    title,
    description: input.description.trim(),
    status: 'ready',
    priority: input.priority,
    assigneeId: assignee.id,
    departmentId,
    source: 'manager',
    createdById: creator.id,
    goalId,
    playbook: [],
    stepIndex: 0,
    stepStartedAt: null,
    handoff: null,
    blockers: [],
    result: null,
    consequential: input.consequential,
    createdAt: iso(now),
    updatedAt: iso(now),
  }
  const goal = goalId ? state.company.goals.find((item) => item.id === goalId) : undefined
  return withEvent({ ...state, tasks: [created, ...state.tasks] }, now, {
    actorId: creator.id,
    actorName: creator.name,
    kind: 'task',
    taskId: id,
    staffId: assignee.id,
    audit: true,
    message: goal
      ? `${creator.name} opened “${title}” for ${assignee.name} under “${goal.text}”.`
      : `${creator.name} opened “${title}” for ${assignee.name}.`,
  })
}

function proposeGoal(state: AppState, staffId: string, text: string, now: number): AppState {
  const trimmed = text.trim()
  const person = staffById(state, staffId)
  const md = managingDirector(state)
  if (!state.company || !person || !md || person.id !== md.id || !trimmed) return state
  if ((state.goalProposals ?? []).some((item) => item.status === 'pending')) return state
  const proposal = {
    id: uid('goalp'),
    text: trimmed,
    status: 'pending' as const,
    proposedById: person.id,
    createdAt: iso(now),
  }
  return withEvent({ ...state, goalProposals: [proposal, ...(state.goalProposals ?? [])] }, now, {
    actorId: person.id,
    actorName: person.name,
    kind: 'company',
    staffId: person.id,
    audit: true,
    message: `${person.name} proposed a company goal for your approval: ${trimmed}`,
  })
}

function decideGoal(
  state: AppState,
  proposalId: string,
  decision: 'approved' | 'rejected',
  text: string | undefined,
  now: number,
): AppState {
  const proposal = (state.goalProposals ?? []).find((item) => item.id === proposalId && item.status === 'pending')
  if (!proposal || !state.company) return state
  const nextText = (text ?? proposal.text).trim() || proposal.text
  const goalProposals = (state.goalProposals ?? []).map((item) =>
    item.id === proposalId ? { ...item, status: decision, text: nextText, decidedAt: iso(now) } : item,
  )
  if (decision === 'rejected') {
    return withEvent(learn({ ...state, goalProposals }, now, 'decision', `The owner declined the goal “${proposal.text}”.`), now, {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'company',
      audit: true,
      message: `You declined the goal “${proposal.text}”.`,
    })
  }
  const company = { ...state.company, goals: [...state.company.goals, { id: uid('goal'), text: nextText }] }
  return withEvent(learn({ ...state, company, goalProposals }, now, 'decision', `The owner approved the goal “${nextText}”.`), now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message: `You approved the goal “${nextText}”.`,
  })
}

function blockTask(state: AppState, taskId: string, now: number, text: string): AppState {
  const task = taskOf(state, taskId)
  if (!task) return state
  const next = patchTask(state, taskId, now, {
    status: 'blocked',
    blockers: [...task.blockers, { id: uid('blk'), text, at: iso(now) }],
  })
  return withEvent(next, now, {
    actorId: 'system',
    actorName: 'Quorum',
    kind: 'task',
    taskId,
    audit: true,
    message: text,
  })
}

function createCompany(state: AppState, input: CompanyInput, now: number): AppState {
  const name = input.name.trim()
  const goals = input.goals.map((goal) => goal.trim()).filter(Boolean)
  if (!name) return state
  const departmentKeys = new Set(input.enabledDepartmentKeys)
  const roleKeys = new Set(input.enabledRoleKeys)
  if (input.appointMd) {
    departmentKeys.add('executive')
    roleKeys.add('md')
  } else {
    roleKeys.delete('md')
  }
  const departments = instantiateDepartments(departmentKeys)
  const roles = instantiateRoles(roleKeys).map((role) => {
    const department = departments.find((item) => item.id === role.departmentId)
    return { ...role, enabled: role.enabled && Boolean(department?.enabled) }
  })
  let next: AppState = {
    ...blankState(state.settings.reducedMotion),
    settings: { ...state.settings, engineRunning: false },
    company: {
      id: uid('co'),
      name,
      businessType: input.businessType.trim() || 'Other',
      goals: goals.map((text) => ({ id: uid('goal'), text })),
      ownerName: input.ownerName.trim() || 'Owner',
      ownerTitle: input.ownerTitle,
      ownerGender: input.ownerGender,
      website: normalizeWebsite(input.website),
      social: normalizeSocial(input.social),
      management: input.appointMd ? 'managing_director' : 'direct',
      createdAt: iso(now),
      planId: 'starter',
    },
    departments,
    roles,
    clock: freshClock(now, 9 * 60 + 5),
  }
  const staff: Staff[] = []
  const taken = new Set<string>()
  for (const role of orderedRoles(roles.filter((role) => role.enabled))) {
    const department = departments.find((item) => item.id === role.departmentId)
    const manager = role.reportsToRoleId ? staff.find((person) => person.roleId === role.reportsToRoleId) ?? null : null
    staff.push(
      makeStaff(staff, {
        name: nameForRole(role.key, taken),
        title: role.title,
        roleId: role.id,
        departmentId: role.departmentId,
        managerId: manager?.id ?? null,
        purpose: role.purpose,
        responsibilities: [...role.responsibilities],
        roomId: department?.roomId ?? 'flex',
        permissions: role.defaultPermissions,
      }),
    )
    next = { ...next, staff: [...staff] }
  }
  return ensureChat(withEvent({ ...next, staff }, now, {
    actorId: 'owner',
    actorName: next.company?.ownerName ?? 'Owner',
    kind: 'company',
    audit: true,
    message: input.appointMd
      ? `${next.company?.ownerName} created ${name} and appointed a Managing Director.`
      : `${next.company?.ownerName} created ${name} and will manage it directly.`,
  }))
}

function updateCompany(
  state: AppState,
  patch: Partial<{
    name: string
    businessType: string
    ownerName: string
    ownerTitle: 'Chairman' | 'CEO'
    ownerGender: Company['ownerGender']
    website: string
    social: Company['social']
    invoiceProfile: Company['invoiceProfile']
  }>,
  now: number,
): AppState {
  if (!state.company) return state
  const company = {
    ...state.company,
    name: patch.name?.trim() || state.company.name,
    businessType: patch.businessType?.trim() || state.company.businessType,
    ownerName: patch.ownerName?.trim() || state.company.ownerName,
    ownerTitle: patch.ownerTitle ?? state.company.ownerTitle,
    ownerGender: patch.ownerGender ?? state.company.ownerGender,
    website: patch.website !== undefined ? normalizeWebsite(patch.website) : state.company.website,
    social: patch.social !== undefined ? normalizeSocial(patch.social) : state.company.social,
    invoiceProfile: patch.invoiceProfile !== undefined ? patch.invoiceProfile : state.company.invoiceProfile,
  }
  return withEvent({ ...state, company }, now, {
    actorId: 'owner',
    actorName: company.ownerName,
    kind: 'company',
    audit: true,
    message: `You updated the company profile for ${company.name}.`,
  })
}

function setBillingPlan(state: AppState, planId: string, now: number): AppState {
  if (!state.company || !isPlanId(planId) || (state.company.planId ?? 'starter') === planId) return state
  const company = { ...state.company, planId }
  return withEvent({ ...state, company }, now, {
    actorId: 'owner',
    actorName: company.ownerName,
    kind: 'company',
    audit: true,
    message: `You moved ${company.name} to the ${BILLING_PLANS.find((plan) => plan.id === planId)?.name ?? planId} plan.`,
  })
}

function addGoal(state: AppState, text: string, now: number): AppState {
  const trimmed = text.trim()
  if (!state.company || !trimmed) return state
  const company = { ...state.company, goals: [...state.company.goals, { id: uid('goal'), text: trimmed }] }
  return withEvent({ ...state, company }, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message: `You added a goal: ${trimmed}`,
  })
}

function removeGoal(state: AppState, goalId: string, now: number): AppState {
  if (!state.company) return state
  const goal = state.company.goals.find((item) => item.id === goalId)
  if (!goal) return state
  const company = { ...state.company, goals: state.company.goals.filter((item) => item.id !== goalId) }
  return withEvent({ ...state, company }, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message: `You removed the goal “${goal.text}”.`,
  })
}

function setManagement(state: AppState, mode: 'direct' | 'managing_director', now: number): AppState {
  if (!state.company || state.company.management === mode) return state
  let next: AppState = { ...state, company: { ...state.company, management: mode } }
  if (mode === 'managing_director') {
    next = {
      ...next,
      departments: next.departments.map((department) =>
        department.key === 'executive' ? { ...department, enabled: true } : department,
      ),
      roles: next.roles.map((role) => (role.key === 'md' ? { ...role, enabled: true } : role)),
    }
    const mdRole = next.roles.find((role) => role.key === 'md')
    const hasMd = mdRole ? next.staff.some((person) => person.roleId === mdRole.id && person.enabled) : true
    if (mdRole && !hasMd) {
      const department = next.departments.find((item) => item.id === mdRole.departmentId)
      const person = makeStaff(next.staff, {
        name: 'Managing Director',
        title: mdRole.title,
        roleId: mdRole.id,
        departmentId: mdRole.departmentId,
        managerId: null,
        purpose: mdRole.purpose,
        responsibilities: [...mdRole.responsibilities],
        roomId: department?.roomId ?? 'executive',
        permissions: mdRole.defaultPermissions,
      })
      next = { ...next, staff: [...next.staff, person] }
    }
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message:
      mode === 'managing_director'
        ? 'You appointed a Managing Director. Other executives report through that role.'
        : 'You are managing the company directly. The Managing Director leaves the floor.',
  })
}

function setDepartment(state: AppState, departmentId: string, enabled: boolean, now: number): AppState {
  const department = state.departments.find((item) => item.id === departmentId)
  if (!department || department.enabled === enabled) return state
  const next = {
    ...state,
    departments: state.departments.map((item) => (item.id === departmentId ? { ...item, enabled } : item)),
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message: enabled ? `You activated ${department.name}.` : `You deactivated ${department.name}. Their staff leave the floor.`,
  })
}

function addDepartment(state: AppState, name: string, summary: string, roomId: string, now: number): AppState {
  const trimmed = name.trim()
  if (!state.company || !trimmed) return state
  const known = new Set(['owner', 'executive', 'meeting', 'sales', 'marketing', 'comms', 'procurement', 'finance', 'people', 'technology', 'lounge', 'cafeteria', 'toilets', 'servers', 'operations', 'flex'])
  const department = {
    id: uid('dept'),
    key: uniqueKey(trimmed, state.departments.map((item) => item.key)),
    name: trimmed,
    summary: summary.trim() || 'Custom department.',
    roomId: known.has(roomId) ? roomId : 'flex',
    enabled: true,
    color: ['#3d6b4f', '#8a4b78', '#2a628a', '#8a6232'][state.departments.length % 4],
  }
  return withEvent({ ...state, departments: [...state.departments, department] }, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message: `You added the ${trimmed} department.`,
  })
}

function setRole(state: AppState, roleId: string, enabled: boolean, now: number): AppState {
  const role = state.roles.find((item) => item.id === roleId)
  if (!role || role.enabled === enabled) return state
  const next = { ...state, roles: state.roles.map((item) => (item.id === roleId ? { ...item, enabled } : item)) }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message: enabled ? `You activated the ${role.title} role.` : `You deactivated the ${role.title} role.`,
  })
}

function addRole(state: AppState, input: RoleInput, now: number): AppState {
  const title = input.title.trim()
  if (!state.company || !title) return state
  const role = {
    id: uid('role'),
    key: uniqueKey(title, state.roles.map((item) => item.key)),
    title,
    purpose: input.purpose.trim() || 'Custom role.',
    responsibilities: input.responsibilities.map((item) => item.trim()).filter(Boolean),
    departmentId: input.departmentId,
    reportsToRoleId: input.reportsToRoleId,
    enabled: true,
    defaultPermissions: [] as PermissionId[],
  }
  return withEvent({ ...state, roles: [...state.roles, role] }, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    audit: true,
    message: `You added the ${title} role. It starts with no tool access until you grant it on a person.`,
  })
}

function addStaff(state: AppState, input: StaffInput, now: number): AppState {
  const name = input.name.trim()
  const role = state.roles.find((item) => item.id === input.roleId)
  if (!state.company || !name || !role) return state
  const person = makeStaff(state.staff, {
    name,
    title: input.title.trim() || role.title,
    roleId: role.id,
    departmentId: input.departmentId || role.departmentId,
    managerId: input.managerId,
    purpose: input.purpose.trim() || role.purpose,
    responsibilities: input.responsibilities.map((item) => item.trim()).filter(Boolean),
    roomId: state.departments.find((item) => item.id === (input.departmentId || role.departmentId))?.roomId ?? 'flex',
    permissions: role.defaultPermissions,
  })
  return withEvent({ ...state, staff: [...state.staff, person] }, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    staffId: person.id,
    audit: true,
    message: `You added ${person.name} as ${person.title}.`,
  })
}

function updateStaff(
  state: AppState,
  staffId: string,
  patch: {
    name?: string
    title?: string
    purpose?: string
    responsibilities?: string[]
    managerId?: string | null
    photo?: string | null
  },
  now: number,
): AppState {
  const person = staffById(state, staffId)
  if (!person) return state
  const updated: Staff = {
    ...person,
    name: patch.name?.trim() || person.name,
    title: patch.title?.trim() || person.title,
    purpose: patch.purpose?.trim() || person.purpose,
    responsibilities: patch.responsibilities ? patch.responsibilities.map((item) => item.trim()).filter(Boolean) : person.responsibilities,
    managerId: patch.managerId === undefined ? person.managerId : patch.managerId,
    photo: patch.photo === undefined ? person.photo : patch.photo ?? undefined,
  }
  const next = patchStaff(state, staffId, updated)
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    staffId,
    audit: true,
    message: `You updated ${updated.name}.`,
  })
}

function setStaffEnabled(state: AppState, staffId: string, enabled: boolean, now: number): AppState {
  const person = staffById(state, staffId)
  if (!person || person.enabled === enabled) return state
  const next = patchStaff(state, staffId, { enabled })
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'company',
    staffId,
    audit: true,
    message: enabled ? `You returned ${person.name} to the floor.` : `You took ${person.name} off the floor.`,
  })
}

function setDesktopAgent(state: AppState, connected: boolean, now: number): AppState {
  if (state.desktop.agentConnected === connected) return state
  const next: AppState = {
    ...state,
    desktop: { ...state.desktop, agentConnected: connected },
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'desktop',
    audit: true,
    message: connected
      ? 'Desktop agent is ready on this computer. Start a session on Integrations when you want control available.'
      : 'Desktop agent is offline. Desktop control stays in Quorum; start a session once the agent is back.',
  })
}

function startDesktopSession(state: AppState, mode: DesktopMode, now: number): AppState {
  if (!state.desktop.agentConnected) return state
  if (state.desktop.sessionActive && state.desktop.mode === mode) return state
  const label = mode === 'live' ? 'Live' : 'Approved'
  if (state.desktop.sessionActive) {
    return withEvent({ ...state, desktop: { ...state.desktop, mode } }, now, {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'desktop',
      audit: true,
      message: `Desktop session is now ${label}. End it anytime.`,
    })
  }
  const next: AppState = {
    ...state,
    desktop: {
      ...state.desktop,
      agentConnected: true,
      sessionActive: true,
      mode,
      startedAt: iso(now),
      grantedStaffId: undefined,
      grantedTaskId: undefined,
    },
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'desktop',
    audit: true,
    message: `You started a ${label} desktop session. Staff with permission may request control; you can end the session anytime.`,
  })
}

function endDesktopSession(state: AppState, now: number): AppState {
  if (!state.desktop.sessionActive && !state.desktop.grantedStaffId) {
    if (state.desktop.mode === null) return state
  }
  const next: AppState = {
    ...state,
    quorumAsk:
      state.quorumAsk?.status === 'granted' ? { ...state.quorumAsk, status: 'pending' } : state.quorumAsk,
    desktop: {
      agentConnected: state.desktop.agentConnected,
      sessionActive: false,
      mode: null,
      startedAt: undefined,
      grantedStaffId: undefined,
      grantedTaskId: undefined,
      grantedQuorum: undefined,
    },
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'desktop',
    audit: true,
    message: 'You ended the desktop session. The screen is private again and the pointer will not move until you start another session.',
  })
}

function clearDesktopGrant(state: AppState, now: number): AppState {
  if (!state.desktop.grantedStaffId && !state.desktop.grantedTaskId) return state
  const next: AppState = {
    ...state,
    desktop: {
      ...state.desktop,
      grantedStaffId: undefined,
      grantedTaskId: undefined,
    },
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'desktop',
    audit: true,
    message:
      state.desktop.mode === 'approved'
        ? 'The bounded desktop run finished. Another approval is required for further control.'
        : 'Desktop grant cleared.',
  })
}

function setCompanyMeta(state: AppState, meta: CompanyMetaStatus): AppState {
  const same =
    state.meta?.appReady === meta.appReady &&
    state.meta?.canHost === meta.canHost &&
    state.meta?.instagram.connected === meta.instagram.connected &&
    state.meta?.instagram.source === meta.instagram.source &&
    state.meta?.instagram.username === meta.instagram.username &&
    state.meta?.instagram.accountId === meta.instagram.accountId &&
    state.meta?.whatsapp.connected === meta.whatsapp.connected &&
    state.meta?.whatsapp.source === meta.whatsapp.source &&
    state.meta?.whatsapp.phoneNumberId === meta.whatsapp.phoneNumberId &&
    state.meta?.whatsapp.displayPhone === meta.whatsapp.displayPhone
  if (same) return state
  return { ...state, meta }
}

function setPermission(state: AppState, staffId: string, permissionId: PermissionId, granted: boolean, now: number): AppState {
  const person = staffById(state, staffId)
  if (!person || Boolean(person.grants[permissionId]) === granted) return state
  const meta = permissionMeta(permissionId)
  const next = patchStaff(state, staffId, { grants: { ...person.grants, [permissionId]: granted } })
  let message = granted ? `You granted ${person.name} “${meta.label}”.` : `You revoked “${meta.label}” from ${person.name}.`
  if (meta.group === 'consequential') {
    message += granted ? ' They may ask. Each use still waits for your approval.' : ' They can no longer request it.'
  }
  if (permissionId === 'desktop.control') {
    message = granted
      ? `You granted ${person.name} permission to request desktop control. Start a desktop session on Integrations before they can use the computer.`
      : `You revoked desktop control for ${person.name}.${state.desktop.sessionActive ? ' End the session if you want the pointer locked again.' : ''}`
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: permissionId === 'desktop.control' ? 'desktop' : 'permission',
    staffId,
    audit: true,
    message,
  })
}

function makeStaff(
  existing: Staff[],
  input: {
    name: string
    title: string
    roleId: string
    departmentId: string
    managerId: string | null
    purpose: string
    responsibilities: string[]
    roomId: string
    permissions: PermissionId[]
  },
): Staff {
  const desk = nextDesk(
    input.roomId,
    existing.map((person) => ({ x: person.deskX, y: person.deskY })),
  )
  return {
    id: uid('staff'),
    name: input.name,
    title: input.title,
    roleId: input.roleId,
    departmentId: input.departmentId,
    managerId: input.managerId,
    purpose: input.purpose,
    responsibilities: input.responsibilities,
    grants: grantsFrom(input.permissions),
    appearance: appearanceAt(existing.length),
    deskX: desk.x,
    deskY: desk.y,
    roomId: desk.roomId,
    presence: settledPresence(desk.x, desk.y),
    life: defaultLife(existing.length),
    enabled: true,
  }
}

function orderedRoles<T extends { id: string; reportsToRoleId: string | null }>(roles: T[]): T[] {
  const result: T[] = []
  const pending = [...roles]
  for (let guard = 0; pending.length > 0 && guard < roles.length + 2; guard += 1) {
    const before = pending.length
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const role = pending[index]
      if (!role.reportsToRoleId || result.some((item) => item.id === role.reportsToRoleId)) {
        result.push(role)
        pending.splice(index, 1)
      }
    }
    if (pending.length === before) break
  }
  return result.concat(pending)
}

const REPORT_DWELL_MS = 4500

function visitOwner(state: AppState, staffId: string, now: number): AppState {
  const person = staffById(state, staffId)
  if (!person) return state
  const used = state.staff.filter((member) => member.id !== staffId && member.presence.mode === 'reporting').length
  const spot = reportSpots[used % reportSpots.length]
  const arriveAt = arrivalTime(person.presence, spot, now, state.settings.reducedMotion)
  const next = moveTo(state, staffId, spot.x, spot.y, 'Bringing a result to you', now, arriveAt, 'reporting', null, 'stand')
  const updated = staffById(next, staffId)
  if (!updated) return next
  const dwellUntil = (next.settings.reducedMotion ? now : arriveAt) + (next.settings.reducedMotion ? 0 : REPORT_DWELL_MS)
  return patchStaff(next, staffId, { presence: { ...updated.presence, dwellUntil } })
}

function moveTo(
  state: AppState,
  staffId: string,
  x: number,
  y: number,
  label: string,
  now: number,
  arriveAt: number,
  mode: PresenceMode,
  meetingTaskId: string | null,
  poseOverride?: Pose,
): AppState {
  const person = staffById(state, staffId)
  if (!person) return state
  const pose = poseOverride ?? (mode === 'desk' || mode === 'waiting' ? 'sit' : 'stand')
  return patchStaff(state, staffId, {
    presence: walkingPresence(
      person.presence,
      { x, y },
      label,
      now,
      state.settings.reducedMotion ? now : arriveAt,
      mode,
      meetingTaskId,
      pose,
      'none',
      state.settings.reducedMotion,
    ),
  })
}

function placeAtDesk(state: AppState, staffId: string, now: number, mode: PresenceMode): AppState {
  const person = staffById(state, staffId)
  if (!person) return state
  const label = mode === 'waiting' ? 'Waiting for you' : 'At desk'
  const aimed =
    person.presence.x === person.deskX &&
    person.presence.y === person.deskY &&
    !person.presence.meetingTaskId
  if (aimed && person.presence.movingUntil > now) {
    return patchStaff(state, staffId, { presence: { ...person.presence, mode, label } })
  }
  if (aimed) {
    return patchStaff(state, staffId, { presence: { ...settledPresence(person.deskX, person.deskY, mode, label) } })
  }
  if (person.presence.pose === 'away' && state.clock.minute < state.clock.openMinute + person.life.commute) {
    return state
  }
  const arriveAt = arrivalTime(person.presence, { x: person.deskX, y: person.deskY }, now, state.settings.reducedMotion)
  return moveTo(state, staffId, person.deskX, person.deskY, 'their desk', now, arriveAt, mode, null)
}

function goHome(state: AppState, staffId: string, now: number): AppState {
  const waiting = state.tasks.some((task) => task.assigneeId === staffId && task.status === 'waiting_for_owner')
  const working = state.tasks.some((task) => task.assigneeId === staffId && task.status === 'in_progress')
  return placeAtDesk(state, staffId, now, waiting && !working ? 'waiting' : 'desk')
}

function patchTask(state: AppState, taskId: string, now: number, patch: Partial<Task>): AppState {
  return {
    ...state,
    tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: iso(now) } : task)),
  }
}

function patchStaff(state: AppState, staffId: string, patch: Partial<Staff>): AppState {
  return {
    ...state,
    staff: state.staff.map((person) => (person.id === staffId ? { ...person, ...patch } : person)),
  }
}

function designerOf(state: AppState): Staff | null {
  const ids = new Set(state.roles.filter((role) => role.key === 'graphic_designer').map((role) => role.id))
  return state.staff.find((person) => ids.has(person.roleId) || person.id === 'staff_maya') ?? null
}

function roleKeyOf(state: AppState, person: Staff): string | undefined {
  return state.roles.find((role) => role.id === person.roleId)?.key
}

function socialOf(state: AppState): Staff | null {
  const ids = new Set(state.roles.filter((role) => role.key === 'social_manager').map((role) => role.id))
  return state.staff.find((person) => ids.has(person.roleId)) ?? null
}

function chatMessage(now: number, message: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
  return { id: uid('chat'), at: iso(now), ...message, mentions: message.mentions ?? [] }
}

function readThread(state: AppState, threadId: string, now: number): AppState {
  const stamp = iso(now)
  const threads = state.threads.map((thread) =>
    thread.id === threadId && thread.ownerReadAt !== stamp ? { ...thread, ownerReadAt: stamp } : thread,
  )
  if (threads.every((thread, index) => thread === state.threads[index])) return state
  return { ...state, threads }
}

function quorumThreadId(state: AppState, threadId?: string): string | undefined {
  if (threadId && state.threads.some((item) => item.id === threadId && item.kind === 'quorum')) return threadId
  const lastOwner = [...state.chat].reverse().find((message) => {
    const thread = state.threads.find((item) => item.id === message.threadId)
    return thread?.kind === 'quorum' && message.authorId === 'owner'
  })
  return lastOwner?.threadId ?? state.threads.find((item) => item.kind === 'quorum')?.id ?? QUORUM_THREAD
}

function editOwnerMessage(state: AppState, messageId: string, text: string, now: number): AppState {
  const body = text.trim()
  const index = state.chat.findIndex((item) => item.id === messageId && item.authorId === 'owner')
  const current = index >= 0 ? state.chat[index] : undefined
  if (!current || !body) return state
  const chat = state.chat.filter((item, at) => {
    if (item.id === messageId) return false
    if (item.threadId === current.threadId && at > index) return false
    return true
  })
  chat.splice(index, 0, { ...current, text: body.slice(0, 8000), at: iso(now) })
  const previousTitle = titleFromAsk(current.text)
  const first = chat.find((item) => item.threadId === current.threadId && item.authorId === 'owner')
  const threads = first
    ? state.threads.map((thread) => {
        if (thread.id !== current.threadId || thread.kind !== 'quorum') return thread
        if (thread.name !== 'Quorum' && thread.name !== 'New chat' && thread.name !== previousTitle) return thread
        return { ...thread, name: titleFromAsk(first.text) }
      })
    : state.threads
  return { ...state, chat, threads }
}

function retryQuorum(state: AppState, threadId: string): AppState {
  const last = [...state.chat].reverse().find((item) => item.threadId === threadId)
  if (!last || last.authorId !== 'quorum') return state
  return { ...state, chat: state.chat.filter((item) => item.id !== last.id) }
}

function renameQuorumChat(state: AppState, threadId: string, name: string): AppState {
  const next = name.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!next) return state
  const thread = state.threads.find((item) => item.id === threadId && item.kind === 'quorum')
  if (!thread || thread.name === next) return state
  return {
    ...state,
    threads: state.threads.map((item) => (item.id === threadId ? { ...item, name: next } : item)),
  }
}

function deleteQuorumChat(state: AppState, threadId: string): AppState {
  const thread = state.threads.find((item) => item.id === threadId && item.kind === 'quorum')
  if (!thread) return state
  const dropped = new Set(state.chat.filter((item) => item.threadId === threadId).map((item) => item.id))
  const screen = state.quorumScreen
  return {
    ...state,
    threads: state.threads.filter((item) => item.id !== threadId),
    chat: state.chat.filter((item) => item.threadId !== threadId),
    quorumAsk: state.quorumAsk?.threadId === threadId ? undefined : state.quorumAsk,
    quorumScreen: screen?.kind === 'pdf' && dropped.has(screen.messageId) ? null : screen,
  }
}

function newQuorumChat(state: AppState, id: string, now: number): AppState {
  if (!id.startsWith('thread_quorum')) return state
  if (state.threads.some((thread) => thread.id === id)) return state
  if (emptyQuorumId(state)) return state
  const thread = {
    id,
    kind: 'quorum' as const,
    name: 'New chat',
    memberIds: [] as string[],
    createdAt: iso(now),
    ownerReadAt: iso(now),
  }
  const at = state.threads.findIndex((item) => item.kind === 'company')
  const threads = [...state.threads]
  threads.splice(at >= 0 ? at + 1 : 0, 0, thread)
  return { ...state, threads }
}

function quorumSay(state: AppState, text: string, now: number, threadId?: string): AppState {
  const id = quorumThreadId(state, threadId)
  const thread = state.threads.find((item) => item.id === id)
  const parsed = parseDocument(text)
  const document = parsed.document && state.company
    ? { ...parsed.document, body: withWriter(parsed.document.body, state.company) }
    : parsed.document
  const body = withoutMarks(parsed.text).trim()
  const display = body || (document ? `Here is the ${document.kind}.` : '')
  if (!thread || thread.kind !== 'quorum' || !display) return state
  return {
    ...state,
    chat: [
      ...state.chat,
      chatMessage(now, {
        threadId: thread.id,
        authorId: 'quorum',
        authorName: 'Quorum',
        text: display.slice(0, 8000),
        mentions: [],
        document,
      }),
    ],
  }
}

function makeQuorumPdf(state: AppState, messageId: string, now: number): AppState {
  const message = state.chat.find((item) => item.id === messageId)
  if (!message || !state.company) return state
  const parsed = documentOf(message, state.company)
  const body = parsed?.body || withWriter(message.text, state.company)
  if (body.trim().length < 40) return state
  const title = parsed?.title || 'Proposal'
  const kind = parsed?.kind || 'proposal'
  const bytes = proposalPdf({
    title,
    kind,
    body,
    brand: state.company.name,
    writerName: state.company.ownerName,
    writerTitle: state.company.ownerTitle,
    website: state.company.website,
    preparedFor: parsed?.preparedFor,
    date: iso(now).slice(0, 10),
  })
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  const file = {
    name: `${slug || 'document'}.pdf`,
    mime: 'application/pdf',
    dataUrl: pdfDataUrl(bytes),
  }
  const document = { kind, title, body, preparedFor: parsed?.preparedFor }
  return {
    ...state,
    chat: state.chat.map((item) => (item.id === messageId ? { ...item, file, document } : item)),
    quorumScreen: { kind: 'pdf', messageId, title },
  }
}

function editQuorumDocument(state: AppState, messageId: string, body: string, title?: string): AppState {
  const message = state.chat.find((item) => item.id === messageId)
  if (!message || !state.company) return state
  const parsed = documentOf(message, state.company)
  const nextBody = withWriter(body, state.company).slice(0, 12000)
  if (!nextBody) return state
  const document = {
    kind: parsed?.kind || 'proposal',
    title: (title ?? parsed?.title ?? 'Proposal').trim().slice(0, 120) || 'Proposal',
    body: nextBody,
    preparedFor: parsed?.preparedFor,
  }
  return {
    ...state,
    chat: state.chat.map((item) =>
      item.id === messageId ? { ...item, document, file: undefined } : item,
    ),
    quorumScreen:
      state.quorumScreen?.kind === 'pdf' && state.quorumScreen.messageId === messageId
        ? null
        : state.quorumScreen,
  }
}

function askQuorumDesktop(
  state: AppState,
  reason: string,
  prompt: string,
  now: number,
  threadId?: string,
  steps?: string[],
): AppState {
  const why = reason.trim().slice(0, 180)
  const asked = prompt.trim().slice(0, 800)
  if (!why) return state
  if (state.quorumAsk?.status === 'pending' && state.quorumAsk.reason === why) return state
  const trail = (steps ?? state.quorumAsk?.steps ?? []).map((line) => line.slice(0, 180)).slice(0, 80)
  return {
    ...state,
    quorumAsk: {
      reason: why,
      prompt: asked,
      status: 'pending',
      at: iso(now),
      threadId: quorumThreadId(state, threadId ?? state.quorumAsk?.threadId),
      steps: trail.length ? trail : undefined,
    },
    desktop: { ...state.desktop, grantedQuorum: undefined },
  }
}

function setQuorumScreen(state: AppState, screen: AppState['quorumScreen']): AppState {
  if (!screen) {
    if (!state.quorumScreen) return state
    return { ...state, quorumScreen: null }
  }
  if (screen.kind === 'page') {
    const url = screen.url.trim().slice(0, 500)
    if (!/^https?:\/\//i.test(url)) return state
    return {
      ...state,
      quorumScreen: {
        kind: 'page',
        url,
        title: screen.title?.slice(0, 120),
        image: screen.image?.startsWith('http') ? screen.image.slice(0, 500) : undefined,
        summary: screen.summary?.slice(0, 800),
      },
    }
  }
  if (screen.kind === 'pdf') {
    const messageId = screen.messageId.trim()
    if (!messageId) return state
    return { ...state, quorumScreen: { kind: 'pdf', messageId, title: screen.title?.slice(0, 120) } }
  }
  const src = screen.src.trim()
  if (!src) return state
  if (src.startsWith('data:image/') && src.length > 400_000) return state
  if (!src.startsWith('data:image/') && !src.startsWith('http')) return state
  return {
    ...state,
    quorumScreen: {
      kind: 'image',
      src: src.slice(0, 400_000),
      caption: screen.caption?.slice(0, 160),
      made: screen.made,
    },
  }
}

function decideQuorumDesktop(state: AppState, decision: 'granted' | 'declined', now: number): AppState {
  const ask = state.quorumAsk
  if (!ask || ask.status !== 'pending') return state
  if (decision === 'declined') {
    return {
      ...state,
      quorumAsk: { ...ask, status: 'declined' },
      desktop: { ...state.desktop, grantedQuorum: undefined },
    }
  }
  if (!state.desktop.sessionActive) return state
  return {
    ...state,
    quorumAsk: { ...ask, status: 'granted', at: iso(now) },
    desktop: { ...state.desktop, grantedQuorum: true, grantedStaffId: undefined, grantedTaskId: undefined },
  }
}

function finishQuorumDesktop(state: AppState, now: number): AppState {
  if (!state.quorumAsk && !state.desktop.grantedQuorum) return state
  return {
    ...state,
    quorumAsk: state.quorumAsk ? { ...state.quorumAsk, status: 'done', at: iso(now) } : undefined,
    desktop: { ...state.desktop, grantedQuorum: undefined },
  }
}

function sendMessage(state: AppState, threadId: string, text: string, now: number, wake = true): AppState {
  const thread = state.threads.find((item) => item.id === threadId)
  const body = text.trim()
  if (!thread || !body) return state
  const alert = wake && thread.kind !== 'quorum'
  let mentions = alert ? mentionsIn(body, state.staff, thread.memberIds) : []
  if (alert && thread.kind === 'direct') {
    const personId = thread.memberIds[0]
    if (personId && !mentions.includes(personId)) mentions = [personId, ...mentions]
  }
  const message = chatMessage(now, {
    threadId: thread.id,
    authorId: 'owner',
    authorName: ownerName(state),
    text: body,
    mentions,
  })
  const taught = lessonFromOwner(body)
  let threads = state.threads
  if (thread.kind === 'quorum' && !state.chat.some((item) => item.threadId === thread.id && item.authorId === 'owner')) {
    const name = titleFromAsk(body)
    threads = state.threads.map((item) => (item.id === thread.id ? { ...item, name } : item))
  }
  const next = learnOwnerPrice(learn({ ...state, threads, chat: [...state.chat, message] }, now, 'fact', taught ?? ''), body, now)
  if (mentions.length === 0) return next
  const names = mentions
    .map((id) => state.staff.find((person) => person.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'task',
    audit: true,
    message: `You asked ${names.join(', ')} in ${thread.name}.`,
  })
}

function createGroup(state: AppState, id: string, name: string, memberIds: string[], now: number): AppState {
  const title = name.trim()
  const members = [...new Set(memberIds)].filter((staffId) => state.staff.some((person) => person.id === staffId))
  if (!title || members.length < 2 || state.threads.some((thread) => thread.id === id) || !id.startsWith('thread_')) return state
  const thread: AppState['threads'][number] = {
    id,
    kind: 'group',
    name: title,
    memberIds: members,
    createdAt: iso(now),
    ownerReadAt: iso(now),
  }
  return withEvent(
    { ...state, threads: [state.threads[0], thread, ...state.threads.slice(1)].filter((item): item is NonNullable<typeof item> => Boolean(item)) },
    now,
    {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'company',
      audit: true,
      message: `You created the group “${title}”.`,
    },
  )
}

function postMinutes(
  state: AppState,
  threadId: string,
  staffId: string,
  text: string,
  file: AppState['chat'][number]['file'],
  now: number,
): AppState {
  const person = state.staff.find((item) => item.id === staffId)
  const thread = state.threads.find((item) => item.id === threadId)
  if (!person || !thread || !file?.dataUrl) return state
  const message = chatMessage(now, {
    threadId: thread.id,
    authorId: person.id,
    authorName: person.name,
    text: text.trim() || 'Meeting minutes are in this PDF. Nothing was emailed.',
    mentions: [],
    file,
  })
  return withEvent(
    { ...state, chat: [...state.chat, message], agentSeen: { ...state.agentSeen, [person.id]: now } },
    now,
    {
      actorId: person.id,
      actorName: person.name,
      kind: 'result',
      staffId: person.id,
      audit: true,
      message: `${person.name} filed meeting minutes in ${thread.name}.`,
    },
  )
}

function agentMessage(
  state: AppState,
  threadId: string,
  staffId: string,
  text: string,
  designBrief: string,
  calendarId: string,
  initiative: boolean,
  now: number,
): AppState {
  const person = state.staff.find((item) => item.id === staffId)
  const thread = state.threads.find((item) => item.id === threadId)
  let body = text.trim()
  let brief = designBrief.trim()
  let scheduled = calendarId.trim()
  if (!person || !thread || !body) return state
  if ((brief || scheduled) && roleKeyOf(state, person) === 'graphic_designer' && state.designs.some((design) => design.status === 'in_review')) {
    body = 'I’m still waiting on a review of the graphic I already sent before I start another one.'
    brief = ''
    scheduled = ''
  }
  const message = chatMessage(now, {
    threadId: thread.id,
    authorId: person.id,
    authorName: person.name,
    text: body.slice(0, 700),
    mentions: [],
  })
  const seen = { ...state.agentSeen, [person.id]: now }
  let next: AppState = {
    ...state,
    chat: [...state.chat, message],
    agentSeen: seen,
    agentPulse: initiative ? now : state.agentPulse,
  }
  if (!brief && !scheduled) return next
  const designer = designerOf(next)
  if (!designer || designer.id !== person.id) return next
  return requestDesign(next, brief, now + 1, scheduled || undefined, undefined)
}

function planCalendar(state: AppState, now: number, drafts?: CalendarDraft[]): AppState {
  const planner = state.staff.find((person) => roleKeyOf(state, person) === 'marketing_manager' && isStaffActive(state, person))
  if (!planner || !state.company) return state
  const products = state.products.length > 0 ? state.products : offeringsFromGoals(state.company)
  const drafted = drafts && drafts.length > 0 ? drafts : planMissing(products, state.calendar, state.clock.day)
  if (drafted.length === 0) return state
  const posts: CalendarPost[] = drafted.map((post) => ({ ...post, id: uid('cal'), status: 'planned' as const }))
  const month = monthNameForDay(state.clock.day)
  const text = calendarSummary(products, posts, state.clock.day)
  const pdfBody = calendarDocument({
    company: state.company.name,
    businessType: state.company.businessType,
    planner: planner.name,
    month,
    products,
    posts,
    startDay: state.clock.day,
  })
  const bytes = documentPdf({
    title: `${state.company.name} — ${month} content calendar`,
    brand: state.company.name,
    lines: pdfBody.split('\n'),
  })
  const fileName = `${state.company.name.replace(/\s+/g, '-').toLowerCase()}-${month.toLowerCase()}-content-calendar.pdf`
  const message = chatMessage(now, {
    threadId: COMPANY_THREAD,
    authorId: planner.id,
    authorName: planner.name,
    text: `${text}\n\nI attached the full ${month} calendar PDF with weekdays, formats, and sizes.`,
    mentions: [],
    file: {
      name: fileName,
      mime: 'application/pdf',
      dataUrl: pdfDataUrl(bytes),
    },
  })
  return withEvent(
    {
      ...state,
      products,
      calendar: [...state.calendar, ...posts],
      chat: [...state.chat, message],
      agentSeen: { ...state.agentSeen, [planner.id]: now },
      agentPulse: now,
    },
    now,
    {
      actorId: planner.id,
      actorName: planner.name,
      kind: 'result',
      staffId: planner.id,
      audit: true,
      message: `${planner.name} wrote the ${month} content calendar (${posts.length} posts) and filed the PDF in chat. Nothing was posted.`,
    },
  )
}

function requestDesign(
  state: AppState,
  brief: string,
  now: number,
  calendarId?: string,
  forcedAudience?: DesignAudience,
): AppState {
  const designer = designerOf(state)
  if (!designer) return state
  const post = calendarId ? state.calendar.find((item) => item.id === calendarId && item.status === 'planned') : undefined
  if (calendarId && !post) return state
  const open = (state.designs ?? []).find((design) => design.status === 'in_review')
  if (open) {
    return withEvent(state, now, {
      actorId: designer.id,
      actorName: designer.name,
      kind: 'task',
      staffId: designer.id,
      audit: true,
      message: `${designer.name} is still waiting on your review of “${open.title}”.`,
    })
  }
  const product = post ? state.products.find((item) => item.id === post.productId) : undefined
  const text = post?.brief || brief.trim() || (state.company?.name ?? 'Quorum')
  const title = post?.title || (text.length > 28 ? `${text.slice(0, 27)}…` : text)
  const brand = state.company?.name ?? 'Quorum'
  const audience = forcedAudience ?? designAudience(text, post?.id)
  const internal = audience === 'internal'
  const marketer = marketingManager(state)
  const reviewer = internal ? 'owner' : state.settings.marketingReviews !== false && marketer ? 'marketing' : 'owner'
  const revision = (state.designs ?? []).length + 1
  const format = post?.format ?? 'flyer'
  const platform = internal ? undefined : post?.platform
  const destination = accountFor(state.company?.social, platform)
  const reviewThread = internal ? directThreadId(designer.id) : COMPANY_THREAD
  const design: Design = {
    id: uid('design'),
    title,
    brief: text,
    caption: internal
      ? `${text}. In-house only. Awaiting your approval in this chat before it goes to the company group. It will not go to social.`
      : post
        ? `${text} For ${platformLabel(post.platform)}${destination ? ` (${destination})` : ''}. Awaiting review before anything is scheduled.`
        : `${text}. Promotional graphic for ${brand}. Awaiting review before anything is scheduled.`,
    audience,
    threadId: reviewThread,
    reviewer,
    productName: product?.name,
    fact: product?.fact,
    artStatus: 'pending',
    svg: composePoster({
      title,
      brief: text,
      brand,
      productName: product?.name,
      fact: product?.fact || (internal ? text : undefined),
      platform,
      format,
      revision,
      kicker: internal ? 'Internal · Flyer' : undefined,
    }),
    createdById: designer.id,
    status: 'in_review',
    revision,
    calendarId: post?.id,
    platform,
    format,
  }
  const message = chatMessage(now, {
    threadId: reviewThread,
    authorId: designer.id,
    authorName: designer.name,
    text: internal
      ? `Here’s the in-house flyer for “${title}”. Please approve it here. After you approve it, I’ll put it in the company group. It will not go to Instagram or any social account.`
      : post
        ? `Finished the ${formatLabel(post.format)} for “${product?.name ?? title}”. It is the ${platformLabel(post.platform)} post${destination ? ` for ${destination}` : ''}. ${reviewer === 'marketing' && marketer ? `${marketer.name} will look at it first.` : 'Please review it before it goes anywhere.'}`
        : `Finished the promotional graphic for “${text}”. ${reviewer === 'marketing' && marketer ? `${marketer.name} will look at it first.` : 'Please review it before it can go to social.'}`,
    designId: design.id,
    mentions: [],
  })
  const calendar = post
    ? state.calendar.map((item) => (item.id === post.id ? { ...item, status: 'in_review' as const, designId: design.id } : item))
    : state.calendar
  return withEvent(
    { ...state, calendar, designs: [design, ...(state.designs ?? [])], chat: [...(state.chat ?? []), message] },
    now,
    {
      actorId: designer.id,
      actorName: designer.name,
      kind: 'result',
      staffId: designer.id,
      audit: true,
      message: internal
        ? `${designer.name} sent an in-house flyer to your direct chat for approval. It will not go to social.`
        : post
          ? `${designer.name} sent the ${platformLabel(post.platform)} ${formatLabel(post.format)} to the group chat. Nothing has been posted.`
          : `${designer.name} sent a promotional graphic to the group chat for review. Nothing has been posted.`,
    },
  )
}

function marketingManager(state: AppState): Staff | null {
  const ids = new Set(state.roles.filter((role) => role.key === 'marketing_manager').map((role) => role.id))
  return state.staff.find((person) => ids.has(person.roleId) && isStaffActive(state, person)) ?? null
}

function setMarketingReview(state: AppState, enabled: boolean, now: number): AppState {
  if ((state.settings.marketingReviews !== false) === enabled && state.settings.marketingReviews !== undefined) return state
  const designs = enabled
    ? state.designs
    : state.designs.map((design) =>
        design.status === 'in_review' && design.reviewer === 'marketing' ? { ...design, reviewer: 'owner' as const } : design,
      )
  return withEvent(
    { ...state, designs, settings: { ...state.settings, marketingReviews: enabled } },
    now,
    {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'system',
      audit: true,
      message: enabled
        ? 'The marketing manager will look at each graphic and can correct it, decline it, or approve it. You can still approve it yourself.'
        : 'You will review graphics yourself. The marketing manager will not approve them.',
    },
  )
}

function reviewThreadOf(design: Design, designer: Staff): string {
  return design.threadId || (design.audience === 'internal' ? directThreadId(designer.id) : COMPANY_THREAD)
}

function reviewDesign(
  state: AppState,
  designId: string,
  decision: 'approved' | 'changes' | 'declined',
  note: string,
  now: number,
  by: 'owner' | 'marketing',
): AppState {
  const design = (state.designs ?? []).find((item) => item.id === designId)
  const designer = designerOf(state)
  if (!design || design.status !== 'in_review' || !designer) return state
  const owner = ownerName(state)
  const marketer = marketingManager(state)
  const internal = design.audience === 'internal'
  const reviewThread = reviewThreadOf(design, designer)
  if (by === 'marketing' && (internal || !marketer)) return state
  if (decision === 'declined') {
    if (by !== 'marketing' || !marketer || internal) return state
    const reason = note.trim() || 'I am declining this graphic.'
    const declined: Design = { ...design, status: 'declined' }
    const message = chatMessage(now, {
      threadId: COMPANY_THREAD,
      authorId: marketer.id,
      authorName: marketer.name,
      text: `I’m declining “${design.title}”. ${reason} Nothing was posted.`,
      designId: design.id,
      mentions: [],
    })
    return withEvent(
      {
        ...state,
        designs: state.designs.map((item) => (item.id === design.id ? declined : item)),
        calendar: pointCalendar(state.calendar, design, design.id, 'declined'),
        chat: [...state.chat, message],
        agentSeen: { ...state.agentSeen, [marketer.id]: now },
        agentPulse: now,
      },
      now,
      {
        actorId: marketer.id,
        actorName: marketer.name,
        kind: 'approval',
        staffId: designer.id,
        audit: true,
        message: `${marketer.name} declined “${design.title}”. Nothing was posted.`,
      },
    )
  }
  if (by === 'marketing' && decision === 'approved' && marketer && !internal) {
    const passed: Design = { ...design, reviewer: 'owner' }
    const message = chatMessage(now, {
      threadId: COMPANY_THREAD,
      authorId: marketer.id,
      authorName: marketer.name,
      text: `I approve “${design.title}”. It’s ready for your final say. Nothing is posted until you approve it.`,
      designId: design.id,
      mentions: [],
    })
    return withEvent(
      {
        ...state,
        designs: state.designs.map((item) => (item.id === design.id ? passed : item)),
        chat: [...state.chat, message],
        agentSeen: { ...state.agentSeen, [marketer.id]: now },
        agentPulse: now,
      },
      now,
      {
        actorId: marketer.id,
        actorName: marketer.name,
        kind: 'approval',
        staffId: designer.id,
        audit: true,
        message: `${marketer.name} approved “${design.title}” and left the final say with you. Nothing was posted.`,
      },
    )
  }
  if (decision === 'changes') {
    const ask = note.trim() || 'Please revise the layout.'
    const nextRevision = design.revision + 1
    const brand = state.company?.name ?? 'Quorum'
    const revised: Design = {
      ...design,
      id: uid('design'),
      art: undefined,
      artStatus: 'pending',
      direction: ask,
      threadId: reviewThread,
      audience: design.audience ?? (internal ? 'internal' : 'promotional'),
      svg: composePoster({
        title: design.title,
        brief: design.brief,
        brand,
        productName: design.productName,
        fact: design.fact,
        platform: design.platform,
        format: design.format,
        revision: nextRevision,
        note: ask,
      }),
      caption: `${design.brief}. Revised after review: ${ask}`,
      status: 'in_review',
      revision: nextRevision,
      reviewer: internal
        ? 'owner'
        : by === 'marketing' || (state.settings.marketingReviews !== false && marketer)
          ? 'marketing'
          : 'owner',
    }
    const editor = by === 'marketing' && marketer && !internal ? marketer : null
    const ownerNote = chatMessage(now, {
      threadId: reviewThread,
      authorId: editor?.id ?? 'owner',
      authorName: editor?.name ?? owner,
      text: editor ? `Please change “${design.title}”: ${ask}` : `Changes requested: ${ask}`,
      designId: design.id,
      mentions: [],
    })
    const reply = chatMessage(now + 1, {
      threadId: reviewThread,
      authorId: designer.id,
      authorName: designer.name,
      text: `Revised “${design.title}” and sent the new version for review.`,
      designId: revised.id,
      mentions: [],
    })
    return withEvent(
      {
        ...state,
        designs: [revised, ...state.designs.map((item) => (item.id === design.id ? { ...item, status: 'changes' as const } : item))],
        calendar: internal ? state.calendar : pointCalendar(state.calendar, design, revised.id, 'in_review'),
        chat: [...state.chat, ownerNote, reply],
      },
      now,
      {
        actorId: editor?.id ?? 'owner',
        actorName: editor?.name ?? owner,
        kind: 'approval',
        staffId: designer.id,
        audit: true,
        message: editor
          ? `${editor.name} asked ${designer.name} to revise “${design.title}”.`
          : `You asked ${designer.name} to revise “${design.title}”.`,
      },
    )
  }
  if (internal) {
    const approved: Design = {
      ...design,
      status: 'approved',
      caption: `${design.brief}. Approved for the company group. In-house only — not for social.`,
    }
    const ownerNote = chatMessage(now, {
      threadId: reviewThread,
      authorId: 'owner',
      authorName: owner,
      text: `Approved “${design.title}” for the company group. It stays in-house.`,
      designId: design.id,
      mentions: [],
    })
    const published = chatMessage(now + 1, {
      threadId: COMPANY_THREAD,
      authorId: designer.id,
      authorName: designer.name,
      text: `Approved in-house flyer: “${design.title}”. For staff only — not for Instagram or any social account.`,
      designId: design.id,
      mentions: [],
    })
    return withEvent(
      {
        ...state,
        designs: state.designs.map((item) => (item.id === design.id ? approved : item)),
        chat: [...state.chat, ownerNote, published],
      },
      now,
      {
        actorId: 'owner',
        actorName: owner,
        kind: 'approval',
        staffId: designer.id,
        audit: true,
        message: `You approved the in-house flyer “${design.title}” and it went to the company group. It was not sent to social.`,
      },
    )
  }
  const social = socialOf(state)
  const channel = design.platform ? platformLabel(design.platform) : 'social'
  const destination = accountFor(state.company?.social, design.platform)
  const approved: Design = {
    ...design,
    status: 'held',
    caption:
      design.platform === 'instagram'
        ? destination
          ? `${design.brief} Approved for Instagram (${destination}). Ready to publish when the Graph API line is connected.`
          : `${design.brief} Approved for Instagram. Ready to publish when the Graph API line is connected.`
        : destination
          ? `${design.brief} Approved for ${channel}. Filed for ${destination}.`
          : design.platform
            ? `${design.brief} Approved for ${channel} and held in Quorum until that account is connected.`
            : `${design.brief}. Approved for social and held in Quorum until a social account is connected.`,
  }
  const ownerNote = chatMessage(now, {
    threadId: COMPANY_THREAD,
    authorId: 'owner',
    authorName: owner,
    text: `Approved “${design.title}” for social.`,
    designId: design.id,
    mentions: [],
  })
  const taken = social
    ? chatMessage(now + 1, {
        threadId: COMPANY_THREAD,
        authorId: social.id,
        authorName: social.name,
        text:
          design.platform === 'instagram'
            ? destination
              ? `I have the approved ${formatLabel(design.format ?? 'flyer')} for Instagram (${destination}). Caption: “${approved.caption}” I’ll publish it on Instagram when the Graph API line is connected on this server.`
              : `I have the approved ${formatLabel(design.format ?? 'flyer')} for Instagram. Caption: “${approved.caption}” I’ll publish it on Instagram when the Graph API line is connected on this server.`
            : destination
              ? `I have the approved ${formatLabel(design.format ?? 'flyer')} for ${channel} (${destination}). Caption: “${approved.caption}” It is filed for that account. Nothing was published on ${channel}.`
              : design.platform
                ? `I have the approved ${formatLabel(design.format ?? 'flyer')} for ${channel}. Caption: “${approved.caption}” ${channel} is not connected, so this stays in Quorum and nothing was posted.`
                : `I have the approved graphic and the caption is ready: “${approved.caption}” Social accounts are not connected, so this stays in Quorum and nothing was posted.`,
        designId: design.id,
        mentions: [],
      })
    : chatMessage(now + 1, {
        threadId: COMPANY_THREAD,
        authorId: 'owner',
        authorName: owner,
        text: 'Approved. There is no social media manager on staff, and no social account is connected, so nothing was posted.',
        designId: design.id,
        mentions: [],
      })
  return withEvent(
    {
      ...state,
      designs: state.designs.map((item) => (item.id === design.id ? approved : item)),
      calendar: pointCalendar(state.calendar, design, design.id, 'held'),
      chat: [...state.chat, ownerNote, taken],
    },
    now,
    {
      actorId: social?.id ?? 'owner',
      actorName: social?.name ?? owner,
      kind: 'approval',
      staffId: social?.id,
      audit: true,
      message: destination
        ? `${social?.name ?? owner} filed the approved graphic for ${channel} at ${destination}. It stays in Quorum.`
        : social
          ? `${social.name} took the approved promotional graphic. Social accounts are not connected, so it was not posted.`
          : `You approved “${design.title}”. No social account is connected, so it was not posted.`,
    },
  )
}

const ART_MAX = 400_000

function setDesignArt(state: AppState, designId: string, image: string): AppState {
  const design = (state.designs ?? []).find((item) => item.id === designId)
  if (!design) return state
  if (design.artStatus === 'ready' && design.art) return state
  const art = image.startsWith('data:image/') && image.length <= ART_MAX ? image : undefined
  if (!art && design.artStatus === 'studio') return state
  const next: Design = {
    ...design,
    art,
    artStatus: art ? 'ready' : 'studio',
    svg: composePoster({
      title: design.title,
      brief: design.brief,
      brand: state.company?.name ?? 'Quorum',
      productName: design.productName,
      fact: design.fact,
      platform: design.platform,
      format: design.format,
      revision: design.revision,
      art,
      kicker: design.audience === 'internal' ? 'Internal · Flyer' : undefined,
    }),
  }
  return { ...state, designs: state.designs.map((item) => (item.id === design.id ? next : item)) }
}

function pointCalendar(calendar: CalendarPost[], design: Design, designId: string, status: CalendarPost['status']): CalendarPost[] {
  return calendar.map((post) =>
    post.id === design.calendarId || post.designId === design.id ? { ...post, designId, status } : post,
  )
}

function receiveWhatsApp(state: AppState, command: Extract<Command, { type: 'WHATSAPP_INBOUND' }>, now: number): AppState {
  const company = state.company
  const phone = command.phone.replace(/\D/g, '')
  const text = command.text.trim().slice(0, 1000)
  const messageId = command.messageId.trim()
  if (!company || !phone || !text || !messageId) return state
  const chats = state.whatsapp ?? []
  if (chats.some((chat) => chat.messages.some((message) => message.id === messageId))) return state
  const lane = clientLane(text)
  const people = state.staff.map((person) => ({
    id: person.id,
    name: person.name,
    title: person.title,
    roleKey: state.roles.find((role) => role.id === person.roleId)?.key ?? '',
    departmentId: person.departmentId,
    active: isStaffActive(state, person),
  }))
  const name = command.name.trim().slice(0, 80) || phone
  const existing = chats.find((chat) => chat.id === phone)
  const locked = existing?.assigneeId ? people.find((item) => item.id === existing.assigneeId && item.active) : null
  const person = lane.refused ? null : locked ?? pickStaff(people, lane.keys)
  const sales = pickStaff(people, ['quote_specialist', 'sales_manager', 'account_executive'])
  const profile = state.company?.invoiceProfile
  const plan = planClientTurn({
    company: company.name,
    handler: person ? { id: person.id, name: person.name, title: person.title } : null,
    sales: sales ? { id: sales.id, name: sales.name, title: sales.title } : null,
    text,
    profileName: name,
    phone,
    sale: existing?.sale,
    history: existing?.messages ?? [],
    prices: state.prices ?? [],
    products: state.products ?? [],
    now,
    account: profile?.accountNumber
      ? { bankName: profile.bankName, accountName: profile.accountName, accountNumber: profile.accountNumber }
      : undefined,
  })
  const reply = plan.reply
  const clientMessage: WaMessage = { id: messageId, at: iso(now), author: 'client', text, status: 'received' }
  const replyMessage: WaMessage = {
    id: `wa_${messageId}`.slice(0, 140),
    at: iso(now, 1),
    author: 'quorum',
    text: reply,
    status: command.linked ? 'queued' : 'held',
  }
  let next = state
  let taskId = existing?.taskId ?? null
  if (person) {
    const prior = taskId ? taskOf(next, taskId) : null
    const title = `WhatsApp: ${text}`.slice(0, 80)
    if (prior && prior.assigneeId === person.id && prior.status !== 'done') {
      next = patchTask(next, prior.id, now, { description: `${prior.description}\n${name}: ${text}`.slice(0, 2000) })
      next = withEvent(next, now, {
        actorId: 'quorum',
        actorName: 'Quorum',
        kind: 'task',
        taskId: prior.id,
        staffId: person.id,
        audit: true,
        message: `${name} sent a follow-up on WhatsApp for ${person.name}.`,
      })
      taskId = prior.id
    } else {
      taskId = uid('task')
      const created: Task = {
        id: taskId,
        title,
        description: `${name} (${phone}) on the company WhatsApp: ${text}`,
        status: 'ready',
        priority: lane.priority,
        assigneeId: person.id,
        departmentId: person.departmentId,
        source: 'staff',
        playbook: [
          {
            kind: 'work',
            startDetail: `${person.name} is reading ${name}'s WhatsApp message.`,
            doneDetail: `${person.name} is handling the WhatsApp request. A price goes out only after it is confirmed.`,
            durationMs: 60_000,
          },
        ],
        stepIndex: 0,
        stepStartedAt: null,
        handoff: null,
        blockers: [],
        result: null,
        consequential: null,
        createdAt: iso(now),
        updatedAt: iso(now),
      }
      next = { ...next, tasks: [created, ...next.tasks] }
      next = withEvent(next, now, {
        actorId: 'quorum',
        actorName: 'Quorum',
        kind: 'handoff',
        taskId,
        staffId: person.id,
        audit: true,
        message: `Quorum gave “${title}” to ${person.name} from WhatsApp.`,
      })
    }
  }
  if (plan.customer) next = saveWhatsAppCustomer(next, phone, plan.customer, now)
  if (plan.invoice) next = saveWhatsAppInvoice(next, phone, plan.invoice, person?.id, now)
  if (plan.invoice || plan.resendInvoice) {
    const file = invoiceFile(next, phone, plan.invoice)
    if (file) replyMessage.file = file
  }
  if (plan.call) next = openCustomerCall(next, phone, name, plan.sale.item, now)
  for (const note of plan.notes) next = postStaffNote(next, note, now)
  const chat: WaChat = {
    id: phone,
    name: existing?.name && existing.name !== phone ? existing.name : name,
    phone,
    messages: [...(existing?.messages ?? []), clientMessage, replyMessage].slice(-80),
    assigneeId: person?.id ?? existing?.assigneeId ?? null,
    taskId,
    sale: plan.sale,
    linked: command.linked,
    updatedAt: iso(now),
  }
  return { ...next, whatsapp: [chat, ...chats.filter((item) => item.id !== phone)] }
}

function confirmListedPrice(state: AppState, item: string, amountText: string, floorText: string | undefined, now: number): AppState {
  const label = item.trim()
  const read = readOwnerPrice(`${label} ${amountText}`, [label])
  const floorRead = floorText ? readOwnerPrice(`${label} ${floorText}`, [label]) : null
  if (!label || !read) return state
  const floor = floorRead && nairaDigits(floorRead.amount) < nairaDigits(read.amount) ? floorRead.amount : undefined
  const entry: PriceEntry = { id: uid('price'), item: label, amount: read.amount, floor, confirmedAt: iso(now) }
  let next: AppState = { ...state, prices: [...(state.prices ?? []), entry] }
  const waiting = (next.whatsapp ?? []).filter(
    (chat) => chat.sale?.stage === 'awaiting_price' && chat.sale.item && sameItem(chat.sale.item, label),
  )
  for (const chat of waiting) {
    const correction = Boolean(chat.sale?.priceAmount && chat.sale.priceAmount !== read.amount)
    const reply = quoteText(chat.sale?.item || label, chat.sale?.detail, read.amount, correction)
    next = appendWhatsAppReply(next, chat.phone, reply, now, {
      ...(chat.sale ?? { stage: 'quoted' }),
      item: chat.sale?.item || label,
      stage: 'quoted',
      priceAmount: read.amount,
    })
  }
  const sales = salesPerson(next)
  if (sales && waiting.length > 0) {
    next = postStaffNote(
      next,
      {
        staffId: sales.id,
        staffName: sales.name,
        text: `Noted. ${label} is ${read.amount} as of today. I am sending that to ${waiting.map((chat) => chat.name).join(', ')} on WhatsApp.`,
      },
      now,
    )
  }
  return next
}

function learnOwnerPrice(state: AppState, body: string, now: number): AppState {
  const pending = (state.whatsapp ?? []).filter((chat) => chat.sale?.stage === 'awaiting_price' && chat.sale.item)
  if (pending.length === 0) return state
  const items = [...new Set(pending.map((chat) => chat.sale?.item ?? '').filter(Boolean))]
  const read = readOwnerPrice(body, items)
  if (!read) return state
  const item = read.item ?? (items.length === 1 ? items[0] : '')
  if (!item) return state
  return confirmListedPrice(state, item, read.amount, undefined, now)
}

function nairaDigits(amount: string): number {
  const value = Number(amount.replace(/[^\d.]/g, ''))
  return Number.isFinite(value) ? value : 0
}

function appendWhatsAppReply(
  state: AppState,
  phone: string,
  text: string,
  now: number,
  sale: WaChat['sale'],
): AppState {
  const digits = phone.replace(/\D/g, '')
  const whatsapp = (state.whatsapp ?? []).map((chat) => {
    if (chat.phone !== digits) return chat
    const message: WaMessage = {
      id: uid('wa'),
      at: iso(now),
      author: 'quorum',
      text,
      status: chat.linked === false ? 'held' : 'queued',
    }
    return { ...chat, messages: [...chat.messages, message].slice(-80), sale, updatedAt: iso(now) }
  })
  return { ...state, whatsapp }
}

function saveWhatsAppCustomer(
  state: AppState,
  phone: string,
  customer: { name: string; email?: string; address?: string; company?: string; item?: string },
  now: number,
): AppState {
  const list = state.customers ?? []
  const prior = list.find((item) => item.phone === phone)
  const saved: Customer = {
    id: prior?.id ?? uid('cust'),
    name: customer.name,
    phone,
    email: customer.email ?? prior?.email,
    address: customer.address ?? prior?.address,
    company: customer.company ?? prior?.company,
    item: customer.item ?? prior?.item,
    updatedAt: iso(now),
  }
  return {
    ...state,
    customers: [saved, ...list.filter((item) => item.phone !== phone)],
    records: [
      {
        id: uid('rec'),
        kind: 'crm' as const,
        title: saved.name,
        body: [saved.company, saved.phone, saved.email, saved.address, saved.item].filter(Boolean).join(' · ').slice(0, 500),
        status: 'filed' as const,
        at: iso(now),
      },
      ...(state.records ?? []),
    ].slice(0, 200),
  }
}

function saveWhatsAppInvoice(
  state: AppState,
  phone: string,
  invoice: { number: string; item: string; detail?: string; amount: string; customerName: string },
  staffId: string | undefined,
  now: number,
): AppState {
  const customer = (state.customers ?? []).find((item) => item.phone === phone)
  const saved: CustomerInvoice = {
    id: uid('inv'),
    number: invoice.number,
    customerId: customer?.id ?? uid('cust'),
    phone,
    customerName: invoice.customerName,
    item: invoice.item,
    detail: invoice.detail,
    amount: invoice.amount,
    at: iso(now),
  }
  return {
    ...state,
    invoices: [saved, ...(state.invoices ?? [])].slice(0, 200),
    records: [
      {
        id: uid('rec'),
        kind: 'finance' as const,
        title: `Invoice ${saved.number}`,
        body: `${saved.customerName} · ${saved.item} · ${saved.amount}`.slice(0, 500),
        staffId,
        status: 'filed' as const,
        at: iso(now),
      },
      ...(state.records ?? []),
    ].slice(0, 200),
  }
}

function postStaffNote(state: AppState, note: { staffId: string; staffName: string; text: string }, now: number): AppState {
  const direct = directThreadId(note.staffId)
  const askOwner = /opening price|approve a call|account number/i.test(note.text)
  const threadId = !askOwner && state.threads.some((thread) => thread.id === direct) ? direct : COMPANY_THREAD
  if (!state.threads.some((thread) => thread.id === threadId)) return state
  const message = chatMessage(now, {
    threadId,
    authorId: note.staffId,
    authorName: note.staffName,
    text: note.text.slice(0, 1200),
    mentions: [],
  })
  return { ...state, chat: [...state.chat, message] }
}

function salesPerson(state: AppState): { id: string; name: string } | null {
  const people = state.staff.map((person) => ({
    id: person.id,
    name: person.name,
    roleKey: state.roles.find((role) => role.id === person.roleId)?.key ?? '',
    active: isStaffActive(state, person),
  }))
  return pickStaff(people, ['quote_specialist', 'sales_manager', 'account_executive'])
}

function scrubOrphanWhatsApp(state: AppState): AppState {
  const titles = new Set(state.tasks.map((task) => task.title))
  const mentioned = (text: string) => /“(WhatsApp:[^”]+)”/.exec(text)?.[1]
  const chat = state.chat.filter((message) => {
    const title = mentioned(message.text)
    return !title || titles.has(title)
  })
  const events = state.events.filter((event) => {
    const title = mentioned(event.message)
    return !title || titles.has(title)
  })
  if (chat.length === state.chat.length && events.length === state.events.length) return state
  return { ...state, chat, events }
}

function dropWhatsApp(state: AppState, phone: string): AppState {
  const digits = phone.replace(/\D/g, '')
  const chat = (state.whatsapp ?? []).find((item) => item.phone === digits)
  const taskIds = new Set(
    state.tasks
      .filter((task) => task.title.startsWith('WhatsApp:') && task.description.includes(digits) && task.status !== 'done')
      .map((task) => task.id),
  )
  if (chat?.taskId) {
    const linked = taskOf(state, chat.taskId)
    if (linked && linked.status !== 'done') taskIds.add(linked.id)
  }
  if (!chat && taskIds.size === 0) return state
  const titles = state.tasks.filter((task) => taskIds.has(task.id)).map((task) => task.title)
  return {
    ...state,
    tasks: state.tasks.filter((task) => !taskIds.has(task.id)),
    events: state.events.filter((event) => !event.taskId || !taskIds.has(event.taskId)),
    chat: state.chat.filter((message) => !titles.some((title) => message.text.includes(title))),
    whatsapp: (state.whatsapp ?? []).filter((item) => item.phone !== digits),
  }
}

function instagramResult(
  state: AppState,
  designId: string,
  status: 'published' | 'failed',
  now: number,
  error?: string,
  mediaId?: string,
): AppState {
  const design = state.designs.find((item) => item.id === designId)
  if (!design || design.audience === 'internal') return state
  if (design.status === 'published' && status === 'published') return state
  const social = socialOf(state)
  const channel = design.platform ? platformLabel(design.platform) : 'Instagram'
  if (status === 'failed') {
    const note = (error ?? 'Instagram could not take that post.').slice(0, 280)
    if (!social) return state
    const message = chatMessage(now, {
      threadId: COMPANY_THREAD,
      authorId: social.id,
      authorName: social.name,
      text: `I could not publish “${design.title}” on Instagram. ${note} It stays held in Quorum.`,
      designId: design.id,
      mentions: [],
    })
    return withEvent(
      { ...state, chat: [...state.chat, message] },
      now,
      {
        actorId: social.id,
        actorName: social.name,
        kind: 'result',
        staffId: social.id,
        audit: true,
        message: `${social.name} could not publish “${design.title}” on Instagram. ${note}`,
      },
    )
  }
  const published: Design = {
    ...design,
    status: 'published',
    caption: `${design.brief} Published on Instagram${mediaId ? ` (${mediaId})` : ''}.`,
  }
  const records = (state.records ?? []).map((item) =>
    item.kind === 'social' && item.title === design.title && item.status === 'held'
      ? { ...item, status: 'filed' as const, body: `${item.body}\nPublished on Instagram${mediaId ? ` · ${mediaId}` : ''}.`.slice(0, 2000) }
      : item,
  )
  const taken = social
    ? chatMessage(now, {
        threadId: COMPANY_THREAD,
        authorId: social.id,
        authorName: social.name,
        text: `Published “${design.title}” on Instagram. Caption: “${design.brief}”`,
        designId: design.id,
        mentions: [],
      })
    : chatMessage(now, {
        threadId: COMPANY_THREAD,
        authorId: 'owner',
        authorName: ownerName(state),
        text: `“${design.title}” was published on Instagram.`,
        designId: design.id,
        mentions: [],
      })
  return withEvent(
    {
      ...state,
      designs: state.designs.map((item) => (item.id === design.id ? published : item)),
      calendar: pointCalendar(state.calendar, design, design.id, 'published'),
      records,
      chat: [...state.chat, taken],
    },
    now,
    {
      actorId: social?.id ?? 'owner',
      actorName: social?.name ?? ownerName(state),
      kind: 'result',
      staffId: social?.id,
      audit: true,
      message: `${social?.name ?? 'Quorum'} published “${design.title}” on ${channel}.`,
    },
  )
}

function invoiceFile(
  state: AppState,
  phone: string,
  planned?: { number: string; item: string; detail?: string; amount: string; customerName: string; email?: string; address?: string },
): { name: string; dataUrl: string } | null {
  const saved = (state.invoices ?? []).find((item) => item.phone === phone)
  const number = planned?.number ?? saved?.number
  const amount = planned?.amount ?? saved?.amount
  const item = planned?.item ?? saved?.item
  const customerName = planned?.customerName ?? saved?.customerName
  if (!state.company || !number || !amount || !item || !customerName) return null
  const customer = (state.customers ?? []).find((row) => row.phone === phone)
  const bytes = invoicePdf({
    brand: state.company.name,
    number,
    date: new Date().toISOString().slice(0, 10),
    customerName,
    phone,
    email: planned?.email ?? customer?.email,
    address: planned?.address ?? customer?.address,
    item,
    detail: planned?.detail ?? saved?.detail,
    amount,
    profile: state.company.invoiceProfile,
  })
  return { name: `${number}.pdf`, dataUrl: pdfDataUrl(bytes) }
}

function openCustomerCall(state: AppState, phone: string, name: string, item: string | undefined, now: number): AppState {
  const pending = (state.calls ?? []).some((call) => call.phone === phone && call.status !== 'called')
  if (pending) return state
  const call: CustomerCall = {
    id: uid('call'),
    phone,
    name,
    item,
    status: 'pending_approval',
    at: iso(now),
  }
  return { ...state, calls: [call, ...(state.calls ?? [])] }
}

function decideCall(state: AppState, callId: string, decision: 'agent' | 'owner', now: number): AppState {
  const call = (state.calls ?? []).find((item) => item.id === callId)
  if (!call || call.status !== 'pending_approval') return state
  const status = decision === 'owner' ? 'owner_calling' : 'approved_agent'
  return withEvent(
    {
      ...state,
      calls: (state.calls ?? []).map((item) => (item.id === callId ? { ...item, status } : item)),
    },
    now,
    {
      actorId: 'owner',
      actorName: ownerName(state),
      kind: 'task',
      audit: true,
      message: decision === 'owner' ? `You will call ${call.name}.` : `You approved a call to ${call.name}.`,
    },
  )
}

function completeCall(
  state: AppState,
  callId: string,
  conclusion: string,
  amountText: string | undefined,
  voiceNote: string | undefined,
  now: number,
): AppState {
  const call = (state.calls ?? []).find((item) => item.id === callId)
  const note = conclusion.trim()
  if (!call || call.status === 'called' || call.status === 'pending_approval' || !note) return state
  const priced = amountText ? readOwnerPrice(`${call.item ?? 'item'} ${amountText}`, [call.item ?? 'item']) : null
  const agreed = priced?.amount
  let next: AppState = {
    ...state,
    calls: (state.calls ?? []).map((item) =>
      item.id === callId
        ? { ...item, status: 'called' as const, conclusion: note.slice(0, 1000), agreedAmount: agreed, voiceNote, calledAt: iso(now) }
        : item,
    ),
  }
  const chat = (next.whatsapp ?? []).find((item) => item.phone === call.phone)
  const handler = chat?.assigneeId ? next.staff.find((person) => person.id === chat.assigneeId) : null
  const text = agreed
    ? `I spoke with my boss. We can proceed at ${agreed} for the ${call.item ?? 'order'}. ${
        (next.customers ?? []).some((customer) => customer.phone === call.phone && (customer.email || customer.address))
          ? 'Here is the invoice.'
          : 'Please send the name for the invoice, and an email or a delivery address.'
      }`
    : `I spoke with my boss. ${note}`
  if (agreed && chat) {
    const customer = (next.customers ?? []).find((item) => item.phone === call.phone)
    if (customer?.email || customer?.address) {
      const invoice = {
        number: `QSI-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${call.phone.slice(-4)}`,
        item: call.item ?? 'order',
        detail: chat.sale?.detail,
        amount: agreed,
        customerName: customer.name,
        email: customer.email,
        address: customer.address,
      }
      next = saveWhatsAppInvoice(next, call.phone, invoice, handler?.id, now)
      const file = invoiceFile(next, call.phone, invoice)
      next = appendWhatsAppReply(next, call.phone, text, now, {
        ...(chat.sale ?? { stage: 'invoiced' }),
        item: call.item,
        stage: 'invoiced',
        priceAmount: agreed,
        invoiceNumber: invoice.number,
      })
      if (file) {
        next = {
          ...next,
          whatsapp: (next.whatsapp ?? []).map((item) =>
            item.phone === call.phone
              ? { ...item, messages: item.messages.map((message, index) => (index === item.messages.length - 1 ? { ...message, file } : message)) }
              : item,
          ),
        }
      }
    } else {
      next = appendWhatsAppReply(next, call.phone, text, now, {
        ...(chat.sale ?? { stage: 'details' }),
        item: call.item,
        stage: 'details',
        priceAmount: agreed,
      })
    }
  } else if (chat) {
    next = appendWhatsAppReply(next, call.phone, text, now, chat.sale)
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'result',
    audit: true,
    message: `You called ${call.name}. ${note.slice(0, 180)}`,
  })
}

function followUpCustomer(state: AppState, customerId: string, channel: 'whatsapp' | 'email' | 'call', now: number): AppState {
  const customer = (state.customers ?? []).find((item) => item.id === customerId)
  if (!customer || !state.company) return state
  const text = `Hello ${customer.name}, this is ${state.company.name}. We wanted to check in and see how you are getting on.`
  if (channel === 'email') {
    return {
      ...state,
      records: [
        {
          id: uid('rec'),
          kind: 'email' as const,
          title: `Check in with ${customer.name}`,
          body: `${text}${customer.email ? ` Email: ${customer.email}` : ' No email saved yet.'}`,
          status: 'held' as const,
          at: iso(now),
        },
        ...(state.records ?? []),
      ].slice(0, 200),
    }
  }
  if (channel === 'call') return openCustomerCall(state, customer.phone, customer.name, customer.item, now)
  const chat = (state.whatsapp ?? []).find((item) => item.phone === customer.phone)
  if (!chat) return state
  return appendWhatsAppReply(state, customer.phone, text, now, chat.sale)
}

function markWhatsAppDelivery(
  state: AppState,
  phone: string,
  messageId: string,
  status: 'sending' | 'sent' | 'held' | 'failed',
  now: number,
  error?: string,
): AppState {
  const digits = phone.replace(/\D/g, '')
  let changed = false
  const whatsapp = (state.whatsapp ?? []).map((chat) => {
    if (chat.phone !== digits) return chat
    const messages = chat.messages.map((message) => {
      if (message.id !== messageId) return message
      if (message.status === 'sent' && status !== 'sent') return message
      if (message.status === status && message.error === error) return message
      changed = true
      return { ...message, status, error: error?.slice(0, 240) }
    })
    return { ...chat, messages, updatedAt: iso(now) }
  })
  return changed ? { ...state, whatsapp } : state
}

function withEvent(
  state: AppState,
  now: number,
  event: {
    actorId: string
    actorName: string
    kind: EventKind
    message: string
    audit: boolean
    taskId?: string
    staffId?: string
  },
): AppState {
  const full: ActivityEvent = { id: uid('evt'), at: iso(now), ...event }
  return { ...state, events: [full, ...state.events].slice(0, 400) }
}

function taskOf(state: AppState, taskId: string): Task | null {
  return state.tasks.find((task) => task.id === taskId) ?? null
}

function ownerName(state: AppState): string {
  return state.company?.ownerName ?? 'Owner'
}

function canRequest(person: Staff, action: ConsequentialAction): boolean {
  return requestKeys(action).some((key) => person.grants[key] === true)
}

function requestKeys(action: ConsequentialAction): PermissionId[] {
  switch (action) {
    case 'send_external':
      return ['email.send_external']
    case 'publish_public':
      return ['social.publish', 'pr.publish']
    case 'purchase':
      return ['purchase.create']
    case 'finance_change':
      return ['finance.write']
    case 'hiring':
      return ['hr.hire']
    case 'trade_execute':
      return ['trade.execute']
    case 'bet_place':
      return ['bet.place']
    case 'desktop_control':
      return ['desktop.control']
  }
}

function uniqueKey(text: string, existing: string[]): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item'
  let key = base
  let n = 2
  while (existing.includes(key)) {
    key = `${base}_${n}`
    n += 1
  }
  return key
}
