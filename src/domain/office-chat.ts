/** A made-up customer reply does not belong in the office group. */
export function isOfficeDraft(text: string): boolean {
  return /here'?s a draft|draft reply|drafted in quorum|nothing has been sent|nothing has gone out|hasn'?t been sent|lead record|i drafted the |quote specialist/i.test(
    text,
  )
}
