import { QUORUM_THREAD } from '../chat/threads'
import type { AppState, QuorumDocument, QuorumScreen } from '../types'
import { learnCompany, previewFor, readingRequest, readPublicPage } from './company-site'
import { askModel, readModelLink } from './model'
import { writingGuide } from './writing'

const RESEARCH_ASK =
  /\b(research|look up|look it up|search|find out|latest|news|wikipedia|according to|who (?:is|are)|what (?:is|are)|when did|how does|browse)\b/i

const LINK =
  /\bhttps?:\/\/[^\s<>"')]+|\b(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|ng|io|co|org|net|ai|uk|app|dev)(?:\/[^\s<>"')]+)?/gi

export type QuorumTurn = {
  text: string
  desktopReason?: string
  screen?: QuorumScreen
  generate?: string
  document?: QuorumDocument
}

export function needsResearch(prompt: string): boolean {
  return RESEARCH_ASK.test(prompt) || Boolean(prompt.match(LINK))
}

const BARE_GRANT =
  /^(yes|yeah|yep|yup|ok|okay|sure|go ahead|do it|please do|allow|i allow( it)?|i allow a desktop session\.?|allow (the |a )?desktop( session)?\.?|you can use (the |my )?(computer|desktop|window)\.?)$/i

/** A short yes that grants the computer, with no new task inside it. */
export function grantsDesktop(prompt: string): boolean {
  return BARE_GRANT.test(prompt.replace(/\s+/g, ' ').trim())
}

/** The owner wants Quorum to work inside an app already on this computer. */
export function needsDesktop(prompt: string): boolean {
  if (grantsDesktop(prompt)) return false
  const text = prompt.replace(/\s+/g, ' ')
  if (/\b(zoho|outlook|gmail|thunderbird|whatsapp|notepad|excel|this computer|my computer|the desktop|in the window|opened my)\b/i.test(text)) {
    return true
  }
  return /\b(draft|write|compose|reply)\b/i.test(text) && /\b(mail|email|inbox)\b/i.test(text)
}

export function desktopReasonFor(prompt: string): string {
  const text = prompt.replace(/\s+/g, ' ').trim()
  return (text.length > 160 ? `${text.slice(0, 159)}…` : text) || 'Use this computer for the instruction you just gave.'
}

export function desktopAck(prompt: string): string {
  const text = prompt.replace(/\s+/g, ' ').trim()
  return `I will follow this on the computer: ${text.length > 220 ? `${text.slice(0, 219)}…` : text} I will not send it. Say that I may use this computer, or press Allow.`
}

/** The owner already said this thread may use the computer. */
export function threadAlreadyAllowed(state: AppState, threadId: string): boolean {
  return state.chat.some(
    (message) => message.threadId === threadId && message.authorId === 'owner' && grantsDesktop(message.text),
  )
}

/** The earlier instruction a bare “yes” or “I allow a desktop session” applies to. */
export function earlierDesktopPrompt(state: AppState, threadId: string, current: string): string | null {
  const ask = state.quorumAsk
  if (ask && (ask.status === 'pending' || ask.status === 'granted') && needsDesktop(ask.prompt)) return ask.prompt
  const owners = state.chat.filter(
    (message) => message.threadId === threadId && message.authorId === 'owner' && message.text.trim() !== current.trim(),
  )
  for (let index = owners.length - 1; index >= 0; index -= 1) {
    const text = owners[index]?.text.trim() ?? ''
    if (needsDesktop(text)) return text
  }
  return null
}

export async function lookupPublic(prompt: string): Promise<{ brief: string; screen?: QuorumScreen }> {
  const named = [...prompt.matchAll(LINK)].map((match) => match[0].replace(/[.,;:!?)]+$/, '')).slice(0, 2)
  const pages = await Promise.all(named.map((url) => readPublicPage(url)))
  const fromPages = pages.filter(Boolean).join('\n\n')
  const namedScreen = named.map((url) => previewFor(url)).find(Boolean)
  if (!RESEARCH_ASK.test(prompt) && fromPages) return { brief: fromPages, screen: namedScreen }
  try {
    const response = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: prompt.slice(0, 200) }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      brief?: string
      error?: string
      url?: string
      title?: string
      image?: string
    }
    if (!response.ok) return { brief: fromPages, screen: namedScreen }
    const brief = (body.brief ?? '').trim()
    const screen =
      namedScreen ||
      (body.url
        ? { kind: 'page' as const, url: body.url, title: body.title, image: body.image, summary: brief.slice(0, 800) }
        : undefined)
    return { brief: [fromPages, brief].filter(Boolean).join('\n\n'), screen }
  } catch {
    return { brief: fromPages, screen: namedScreen }
  }
}

