export type OpenWindow = { hwnd: string; processName: string; title: string }

const SKIPPED_WORDS = new Set([
  'that', 'this', 'with', 'from', 'your', 'have', 'want', 'please', 'open', 'into', 'already', 'opened',
  'window', 'draft', 'request', 'here', 'email', 'meeting', 'mail', 'about', 'then', 'tell', 'will',
])

/** The open window named in the owner's own words. */
export function matchOpenWindow(instruction: string, windows: OpenWindow[]): OpenWindow | null {
  const emailWords = new Set(
    (instruction.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).flatMap((email) => email.toLowerCase().split(/[^a-z0-9]+/)),
  )
  const words = instruction
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !SKIPPED_WORDS.has(word) && !emailWords.has(word))
  const withoutMail = instruction.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
  const mailJob = isMailTask(instruction)
  let best: { item: OpenWindow; score: number } | null = null
  for (const item of windows) {
    const bare = item.title.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    const hay = `${bare} ${item.processName}`.toLowerCase()
    let score = 0
    for (const word of words) {
      if (hay.includes(word)) score += word.length
    }
    const searchPage = /google search/i.test(item.title)
    if (mailJob && searchPage) score -= 80
    if (/\bgmail\b/i.test(withoutMail) && /\bgmail\b/i.test(bare) && !searchPage) score += 24
    if (mailJob && /\b(zoho mail|outlook|yahoo mail)\b/i.test(bare)) score += 30
    if (score > (best?.score ?? 0)) best = { item, score }
  }
  if (best && best.score >= 4) return best.item
  if (/\bAPPROVED STAKE\b/.test(instruction)) {
    return windows.find((item) => /^(chrome|msedge|firefox|brave|opera)$/i.test(item.processName)) ?? null
  }
  return null
}

export function isMailTask(prompt: string): boolean {
  return (
    /\b(zoho|outlook|gmail|thunderbird|inbox)\b/i.test(prompt) ||
    (/\b(draft|reply|compose|write)\b/i.test(prompt) && /\b(mail|email|reminder|message)\b/i.test(prompt))
  )
}

export type MailDraft = { to: string; subject: string; body: string }

export type OcrWord = { text: string; x: number; y: number; w: number; h: number }

const BLOCKED_CLICK = /\b(send|pay|delete|purchase|buy|checkout|submit|install|password)\b/i
const CHROME_LABELS = new Set([
  'google', 'gmail', 'primary', 'promotions', 'social', 'updates', 'more', 'upgrade', 'chat', 'meet',
  'mail', 'search', 'search mail', 'try at no cost',
])

function linePhrases(words: OcrWord[]): OcrWord[] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: OcrWord[][] = []
  for (const word of sorted) {
    const line = lines.find((group) => Math.abs(group[0].y - word.y) < 14)
    if (line) line.push(word)
    else lines.push([word])
  }
  return lines.map((group) => {
    group.sort((a, b) => a.x - b.x)
    return phraseBox(group, 0, group.length)
  })
}

function locate(words: OcrWord[], lines: OcrWord[], phrase: string): OcrWord | null {
  if (!phrase || BLOCKED_CLICK.test(phrase)) return null
  return findPhrase(words, phrase) ?? lines.find((line) => line.text.toLowerCase() === phrase.toLowerCase()) ?? null
}

function namedIn(instruction: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(instruction)
}

function phraseBox(words: OcrWord[], start: number, count: number): OcrWord {
  const slice = words.slice(start, start + count)
  const x = Math.min(...slice.map((word) => word.x))
  const y = Math.min(...slice.map((word) => word.y))
  const right = Math.max(...slice.map((word) => word.x + word.w))
  const bottom = Math.max(...slice.map((word) => word.y + word.h))
  return { text: slice.map((word) => word.text).join(' '), x, y, w: right - x, h: bottom - y }
}

function findPhrase(words: OcrWord[], phrase: string): OcrWord | null {
  const parts = phrase.toLowerCase().split(/\s+/).filter(Boolean)
  if (!parts.length || BLOCKED_CLICK.test(phrase)) return null
  if (parts.length === 1) return words.find((word) => word.text.toLowerCase() === parts[0]) ?? null
  for (let i = 0; i <= words.length - parts.length; i += 1) {
    if (parts.every((part, index) => words[i + index]?.text.toLowerCase() === part)) return phraseBox(words, i, parts.length)
  }
  return null
}

/** A label the model chose, if it is actually on the screen. Send and payment stay untouched. */
export function clickNamed(label: string, words: OcrWord[]): OcrWord | null {
  return locate(words, linePhrases(words), label.trim())
}

/** Labels Quorum can see, shortest chrome noise left out. */
export function visibleLabels(words: OcrWord[]): string[] {
  return linePhrases(words)
    .map((line) => line.text.trim())
    .filter((label) => label.length >= 3 && label.length <= 48 && !/@|\d{3,}/.test(label))
    .slice(0, 16)
}

