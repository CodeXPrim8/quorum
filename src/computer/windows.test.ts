import { describe, expect, it } from 'vitest'
import { clickNamed, clickTarget, draftFromInstruction, mailFieldPoints, matchOpenWindow } from './windows'

describe('open windows', () => {
  it('picks the window named in the instruction', () => {
    const match = matchOpenWindow(
      'draft the request for a meeting with the procurement manager of Steaders8 Farm in the Zoho window i already opened. here is the email iwewezinemstephen@gmail.com',
      [
        { hwnd: '10', processName: 'chrome', title: 'Quorum — AI staff' },
        { hwnd: '22', processName: 'chrome', title: 'Inbox - Zoho Mail' },
        { hwnd: '30', processName: 'notepad', title: 'Untitled' },
      ],
    )
    expect(match?.hwnd).toBe('22')
    const gmail = matchOpenWindow(
      'draft the request in the Zoho window. here is the email iwewezinemstephen@gmail.com',
      [
        { hwnd: '22', processName: 'chrome', title: 'Inbox - Zoho Mail' },
        { hwnd: '40', processName: 'chrome', title: 'Gmail' },
      ],
    )
    expect(gmail?.hwnd).toBe('22')
    const inbox = matchOpenWindow(
      'In the window, i have opened my gmail in chrome, compose a reminder to this customer iwewezinemstephen@gmail.com about the solar quote',
      [
        { hwnd: '40', processName: 'chrome', title: 'wewezinemstephen@gmail.com - Google Search - Google Chrome' },
        { hwnd: '22', processName: 'chrome', title: 'Inbox (3,788) - iwewezinemstephen@gmail.com - Gmail - Google Chrome' },
      ],
    )
    expect(inbox?.hwnd).toBe('22')
  })

  it('writes a short mail from the facts, not the instruction', () => {
    const draft = draftFromInstruction(
      'In the window, I have opened my zoho mail, draft a reminder to this customer iwewezinemstephen@gmail.com about the solar quote with PO number GRT 683F 32.',
    )
    expect(draft?.to).toBe('iwewezinemstephen@gmail.com')
    expect(draft?.subject).toBe('Reminder: Solar quote — PO GRT 683F 32')
    expect(draft?.body).toMatch(/^Hello,/)
    expect(draft?.body).toMatch(/reminder about the solar quote/i)
    expect(draft?.body).toMatch(/GRT 683F 32/)
    expect(draft?.body).not.toMatch(/this customer/i)
    expect(draft?.body).not.toMatch(/i have opened/i)
    expect(draftFromInstruction('what time is the meeting')).toBeNull()
  })

  it('clicks To and Subject from the labels on the compose window', () => {
    const points = mailFieldPoints([
      { text: 'From', x: 5, y: 16, w: 30, h: 11 },
      { text: 'ccv', x: 4, y: 95, w: 27, h: 11 },
      { text: 'Subject', x: 4, y: 138, w: 46, h: 14 },
      { text: 'Bcc', x: 598, y: 54, w: 21, h: 11 },
    ])
    expect(points?.to.y).toBeLessThan(points?.subject.y ?? 0)
    expect(points?.subject.y).toBeLessThan(points?.body.y ?? 0)
    expect(points?.to.x).toBeGreaterThan(40)
    expect(points?.to.y).toBeLessThan(80)
  })

  it('clicks Compose on an inbox and leaves Send alone', () => {
    const inbox = [
      { text: 'Compose', x: 20, y: 80, w: 70, h: 24 },
      { text: 'Inbox', x: 20, y: 120, w: 40, h: 16 },
    ]
    expect(clickTarget('draft a reminder in gmail to a@b.com about the quote', inbox)?.text).toBe('Compose')
    expect(
      clickTarget('draft a reminder in gmail to a@b.com about the quote', [
        ...inbox,
        { text: 'Subject', x: 100, y: 200, w: 50, h: 14 },
      ]),
    ).toBeNull()
    expect(clickTarget('click Send', [{ text: 'Send', x: 1, y: 1, w: 20, h: 12 }])).toBeNull()
    expect(clickNamed('Send', [{ text: 'Send', x: 1, y: 1, w: 20, h: 12 }])).toBeNull()
    expect(clickNamed('Compose', inbox)?.text).toBe('Compose')
    expect(clickTarget('click the Upgrade button', [{ text: 'Upgrade', x: 10, y: 10, w: 40, h: 16 }])?.text).toBe('Upgrade')
    const mail = [
      { text: 'Compose', x: 20, y: 80, w: 70, h: 24 },
      { text: 'Reply', x: 200, y: 80, w: 40, h: 18 },
      { text: 'Drafts', x: 20, y: 180, w: 40, h: 16 },
      { text: 'Steaders8', x: 240, y: 260, w: 70, h: 14 },
      { text: 'Farm', x: 316, y: 260, w: 36, h: 14 },
    ]
    expect(clickTarget('reply to the customer in gmail', mail)?.text).toBe('Reply')
    expect(clickTarget('open drafts', mail)?.text).toBe('Drafts')
    expect(clickTarget('open the Steaders8 Farm thread', mail)?.text).toBe('Steaders8 Farm')
    expect(
      clickTarget('draft a mail to wewezinemstephen@gmail.com about the quote', [
        { text: 'wewezinemstephen', x: 10, y: 400, w: 120, h: 14 },
      ]),
    ).toBeNull()
  })

  it('types into the compose To line, not the address bar', () => {
    const points = mailFieldPoints([
      { text: 'To', x: 400, y: 12, w: 16, h: 12 },
      { text: 'To', x: 30, y: 200, w: 16, h: 12 },
      { text: 'Subject', x: 30, y: 248, w: 50, h: 14 },
    ])
    expect(points?.to.y).toBeGreaterThan(190)
    expect(points?.to.y).toBeLessThan(points?.subject.y ?? 0)
    expect(points?.body.y).toBeGreaterThan(points?.subject.y ?? 0)
  })

  it('uses an open browser for an approved stake', () => {
    const browser = { hwnd: '4', processName: 'chrome', title: 'New Tab' }
    expect(matchOpenWindow('APPROVED STAKE. Open https://www.nairabet.com/. Play Chelsea.', [browser])?.hwnd).toBe('4')
  })

  it('leaves the choice alone when the instruction names no open window', () => {
    expect(
      matchOpenWindow('draft the request in the Zoho window', [{ hwnd: '10', processName: 'notepad', title: 'Notes' }]),
    ).toBeNull()
  })
})
