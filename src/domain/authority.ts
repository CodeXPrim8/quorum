import { isStaffActive } from './active'
import type { AppState, Staff } from '../types'

/** Roles that may open day-to-day tasks without waiting on the owner. */
export const DAY_TO_DAY_MANAGER_KEYS = new Set([
  'md',
  'sales_manager',
  'marketing_manager',
  'procurement_manager',
  'finance_manager',
  'hr_manager',
  'technology_lead',
])

export function roleKeyOf(state: AppState, person: Staff): string {
  return state.roles.find((role) => role.id === person.roleId)?.key ?? ''
}

export function managingDirector(state: AppState): Staff | null {
  if (state.company?.management !== 'managing_director') return null
  return (
    state.staff.find((person) => roleKeyOf(state, person) === 'md' && isStaffActive(state, person)) ?? null
  )
}

/** MD may open any department. A department manager may open only their own. */
export function canOpenDayToDay(state: AppState, person: Staff, departmentId: string): boolean {
  if (!isStaffActive(state, person)) return false
  const key = roleKeyOf(state, person)
  if (!DAY_TO_DAY_MANAGER_KEYS.has(key)) return false
  if (key === 'md') return state.company?.management === 'managing_director'
  return person.departmentId === departmentId
}

export function kpiOf(state: AppState, roleId: string): string {
  return state.roles.find((role) => role.id === roleId)?.kpi ?? ''
}

export function openWorkCount(state: AppState, staffId: string): number {
  return state.tasks.filter(
    (task) =>
      task.createdById === staffId &&
      (task.status === 'ready' || task.status === 'in_progress' || task.status === 'paused'),
  ).length
}
