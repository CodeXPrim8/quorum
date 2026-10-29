import type { AppState, Staff } from '../types'

export function departmentById(state: AppState, id: string) {
  return state.departments.find((department) => department.id === id) ?? null
}

export function roleById(state: AppState, id: string) {
  return state.roles.find((role) => role.id === id) ?? null
}

export function staffById(state: AppState, id: string | null) {
  if (!id) return null
  return state.staff.find((person) => person.id === id) ?? null
}

/** A person is on the floor only when they, their role, their department, and MD mode all allow it. */
export function isStaffActive(state: AppState, staff: Staff): boolean {
  if (!state.company || !staff.enabled) return false
  const department = departmentById(state, staff.departmentId)
  const role = roleById(state, staff.roleId)
  if (!department?.enabled || !role?.enabled) return false
  if (role.key === 'md' && state.company.management !== 'managing_director') return false
  return true
}

export function isStaffIdActive(state: AppState, staffId: string | null): boolean {
  const person = staffById(state, staffId)
  return person ? isStaffActive(state, person) : false
}
