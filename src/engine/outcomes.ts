import type { ConsequentialAction, DesktopMode } from '../types'

export const WALK_MS = 3800

export function actionLabel(action: ConsequentialAction): string {
  switch (action) {
    case 'publish_public':
      return 'Publish public content'
    case 'send_external':
      return 'Send an external message'
    case 'purchase':
      return 'Purchase goods'
    case 'finance_change':
      return 'Change financial records'
    case 'hiring':
      return 'Make a hiring decision'
    case 'desktop_control':
      return 'Control this computer'
  }
}

/**
 * Approval outcomes match what Quorum actually does: file into in-app holds/ledgers,
 * or open a desktop grant when a session is active. No live outside network is claimed.
 */
export function approvalOutcome(
  action: ConsequentialAction,
  desktop?: { sessionActive: boolean; mode: DesktopMode | null },
): string {
  switch (action) {
    case 'publish_public':
      return 'You approved the request. The exact copy is held in Quorum for publishing. It was not posted to a live social or newswire network.'
    case 'send_external':
      return 'You approved the request. The message is held in Quorum’s email outbox. It was not sent through an outside mailbox.'
    case 'purchase':
      return 'You approved the request. The purchase note is filed in Quorum. No supplier portal received an order.'
    case 'finance_change':
      return 'You approved the request. The finance entry is filed in Quorum’s ledger. No bank or accounting SaaS was changed.'
    case 'hiring':
      return 'You approved the request. The hiring pack is filed in Quorum. No offer email left this computer.'
    case 'desktop_control':
      if (!desktop?.sessionActive || !desktop.mode) {
        return 'You approved the request. No desktop session is active, so the computer was not viewed or controlled. Start a session on Integrations first.'
      }
      if (desktop.mode === 'approved') {
        return 'You approved the request. A bounded desktop run is allowed for this task in Approved mode. End the session anytime on Integrations.'
      }
      return 'You approved the request. Live desktop control is allowed for this task until it finishes or you end the session.'
  }
}

export function rejectionOutcome(action: ConsequentialAction): string {
  return `You declined “${actionLabel(action)}”. No external action was taken.`
}
