export type MemoryKind = 'fact' | 'decision' | 'site'

export type MemoryNote = {
  id: string
  at: string
  kind: MemoryKind
  text: string
}

const CAP = 24

/** Keep a lesson. The same sentence is not stored twice. */
export function remember(notes: MemoryNote[] | undefined, note: MemoryNote): MemoryNote[] {
  const text = note.text.replace(/\s+/g, ' ').trim().slice(0, 280)
  const existing = notes ?? []
  if (text.length < 12) return existing
  if (existing.some((item) => item.text.toLowerCase() === text.toLowerCase())) return existing
  return [{ ...note, text }, ...existing].slice(0, CAP)
}

/** A lasting instruction in an owner message. Greetings and one-off chatter stay out. */
export function lessonFromOwner(text: string): string | null {
  const body = text.replace(/@\S+/g, ' ').replace(/\s+/g, ' ').trim()
  if (body.length < 12) return null
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|good morning|good afternoon)\b/i.test(body)) return null
  if (
    /\b(remember|from now on|we (are|sell|serve|build|offer|don'?t|do not)|our (customers|clients|buyers|product|products|company|site|website)|never |always |actually|correction|call us)\b/i.test(
      body,
    )
  ) {
    return body.slice(0, 280)
  }
  return null
}

/** A short company fact from a page the staff already opened. */
export function siteLesson(reading: string): string | undefined {
  if (!reading.startsWith('Read ')) return undefined
  const title = reading.match(/Title:\s*(.+)/)?.[1]?.trim()
  const description = reading.match(/Description:\s*(.+)/)?.[1]?.trim()
  const bit = [title && `The website says: ${title}`, description].filter(Boolean).join('. ')
  const text = bit.replace(/\s+/g, ' ').trim().slice(0, 280)
  return text.length >= 12 ? text : undefined
}

export function memoryBrief(notes: MemoryNote[] | undefined): string {
  const lines = (notes ?? []).slice(0, 12)
  if (lines.length === 0) return ''
  return ['What this company has learned. Follow it:', ...lines.map((item) => `- ${item.text}`)].join('\n')
}
