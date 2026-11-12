import { describe, expect, it } from 'vitest'
import { isOfficeDraft } from './office-chat'

describe('office chat', () => {
  it('treats an unsent customer draft as noise', () => {
    expect(
      isOfficeDraft(
        "Here's a draft reply for that enquiry, sir. That's drafted in Quorum only — nothing has been sent yet.",
      ),
    ).toBe(true)
  })

  it('keeps a real question', () => {
    expect(isOfficeDraft('Ada wants a price for the 1.5hp AC. What should I open at?')).toBe(false)
  })
})
