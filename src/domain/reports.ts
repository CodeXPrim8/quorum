import { isStaffActive } from './active'
import type { AppState, ReportCadence, Staff, StaffReport } from '../types'

export function reportCadence(state: AppState): ReportCadence {
  return state.settings.reportCadence ?? 'daily'
}

/** True when managers should send you the compiled report at the close of this office day. */
export function ownerReportDue(cadence: ReportCadence, lastDay: number, day: number): boolean {
  if (lastDay >= day) return false
  if (cadence === 'daily') return true
  if (cadence === 'weekly') return lastDay < 0 || day - lastDay >= 5
  return lastDay < 0 || day - lastDay >= 20
}

export function lineThreadId(staffId: string): string {
  return `thread_line_${staffId}`
}

export function reportsTo(state: AppState, managerId: string): Staff[] {
  return state.staff.filter((person) => person.managerId === managerId && isStaffActive(state, person))
}

export function isLineManager(state: AppState, person: Staff): boolean {
  return reportsTo(state, person.id).length > 0
}

export function noteFor(person: Staff, state: AppState, day: number): string {
  const work = state.tasks
    .filter((task) => task.assigneeId === person.id)
    .map((task) => `${task.title} (${task.status.replace(/_/g, ' ')})`)
  const recent = state.events
    .filter((event) => event.staffId === person.id || event.actorId === person.id)
    .slice(0, 4)
    .map((event) => event.message)
  const lines = work.length > 0 ? work.slice(0, 4) : recent.slice(0, 3)
  const body = lines.length > 0 ? lines.map((line) => `• ${line}`).join('\n') : `• Held the ${person.title} desk. No open task sat with me.`
  return [
    `Day ${day} report.`,
    person.purpose,
    body,
    'This stays in Quorum. Nothing was emailed.',
  ].join('\n')
}

export function compileForOwner(manager: Staff, directs: StaffReport[], day: number, cadence: ReportCadence): string {
  const heading =
    cadence === 'weekly' ? `Weekly report, through day ${day}.` : cadence === 'monthly' ? `Monthly report, through day ${day}.` : `Daily report, day ${day}.`
  const team =
    directs.length > 0
      ? directs.map((item) => item.text.split('\n').slice(0, 4).join('\n')).join('\n\n')
      : 'No direct reports filed today.'
  return [
    heading,
    `${manager.name} (${manager.title}) compiled this for you.`,
    team,
    manager.purpose,
    'This stays in Quorum. Nothing was emailed or posted.',
  ].join('\n\n')
}