export function historyForQuorum(
  state: AppState,
  threadId = QUORUM_THREAD,
): { role: 'user' | 'assistant'; content: string }[] {
  return state.chat
    .filter((message) => message.threadId === threadId)
    .slice(-24)
    .map((message) => ({
      role: message.authorId === 'quorum' ? ('assistant' as const) : ('user' as const),
      content: message.text.slice(0, 4000),
    }))
}

export function pendingQuorumPrompt(state: AppState): { threadId: string; text: string } | null {
  const ask = state.quorumAsk
  let found: { threadId: string; text: string; at: string } | null = null
  for (const thread of state.threads.filter((item) => item.kind === 'quorum')) {
    const last = state.chat.filter((message) => message.threadId === thread.id).at(-1)
    const text = last?.authorId === 'owner' ? last.text.trim() : ''
    if (!text || !last) continue
    if (!found || last.at >= found.at) found = { threadId: thread.id, text, at: last.at }
  }
  if (!found) return null
  if (
    ask &&
    (ask.status === 'pending' || ask.status === 'granted') &&
    found.threadId === (ask.threadId ?? found.threadId) &&
    found.text === ask.prompt.trim()
  ) {
    return null
  }
  return found
}

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i

function screenFromShow(value: string): QuorumScreen | undefined {
  const url = value.replace(/[.,;:!?)]+$/, '').trim()
  if (!url) return undefined
  if (url.startsWith('data:image/') || IMAGE_FILE.test(url)) return { kind: 'image', src: url }
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
  if (/^https?:\/\//i.test(href)) return { kind: 'page', url: href }
  return undefined
}

function splitDesktop(reply: string): QuorumTurn {
  let text = reply
  const take = (pattern: RegExp) => {
    const match = text.match(pattern)
    if (!match) return undefined
    text = text.replace(match[0], '').trim()
    return match[1]?.trim()
  }
  const generate = take(/(?:^|\n)\s*GENERATE:\s*(.+)\s*$/i)?.slice(0, 200)
  const shown = take(/(?:^|\n)\s*SHOW:\s*(.+)\s*$/i)
  const desktopReason = take(/(?:^|\n)\s*DESKTOP:\s*(.+)\s*$/i)?.slice(0, 180)
  return {
    text: text.trim() || reply.trim(),
    desktopReason,
    generate,
    screen: shown ? screenFromShow(shown) : undefined,
  }
}

export async function answerQuorum(state: AppState, prompt: string, threadId = QUORUM_THREAD): Promise<QuorumTurn> {
  const company = state.company
  const request = readingRequest(company?.website, prompt)
  const sitePages =
    request.urls.length > 0
      ? (await Promise.all(request.urls.map((url) => readPublicPage(url)))).filter(Boolean).join('\n\n')
      : ''
  const looked = needsResearch(prompt)
    ? await lookupPublic(prompt)
    : { brief: sitePages, screen: request.urls.map((url) => previewFor(url)).find(Boolean) }
  const research = looked.brief
  const site = !research && company?.website ? await learnCompany(company.website) : ''
  const fallback: QuorumTurn = needsDesktop(prompt)
    ? { text: desktopAck(prompt), desktopReason: desktopReasonFor(prompt), screen: looked.screen }
    : {
        text: 'I can answer questions, look things up on public pages, and use this computer if you allow a desktop session.',
        screen: looked.screen,
      }
  const link = readModelLink()
  if (!link) return fallback
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          'You are Quorum, the AI for this company operating system.',
          'Talk with the owner the way a capable assistant would: questions, writing, research, planning, and help on this computer.',
          company
            ? `This company is ${company.name} (${company.businessType}). The owner is ${company.ownerName}, ${company.ownerTitle}.`
            : '',
          writingGuide(state),
          research || site,
          research || site
            ? 'A public reading is included. Use it. Do not say you cannot look things up when a reading is present.'
            : 'You may look up public pages when asked. If no reading is included, answer from what you know and say when you are unsure.',
          'If you need the owner’s computer, including an app they already opened such as Zoho Mail, end with a single line: DESKTOP: short reason',
          'A mail draft stays in the open window. Do not send it.',
          'If they should see a public page or picture on your screen, end with SHOW: https://...',
          'If you want a picture made for the screen, end with GENERATE: short visual prompt',
          'Do not claim you already control the computer. Wait until they allow a session. Once they allow it, keep going until the work is finished.',
          'Do not start with your name. Write clearly in plain sentences. Do not wrap words in asterisks or markdown except inside a DOCUMENT block.',
          'Do not invent private facts you were not given.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      ...historyForQuorum(state, threadId).slice(0, -1),
      { role: 'user', content: prompt },
    ])
    const turn = splitDesktop(raw)
    return {
      text: turn.text.slice(0, 8000),
      desktopReason: turn.desktopReason || (needsDesktop(prompt) ? desktopReasonFor(prompt) : undefined),
      generate: turn.generate,
      screen: turn.screen ?? looked.screen,
    }
  } catch {
    return fallback
  }
}
