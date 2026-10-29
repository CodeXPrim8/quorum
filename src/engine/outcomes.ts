import type { ConsequentialAction } from '../types'

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
 * Approval never claims an external side effect. Connection status is checked
 * by the caller; this copy is the only outcome this build can honestly record.
 */
export function approvalOutcome(action: ConsequentialAction): string {
  switch (action) {
    case 'publish_public':
      return 'You approved the request. Nothing was published. Social and PR channels are not connected.'
    case 'send_external':
      return 'You approved the request. No email was sent. Email is not connected.'
    case 'purchase':
      return 'You approved the request. No purchase order was placed. Supplier systems are not connected.'
    case 'finance_change':
      return 'You approved the request. No financial records were changed. Finance systems are not connected.'
    case 'hiring':
      return 'You approved the request. No offer was sent, and no HR system was updated.'
    case 'desktop_control':
      return 'You approved the request. No desktop session started. This build has no desktop agent, so the computer was not viewed or controlled.'
  }
}

export function rejectionOutcome(action: ConsequentialAction): string {
  return `You declined “${actionLabel(action)}”. No external action was taken.`
}
