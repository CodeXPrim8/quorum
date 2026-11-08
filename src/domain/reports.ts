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

const OFFICE_LIFE =
  /Went for water|Eating in the cafeteria|In the toilet|lounge meeting|lounge bar|operations screens|server room|Stopped to talk|Payday \+|Bought lunch|Bought a house|Bought a car|\bMarried\b|Parked and came in|Got off the bus|Was dropped off|Left for the day|Held the .+ desk|No open task sat with me/

/** Simulated office errands are not company work and must not be filed as a report. */
export function isOfficeLife(text: string): boolean {
  return OFFICE_LIFE.test(text)
}

export function noteFor(person: Staff, state: AppState, day: number): string {
  const work = state.tasks
    .filter((task) => task.assigneeId === person.id && task.status !== 'ready')
    .map((task) => `${task.title} (${task.status.replace(/_/g, ' ')})${task.result ? `: ${task.result}` : ''}`)
  const filed = state.events
    .filter(
      (event) =>
        (event.staffId === person.id || event.actorId === person.id) &&
        (event.kind === 'result' || event.kind === 'task') &&
        !isOfficeLife(event.message),
    )
    .slice(0, 4)
    .map((event) => event.message)
  const lines = [...work, ...filed].filter((line) => line && !isOfficeLife(line)).slice(0, 6)
  if (lines.length === 0) return ''
  return [`Day ${day} report.`, ...lines.map((line) => `• ${line}`)].join('\n')
}

export function compileForOwner(manager: Staff, directs: StaffReport[], day: number, cadence: ReportCadence): string {
  const filed = directs.map((item) => item.text.trim()).filter((text) => text && !isOfficeLife(text))
  if (filed.length === 0) return ''
  const heading =
    cadence === 'weekly' ? `Weekly report, through day ${day}.` : cadence === 'monthly' ? `Monthly report, through day ${day}.` : `Daily report, day ${day}.`
  return [
    heading,
    `${manager.name} (${manager.title}) compiled the work filed in Quorum.`,
    filed.map((text) => text.split('\n').slice(0, 6).join('\n')).join('\n\n'),
  ].join('\n\n')
}
