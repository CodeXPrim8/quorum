/**
 * Local mock task engine.
 *
 * The UI dispatches commands and renders the returned state. Walks, meetings,
 * and desk work are presence fields — the office must not animate anything
 * that is not represented here.
 *
 * Replace this module with a real agent backend later. Keep Command and
 * AppState, or adapt the store in one place. This file never marks an
 * integration connected. desktop.agentConnected stays false: the build
 * cannot see or control the computer.
 */
import { isStaffActive, isStaffIdActive, staffById } from '../domain/active'
import { grantsFrom, permissionMeta } from '../domain/catalog'
import { COMPANY_THREAD, directThreadId, ensureChat, mentionsIn } from '../chat/threads'
import {
  compileForOwner,
  isLineManager,
  lineThreadId,
  noteFor,
  ownerReportDue,
  reportCadence,
  reportsTo,
} from '../domain/reports'
import { campaignPoster, type PosterShape } from '../domain/poster'
import { calendarSummary, formatLabel, offeringsFromGoals, planMissing, platformLabel } from '../domain/calendar'
import { appearanceAt, bareSample, blankState, ensureOfferings, instantiateDepartments, instantiateRoles } from '../domain/sample'
import { meetingChairs, nextDesk, reportSpots } from '../office/world'
import { arrivalTime, settledPresence, walkingPresence } from '../office/presence'
import { iso, uid } from '../lib/format'
import { advanceLife, defaultLife, freshClock } from './life'
import { actionLabel, approvalOutcome, rejectionOutcome } from './outcomes'
import type {
  ActivityEvent,
  AppState,
  CalendarPost,
  ChatMessage,
  Command,
  Design,
  Company,
  CompanyInput,
  ConsequentialAction,
  EventKind,
  Handoff,
  PermissionId,
  PlaybookStep,
  Pose,
  PostFormat,
  PresenceMode,
  RoleInput,
  Settings,
  Staff,
  StaffInput,
  StaffReport,
  Task,
  TaskInput,
} from '../types'

/** Presence marker for a meeting the owner called from the office. Not a task. */
export const FLOOR_MEETING = 'floor-meeting'

export function currentStep(task: Task): PlaybookStep | null {
  return task.playbook[task.stepIndex] ?? null
}

export function canAdvanceTask(task: Task): boolean {
  if (task.source !== 'demo_playbook' || task.status !== 'in_progress') return false
  if (task.handoff) return true
  const step = currentStep(task)
  return step?.kind === 'work' || step?.kind === 'meet'
}

export function createSampleState(now: number, prefs?: Partial<Settings>): AppState {
  const state: AppState = {
    ...bareSample(now),
    settings: {
      reducedMotion: prefs?.reducedMotion ?? false,
      showFloor: prefs?.showFloor ?? true,
      engineRunning: false,
      agentsWorking: prefs?.agentsWorking ?? true,
    },
  }
  const primed = prime(ensureChat(state), now)
  return primed.settings.reducedMotion ? resolvePresence(primed, now) : primed
}

