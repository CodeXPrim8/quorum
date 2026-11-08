import { memoryBrief } from '../domain/memory'
import { websiteLine } from '../domain/website'
import type { AppState, QuorumDocument } from '../types'

const DRAFT_ASK =
  /\b((draft|write|prepare|compose|put together|make|draw up)\b[\s\S]{0,80}\b(proposal|quote|quotation|tender|letter|capability|pitch|scope of work|sow|mou|agreement|invoice)\b|\b(proposal|quotation|tender response|capability statement)\b)/i

export function isDraftAsk(prompt: string): boolean {
  return DRAFT_ASK.test(prompt)
}

/** Facts already on the company. The model must use these and never ask for them. */
export function knownWriter(state: AppState): string {
  const company = state.company
  if (!company) return ''
  const offerings = state.products
    .slice(0, 8)
    .map((item) => `${item.name}: ${item.fact}`)
    .join(' | ')
  return [
    'Known. Do not ask for these. Put them on the document.',
    `Writer name: ${company.ownerName}`,
    `Writer title: ${company.ownerTitle}`,
    `Our company: ${company.name}`,
    `What we do: ${company.businessType}`,
    websiteLine(company.website),
    offerings && `What we sell: ${offerings}`,
    `Company goals: ${company.goals.map((goal) => goal.text).join(' | ') || 'none yet'}`,
    memoryBrief(state.memory),
  ]
    .filter(Boolean)
    .join('\n')
}

