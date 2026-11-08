import { directThreadId } from '../chat/threads'
import type { AppState } from '../types'

export function unreadIn(state: AppState, threadId: string): number {
  const thread = state.threads.find((item) => item.id === threadId)
  if (!thread?.ownerReadAt) return 0
  const since = Date.parse(thread.ownerReadAt)
  if (Number.isNaN(since)) return 0
  return state.chat.filter(
    (message) => message.threadId === threadId && message.authorId !== 'owner' && Date.parse(message.at) > since,
  ).length
}

export function unreadFrom(state: AppState, staffId: string): number {
  return unreadIn(state, directThreadId(staffId))
}

/** True when this person is waiting on the owner. */
export function handUp(state: AppState, staffId: string): boolean {
  if (state.tasks.some((task) => task.assigneeId === staffId && (task.status === 'waiting_for_owner' || task.status === 'in_review'))) {
    return true
  }
  if (state.approvals.some((item) => item.status === 'pending' && item.requestedById === staffId)) return true
  return (state.goalProposals ?? []).some((item) => item.status === 'pending' && item.proposedById === staffId)
}

export function badgeCount(count: number): string {
  if (count > 99) return '99+'
  return String(count)
}