export function applyCommand(incoming: AppState, command: Command, now: number): AppState {
  const state = ensureOfferings(ensureChat(incoming))
  switch (command.type) {
    case 'TICK':
      return tick(state, now)
    case 'LOAD_SAMPLE':
      return createSampleState(now, {
        reducedMotion: state.settings.reducedMotion,
        showFloor: state.settings.showFloor,
      })
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
    case 'REVIEW_TASK':
      return reviewTask(state, command.taskId, command.decision, command.note, now)
    case 'DECIDE_APPROVAL':
      return decideApproval(state, command.approvalId, command.decision, command.note, now)
    case 'REQUEST_APPROVAL':
      return requestApproval(state, command.taskId, now)
    case 'CALL_MEETING':
      return callMeeting(state, now)
    case 'END_MEETING':
      return endMeeting(state, now)
    case 'SET_ON_CALL':
      return setOnCall(state, command.staffIds, now)
    case 'REQUEST_DESIGN':
      return requestDesign(state, command.brief, now, command.calendarId)
    case 'PLAN_CALENDAR':
      return planCalendar(state, now)
    case 'REVIEW_DESIGN':
      return reviewDesign(state, command.designId, command.decision, command.note ?? '', now, command.by ?? 'owner')
    case 'SET_MARKETING_REVIEW':
      return setMarketingReview(state, command.enabled, now)
    case 'SET_REPORT_CADENCE':
      return setReportCadence(state, command.cadence, now)
    case 'SEND_MESSAGE':
      return sendMessage(state, command.threadId, command.text, now, command.wake !== false)
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
            ? 'You turned on the demo task engine. It advances playbook steps already in progress. It does not contact any external system.'
            : 'You paused the demo task engine. Walks already in progress still finish. New playbook steps wait.',
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
    const thread = state.threads.find((item) => item.id === directThreadId(manager.id))
    if (!thread) continue
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

function prime(state: AppState, now: number): AppState {
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
function resolvePresence(state: AppState, now: number): AppState {
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
  const candidate = state.tasks
    .filter((task) => {
      const step = currentStep(task)
      return (
        task.source === 'demo_playbook' &&
        task.status === 'in_progress' &&
        !task.handoff &&
        step?.kind === 'work' &&
        task.stepStartedAt != null &&
        now >= task.stepStartedAt + step.durationMs &&
        isStaffIdActive(state, task.assigneeId)
      )
    })
    .sort((a, b) => (a.stepStartedAt ?? 0) - (b.stepStartedAt ?? 0))[0]
  if (!candidate) return state
  return finishWorkOrMeet(state, candidate.id, now)
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
        ? `${person.name} cannot request desktop control because that permission is off. This build has no desktop agent, so the computer cannot be viewed or controlled.`
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
        ? `${person.name} cannot request desktop control because that permission is off. No desktop agent is connected.`
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
  const outcome = decision === 'approved' ? approvalOutcome(approval.action) : rejectionOutcome(approval.action)
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
    next = patchTask(next, task.id, now, {
      status: 'in_review',
      result: noted,
      blockers: [],
      stepIndex: step?.kind === 'approval' ? task.stepIndex + 1 : task.stepIndex,
    })
    if (person) next = visitOwner(next, person.id, now)
  } else if (task) {
    next = patchTask(next, task.id, now, {
      status: 'blocked',
      blockers: [...task.blockers, { id: uid('blk'), text: outcome, at: iso(now) }],
    })
    if (person) next = goHome(next, person.id, now)
  }
  return withEvent(next, now, {
    actorId: 'owner',
    actorName: ownerName(state),
    kind: 'approval',
    taskId: approval.taskId,
    staffId: person?.id,
    audit: true,
    message: noted,
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
    return withEvent(next, now, {
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
  return withEvent(next, now, {
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
  if (!name || goals.length === 0) return state
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
      management: input.appointMd ? 'managing_director' : 'direct',
      createdAt: iso(now),
    },
    departments,
    roles,
    clock: freshClock(now, 9 * 60 + 5),
  }
  const staff: Staff[] = []
  for (const role of orderedRoles(roles.filter((role) => role.enabled))) {
    const department = departments.find((item) => item.id === role.departmentId)
    const manager = role.reportsToRoleId ? staff.find((person) => person.roleId === role.reportsToRoleId) ?? null : null
    staff.push(
      makeStaff(staff, {
        name: role.title,
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
  patch: Partial<{ name: string; businessType: string; ownerName: string; ownerTitle: 'Chairman' | 'CEO'; ownerGender: Company['ownerGender'] }>,
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
  }
  return withEvent({ ...state, company }, now, {
    actorId: 'owner',
    actorName: company.ownerName,
    kind: 'company',
    audit: true,
    message: `You updated the company profile for ${company.name}.`,
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
      ? `You granted ${person.name} permission to request desktop control. No session started. This build has no desktop agent, so the computer was not viewed or controlled.`
      : `You revoked desktop control for ${person.name}. No session was active.`
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

function sendMessage(state: AppState, threadId: string, text: string, now: number, wake = true): AppState {
  const thread = state.threads.find((item) => item.id === threadId)
  const body = text.trim()
  if (!thread || !body) return state
  let mentions = wake ? mentionsIn(body, state.staff, thread.memberIds) : []
  if (wake && thread.kind === 'direct') {
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
  const next = { ...state, chat: [...state.chat, message] }
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
    body = 'I’m still waiting on your review of the graphic in the company chat before I start another one.'
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
  return requestDesign(next, brief, now + 1, scheduled || undefined)
}

function planCalendar(state: AppState, now: number): AppState {
  const planner = state.staff.find((person) => roleKeyOf(state, person) === 'marketing_manager' && isStaffActive(state, person))
  if (!planner || !state.company) return state
  const products = state.products.length > 0 ? state.products : offeringsFromGoals(state.company)
  const drafted = planMissing(products, state.calendar, state.clock.day)
  if (drafted.length === 0) return state
  const posts: CalendarPost[] = drafted.map((post) => ({ ...post, id: uid('cal'), status: 'planned' }))
  const text = calendarSummary(products, posts, state.clock.day)
  const message = chatMessage(now, {
    threadId: COMPANY_THREAD,
    authorId: planner.id,
    authorName: planner.name,
    text,
    mentions: [],
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
      message: `${planner.name} wrote a content calendar for ${products.length} product${products.length === 1 ? '' : 's'}. Nothing was posted.`,
    },
  )
}

function posterShape(format: PostFormat | undefined): PosterShape {
  if (format === 'cover') return 'portrait'
  if (format === 'thumbnail') return 'landscape'
  return 'square'
}

function requestDesign(state: AppState, brief: string, now: number, calendarId?: string): AppState {
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
      message: `${designer.name} is still waiting on your review of “${open.title}” in the group chat.`,
    })
  }
  const product = post ? state.products.find((item) => item.id === post.productId) : undefined
  const text = post?.brief || brief.trim() || 'Dock Pro and Classroom OS'
  const title = post?.title || (text.length > 28 ? `${text.slice(0, 27)}…` : text)
  const where = post ? `${platformLabel(post.platform)} · ${formatLabel(post.format)}` : 'Draft for review'
  const marketer = marketingManager(state)
  const reviewer = state.settings.marketingReviews !== false && marketer ? 'marketing' : 'owner'
  const revision = (state.designs ?? []).length + 1
  const design: Design = {
    id: uid('design'),
    title,
    brief: text,
    caption: post
      ? `${text} For ${platformLabel(post.platform)}. Awaiting review before anything is scheduled.`
      : `${text}. Made for ${state.company?.name ?? 'the company'}. Awaiting review before anything is scheduled.`,
    reviewer,
    svg: campaignPoster(title, where, revision, state.company?.name ?? 'Quorum', posterShape(post?.format)),
    createdById: designer.id,
    status: 'in_review',
    revision,
    calendarId: post?.id,
    platform: post?.platform,
    format: post?.format,
  }
  const message = chatMessage(now, {
    threadId: COMPANY_THREAD,
    authorId: designer.id,
    authorName: designer.name,
    text: post
      ? `Finished the ${formatLabel(post.format)} for “${product?.name ?? title}”. It is the ${platformLabel(post.platform)} post. ${reviewer === 'marketing' && marketer ? `${marketer.name} will look at it first.` : 'Please review it before it goes anywhere.'}`
      : `Finished the graphic for “${text}”. ${reviewer === 'marketing' && marketer ? `${marketer.name} will look at it first.` : 'Please review it before it goes to social.'}`,
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
      message: post
        ? `${designer.name} sent the ${platformLabel(post.platform)} ${formatLabel(post.format)} to the group chat. Nothing has been posted.`
        : `${designer.name} sent a graphic to the group chat for review. Nothing has been posted.`,
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
  if (by === 'marketing' && !marketer) return state
  if (decision === 'declined') {
    if (by !== 'marketing' || !marketer) return state
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
  if (by === 'marketing' && decision === 'approved' && marketer) {
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
    const revised: Design = {
      ...design,
      id: uid('design'),
      svg: campaignPoster(design.title, ask, nextRevision, state.company?.name ?? 'Quorum', posterShape(design.format)),
      caption: `${design.brief}. Revised after review: ${ask}`,
      status: 'in_review',
      revision: nextRevision,
      reviewer: by === 'marketing' || (state.settings.marketingReviews !== false && marketer) ? 'marketing' : 'owner',
    }
    const editor = by === 'marketing' && marketer ? marketer : null
    const ownerNote = chatMessage(now, {
      threadId: COMPANY_THREAD,
      authorId: editor?.id ?? 'owner',
      authorName: editor?.name ?? owner,
      text: editor ? `Please change “${design.title}”: ${ask}` : `Changes requested: ${ask}`,
      designId: design.id,
      mentions: [],
    })
    const reply = chatMessage(now + 1, {
      threadId: COMPANY_THREAD,
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
        calendar: pointCalendar(state.calendar, design, revised.id, 'in_review'),
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
          : `You asked ${designer.name} to revise “${design.title}”. It is back in the group chat.`,
      },
    )
  }
  const social = socialOf(state)
  const channel = design.platform ? platformLabel(design.platform) : 'social'
  const approved: Design = {
    ...design,
    status: 'held',
    caption: design.platform
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
        text: design.platform
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
      message: social
        ? `${social.name} took the approved graphic. Social accounts are not connected, so it was not posted.`
        : `You approved “${design.title}”. No social account is connected, so it was not posted.`,
    },
  )
}

function pointCalendar(calendar: CalendarPost[], design: Design, designId: string, status: CalendarPost['status']): CalendarPost[] {
  return calendar.map((post) =>
    post.id === design.calendarId || post.designId === design.id ? { ...post, designId, status } : post,
  )
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