/** The control the instruction needs among the words on the screen. Send and payment stay untouched. */
export function clickTarget(instruction: string, words: OcrWord[]): OcrWord | null {
  const spoken = instruction.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
  const lines = linePhrases(words)
  const formOpen = words.some((word) => /^subject$/i.test(word.text) && word.y > 80)
  if (formOpen && isMailTask(spoken)) return null
  if (!formOpen && /\b(open|show|go to)\s+drafts\b/i.test(spoken)) {
    const drafts = locate(words, lines, 'Drafts')
    if (drafts) return drafts
  }
  if (!formOpen) {
    const goals: [RegExp, string[]][] = [
      [/\breply all\b/i, ['Reply all', 'Reply All']],
      [/\breply\b/i, ['Reply']],
      [/\bforward\b/i, ['Forward']],
      [/\b(compose|new mail|new message|draft|write|reminder)\b/i, ['Compose', 'New Mail', 'New message']],
    ]
    for (const [test, labels] of goals) {
      if (!test.test(spoken)) continue
      for (const label of labels) {
        const hit = locate(words, lines, label)
        if (hit) return hit
      }
    }
  }
  const explicit = spoken.match(/\b(?:click|press|open|tap|select|go to)\s+(?:on\s+)?(?:the\s+)?["“]?([a-z][a-z0-9 ]{1,40})/i)
  if (explicit) {
    const phrase = explicit[1].replace(/\b(button|link|tab|menu|in|the|window)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    const hit = locate(words, lines, phrase)
    if (hit) return hit
  }
  let best: OcrWord | null = null
  for (const line of lines) {
    const label = line.text.trim()
    const lower = label.toLowerCase()
    if (label.length < 4 || label.length > 48 || BLOCKED_CLICK.test(label) || /@|\d{3,}/.test(label)) continue
    if (CHROME_LABELS.has(lower)) continue
    if (!namedIn(spoken, label)) continue
    if (!best || label.length > best.text.length) best = line
  }
  return best
}

/** Where to click, from the words actually visible on the compose window. */
export function mailFieldPoints(
  words: OcrWord[],
  origin: { left: number; top: number } = { left: 0, top: 0 },
): { to: { x: number; y: number }; subject: { x: number; y: number }; body: { x: number; y: number } } | null {
  const subjects = words.filter((word) => /^subject$/i.test(word.text))
  const subject = subjects.sort((a, b) => scoreComposeSubject(b, words) - scoreComposeSubject(a, words) || b.y - a.y)[0]
  if (!subject) return null
  const near = (word: OcrWord) => word.y < subject.y - 4 && subject.y - word.y < 170 && Math.abs(word.x - subject.x) < 220
  const above = words.filter(near)
  const toWord = above.find((word) => /^(to:?|recipients?)$/i.test(word.text))
  const bcc = above.find((word) => /^bcc$/i.test(word.text))
  const cc = above.find((word) => /^cc/i.test(word.text) && !/^compose$/i.test(word.text))
  const fieldX = origin.left + subject.x + subject.w + 28
  const toY = toWord
    ? origin.top + toWord.y + toWord.h / 2
    : bcc
      ? origin.top + bcc.y + bcc.h / 2
      : cc
        ? origin.top + cc.y - Math.min(40, subject.y - cc.y) + cc.h / 2
        : origin.top + subject.y - 34 + subject.h / 2
  return {
    to: { x: Math.round(toWord ? origin.left + toWord.x + toWord.w + 28 : fieldX), y: Math.round(toY) },
    subject: { x: Math.round(fieldX), y: Math.round(origin.top + subject.y + subject.h / 2) },
    body: { x: Math.round(fieldX), y: Math.round(origin.top + subject.y + subject.h + 68) },
  }
}

function scoreComposeSubject(subject: OcrWord, words: OcrWord[]): number {
  return words.some(
    (word) =>
      /^(to:?|recipients?|new message|new mail|from)$/i.test(word.text) &&
      word.y < subject.y &&
      subject.y - word.y < 180 &&
      Math.abs(word.x - subject.x) < 240,
  )
    ? 1
    : 0
}

function mailTopic(instruction: string): string {
  const about = instruction.match(/\babout\s+(?:the\s+)?(.+?)(?:\s+with\b|\s+for\b|[.]|$)/i)?.[1] ?? ''
  const topic = about
    .replace(/\b(po|p\.o\.|number|this customer|customer)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return topic || 'your request'
}

function purchaseOrder(instruction: string): string {
  const match = instruction.match(
    /\bP\.?\s*O\.?\s*(?:number\s*)?#?\s*([A-Z0-9][A-Z0-9-]{1,12}(?:\s+[A-Z0-9][A-Z0-9-]{1,12}){0,3})/i,
  )
  return match?.[1]?.replace(/[.,;:\s]+$/, '').trim() ?? ''
}

/** A short message from the facts in the instruction. The instruction itself is not the email. Nothing is sent. */
export function draftFromInstruction(instruction: string): MailDraft | null {
  if (!isMailTask(instruction)) return null
  const to = instruction.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
  const topic = mailTopic(instruction)
  const po = purchaseOrder(instruction)
  if (!to && topic === 'your request' && !po) return null
  const reminder = /\breminder\b/i.test(instruction)
  const meeting = /\bmeeting\b/i.test(instruction)
  const label = topic.charAt(0).toUpperCase() + topic.slice(1)
  const subject = `${reminder ? 'Reminder: ' : meeting ? 'Meeting: ' : ''}${label}${po ? ` — PO ${po}` : ''}`.slice(0, 90)
  const fact = po ? ` The purchase order is ${po}.` : ''
  const point = meeting
    ? `I would like to request a meeting about the ${topic}.${fact}`
    : reminder
      ? `This is a reminder about the ${topic}.${fact}`
      : `I am writing about the ${topic}.${fact}`
  const ask = meeting ? 'Please tell me a time that works for you.' : 'Please reply if you need anything further.'
  const body = `Hello,\n\n${point}\n\n${ask}\n\nThank you.`
  return { to, subject, body }
}
