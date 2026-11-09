import type { AppState, CompanyRecord, ConsequentialAction } from '../types'
import { iso, uid } from '../lib/format'

export function recordKindFor(action: ConsequentialAction): CompanyRecord['kind'] | null {
  switch (action) {
    case 'send_external':
      return 'email'
    case 'publish_public':
      return 'social'
    case 'purchase':
      return 'purchase'
    case 'finance_change':
      return 'finance'
    case 'hiring':
      return 'hr'
    case 'trade_execute':
      return 'trade'
    case 'bet_place':
      return 'bet'
    case 'desktop_control':
      return null
  }
}

export function fileApprovalRecord(
  state: AppState,
  action: ConsequentialAction,
  task: { id: string; title: string; description: string },
  staffId: string | undefined,
  now: number,
): { state: AppState; record: CompanyRecord | null } {
  const kind = recordKindFor(action)
  if (!kind) return { state, record: null }
  const record: CompanyRecord = {
    id: uid('rec'),
    kind:
      kind === 'social' &&
      (/\bPR\b/.test(`${task.title} ${task.description}`) ||
        /\b(press|newswire)\b/i.test(`${task.title} ${task.description}`))
        ? 'pr'
        : kind,
    title: task.title.slice(0, 120),
    body: (task.description || task.title).slice(0, 2000),
    taskId: task.id,
    staffId,
    status: kind === 'email' || kind === 'social' || kind === 'pr' ? 'held' : 'filed',
    at: iso(now),
  }
  return { state: { ...state, records: [record, ...(state.records ?? [])] }, record }
}
