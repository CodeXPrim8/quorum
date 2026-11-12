import { isStaffActive, staffById } from './active'
import type { AppState, OrgNode, Staff, Task, TaskStatus } from '../types'

const activeRank: TaskStatus[] = ['in_progress', 'waiting_for_owner', 'in_review', 'blocked', 'paused', 'ready']

export function assignmentFor(state: AppState, staffId: string): Task | null {
  const mine = state.tasks.filter((task) => task.assigneeId === staffId && task.status !== 'done')
  for (const status of activeRank) {
    const found = mine.find((task) => task.status === status)
    if (found) return found
  }
  return null
}

export function activityLabel(state: AppState, person: Staff, now: number): string {
  if (!isStaffActive(state, person)) return 'Inactive'
  if (person.presence.pose === 'away' && now >= person.presence.movingUntil) return 'Out'
  if (now < person.presence.movingUntil) return `Walking · ${person.presence.label}`
  if (person.presence.pose === 'call' || person.presence.label === 'On a call') return 'On a call'
  if (person.presence.pose === 'drink') return 'Getting water'
  if (person.presence.pose === 'attention') return 'Calling you'
  if (person.presence.lifeIntent === 'chat') return 'Talking with a colleague'
  if (person.presence.lifeIntent === 'errand') return person.presence.label
  if (person.presence.mode === 'meeting') return 'In a meeting'
  if (person.presence.mode === 'reporting') return 'Reporting a result'
  if (person.presence.mode === 'waiting') return 'Waiting for you'
  const task = assignmentFor(state, person.id)
  if (task?.status === 'in_progress' && person.presence.mode === 'desk') return `Working · ${task.title}`
  if (task?.status === 'blocked') return 'Blocked'
  if (task?.status === 'paused') return 'Paused'
  if (task?.status === 'waiting_for_owner') return 'Waiting for you'
  return 'At desk'
}

export function isTyping(state: AppState, person: Staff, now: number): boolean {
  if (state.settings.reducedMotion || !state.settings.showFloor) return false
  if (!isStaffActive(state, person)) return false
  if (now < person.presence.movingUntil) return false
  if (person.presence.pose === 'call') return person.presence.mode === 'desk'
  if (person.presence.mode !== 'desk') return false
  return state.tasks.some((task) => task.assigneeId === person.id && task.status === 'in_progress')
}

export function isWalking(person: Staff, now: number): boolean {
  return now < person.presence.movingUntil
}

export function pendingApprovals(state: AppState) {
  return state.approvals.filter((approval) => approval.status === 'pending')
}

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'in_progress':
      return 'In progress'
    case 'paused':
      return 'Paused'
    case 'blocked':
      return 'Blocked'
    case 'waiting_for_owner':
      return 'Waiting for you'
    case 'in_review':
      return 'In review'
    case 'done':
      return 'Done'
  }
}

export function buildOrg(state: AppState): OrgNode | null {
  if (!state.company) return null
  const active = state.staff.filter((person) => isStaffActive(state, person))

  function parentId(person: Staff): string | null {
    if (!person.managerId) return null
    const manager = staffById(state, person.managerId)
    if (!manager || !isStaffActive(state, manager)) return null
    return manager.id
  }

  function vacants(under: string | null): OrgNode[] {
    return state.roles
      .filter((role) => {
        if (!role.enabled) return false
        const department = state.departments.find((item) => item.id === role.departmentId)
        if (!department?.enabled) return false
        if (role.key === 'md' && state.company?.management !== 'managing_director') return false
        if (state.staff.some((person) => person.roleId === role.id && isStaffActive(state, person))) return false
        if (!role.reportsToRoleId) return under === null
        const holders = state.staff.filter((person) => person.roleId === role.reportsToRoleId && isStaffActive(state, person))
        if (holders.length === 0) return under === null
        return holders.some((person) => person.id === under)
      })
      .map((role) => ({
        id: `vacant_${role.id}`,
        name: 'Vacant',
        title: role.title,
        kind: 'vacant' as const,
        roleId: role.id,
        children: [],
      }))
  }

  function childrenOf(id: string | null): OrgNode[] {
    const people = active
      .filter((person) => parentId(person) === id)
      .map((person) => ({
        id: person.id,
        name: person.name,
        title: person.title,
        kind: 'person' as const,
        staffId: person.id,
        children: childrenOf(person.id),
      }))
    return [...people, ...vacants(id)]
  }

  return {
    id: 'owner',
    name: state.company.ownerName,
    title: state.company.ownerTitle,
    kind: 'owner',
    children: childrenOf(null),
  }
}
