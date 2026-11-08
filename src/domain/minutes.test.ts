import { describe, expect, it } from 'vitest'
import { applyCommand } from '../engine/apply'
import { createSampleState } from '../engine/fixture'
import { COMPANY_THREAD } from '../chat/threads'
import { minutesPdf, pdfDataUrl } from '../lib/pdf'
import { minutesDocument } from './minutes'

const now = 1_700_000_000_000

describe('meeting minutes', () => {
  it('writes a minutes sheet the clerk can file', () => {
    const text = minutesDocument({
      company: 'Northline Supply Co.',
      thread: 'Northline Supply Co.',
      chair: 'Morgan Hale',
      clerk: 'Ruth Adler',
      owner: 'Riley Chen',
      attendees: ['Riley Chen', 'Morgan Hale', 'Ruth Adler'],
      at: new Date('2026-10-28T15:05:00'),
      lines: [
        { authorId: 'owner', authorName: 'Riley Chen', text: 'Where are we on Riverside?' },
        { authorId: 'staff_morgan', authorName: 'Morgan Hale', text: 'Priya has the quote.' },
      ],
    })
    expect(text).toContain('Minutes: Ruth Adler')
    expect(text).toContain('Riley Chen: Where are we on Riverside?')
    const bytes = minutesPdf('Meeting minutes', text)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(pdfDataUrl(bytes).startsWith('data:application/pdf;base64,')).toBe(true)
  })

  it('posts the PDF on the group thread and nowhere else as a transcript', () => {
    const state = createSampleState(now)
    const file = { name: 'minutes-meeting.pdf', mime: 'application/pdf', dataUrl: pdfDataUrl(minutesPdf('Meeting minutes', 'Held today.')) }
    const next = applyCommand(
      state,
      {
        type: 'POST_MINUTES',
        threadId: COMPANY_THREAD,
        staffId: 'staff_ruth',
        text: 'Meeting minutes are in this PDF. Nothing was emailed.',
        file,
      },
      now,
    )
    const posted = next.chat.filter((message) => message.file?.name === 'minutes-meeting.pdf')
    expect(posted).toHaveLength(1)
    expect(posted[0]?.authorId).toBe('staff_ruth')
    expect(posted[0]?.threadId).toBe(COMPANY_THREAD)
    expect(posted[0]?.file?.mime).toBe('application/pdf')
  })
})