export function writingGuide(state: AppState): string {
  const company = state.company
  return [
    knownWriter(state),
    'When they ask you to draft a proposal, quote, letter, tender, capability pack, or similar:',
    'Ask first if you still need the other party. Do not write the document until you have enough.',
    'Ask in one short list: who it is for (person), their company, their role, how to reach them, what they need from us, place or site, timeline, and commercial notes if they matter.',
    'A type of client (for example a vehicle vendor) is not a completed Prepared for. Still ask the company name and the person.',
    company
      ? `Never ask for our name, our title, our company, or our website. Sign off as ${company.ownerName}, ${company.ownerTitle}, ${company.name}. Never write [Name] or [Title].`
      : 'Never write [Name] or [Title] for the writer.',
    'When you have enough, write the full document, then wrap it exactly as:',
    'DOCUMENT: proposal | Title here',
    'Prepared for: Person, Company',
    '---',
    'full document',
    '---',
    'You may say one or two sentences before the wrapper. The app offers copy and a designed PDF, so do not ask whether to copy or export.',
  ].join('\n')
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function looksLikeDraft(body: string): boolean {
  return (
    /^(proposal|quotation|quote|letter|invoice|capability|memorandum|agreement)\b/im.test(body) ||
    /^prepared by:/im.test(body) ||
    /^prepared for:/im.test(body)
  )
}

function titleOf(body: string): string {
  const skip = /^(proposal|quotation|quote|letter|invoice|capability statement|memorandum|agreement|prepared (by|for):|date:|reference:|ref:)/i
  for (const line of body.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 10)) {
    if (skip.test(line) || line === '---') continue
    if (line.length >= 8 && line.length <= 120) return line.replace(/^#+\s*/, '').slice(0, 120)
  }
  return 'Proposal'
}

function kindOf(body: string): string {
  const hit = body.match(/\b(proposal|quotation|quote|letter|invoice|capability|mou|agreement)\b/i)
  return (hit?.[1] || 'proposal').toLowerCase().slice(0, 32)
}

function cleanFor(value?: string): string | undefined {
  const text = value?.trim()
  if (!text || /\[/.test(text)) return undefined
  return text.slice(0, 160)
}

function draftOf(body: string): QuorumDocument {
  return {
    kind: kindOf(body),
    title: titleOf(body),
    body: body.slice(0, 12000),
    preparedFor: cleanFor(body.match(/^Prepared for:\s*(.+)$/im)?.[1]),
  }
}

function isDumped(stored: QuorumDocument | undefined, text: string): boolean {
  if (!stored) return false
  const body = stored.body.trim()
  const raw = text.trim()
  if (body === raw) return true
  if (/^here's a draft|^i've (written|drafted)/i.test(body)) return true
  if (/fill in the bracketed placeholders/i.test(body)) return true
  return false
}

export function withWriter(
  body: string,
  company: { ownerName: string; ownerTitle: string; name: string; website?: string },
): string {
  let text = body
    .replace(/^\s*\[(?:your\s+)?(?:full\s+)?name\]\s*$/gim, company.ownerName)
    .replace(/^\s*\[(?:your\s+)?(?:job\s+)?title\]\s*$/gim, company.ownerTitle)
    .replace(/^Prepared by:\s*.*$/im, `Prepared by: ${company.ownerName}, ${company.ownerTitle}`)
    .replace(/\bcontact\s+\[(?:your\s+)?name\]/gi, `contact ${company.ownerName}`)
    .replace(/\[(?:your\s+)?name\]/gi, company.ownerName)
    .replace(/\[company\]/gi, company.name)
  text = text.replace(/\[(?:your\s+)?title\]/gi, (match, offset: number) => {
    const before = text.slice(Math.max(0, offset - 48), offset).toLowerCase()
    if (/prepared for|client/.test(before)) return match
    return company.ownerTitle
  })
  if (new RegExp(escapeReg(company.ownerName), 'i').test(text)) return text.trim()
  return `${text.trim()}\n\n${company.ownerName}\n${company.ownerTitle}\n${company.name}`
}

export function parseDocument(reply: string): { text: string; document?: QuorumDocument } {
  const match = reply.match(
    /(?:^|\n)DOCUMENT:\s*([^\n|]+?)\s*\|\s*([^\n]+)\n(?:Prepared for:\s*([^\n]+)\n)?---\r?\n([\s\S]*?)\r?\n---/,
  )
  if (match) {
    const kind = match[1].trim().toLowerCase().slice(0, 32)
    const title = match[2].trim().slice(0, 120)
    const preparedFor = cleanFor(match[3])
    const body = match[4].trim()
    if (!title || !body) return { text: reply }
    return {
      text: reply.replace(match[0], '').trim(),
      document: { kind: kind || 'proposal', title, body: body.slice(0, 12000), preparedFor },
    }
  }
  const fenced = reply.match(/^([\s\S]*?)\n---\r?\n([\s\S]+?)\r?\n---(?:\r?\n([\s\S]*))?$/)
  const inner = fenced?.[2]?.trim() ?? ''
  if (fenced && inner.length > 120 && looksLikeDraft(inner)) {
    const note = [fenced[1], fenced[3]].filter((part) => part?.trim()).join('\n\n').trim()
    return { text: note, document: draftOf(inner) }
  }
  if (reply.length > 400 && looksLikeDraft(reply)) {
    return { text: '', document: draftOf(reply) }
  }
  return { text: reply }
}

export function turnOf(
  message: { text: string; document?: QuorumDocument },
  company?: { ownerName: string; ownerTitle: string; name: string; website?: string },
): { note: string; document?: QuorumDocument } {
  const parsed = parseDocument(message.text)
  const stored = message.document
  const fakeStored = Boolean(
    stored && !parsed.document && !looksLikeDraft(stored.body) && !stored.preparedFor,
  )
  if (fakeStored && stored) return { note: (stored.body || message.text).trim() }
  const dumped = isDumped(stored, message.text)
  const found = parsed.document ?? (dumped ? undefined : stored)
  const document = found && company ? { ...found, body: withWriter(found.body, company) } : found
  const note = parsed.document ? parsed.text : message.text
  return { note: note.trim(), document }
}

export function documentOf(
  message: { text: string; document?: QuorumDocument },
  company?: { ownerName: string; ownerTitle: string; name: string; website?: string },
): QuorumDocument | undefined {
  return turnOf(message, company).document
}
