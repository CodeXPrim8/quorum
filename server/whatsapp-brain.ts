import { quoteLines, requestLines } from './price-lines.js'
import type { WaEnv, WaInbound } from './whatsapp.js'
import { sendWhatsAppText } from './whatsapp.js'
import {
  alreadyAnswered,
  chatFor,
  readWhatsAppLog,
  writeWhatsAppLog,
  type LogChat,
  type LogEffect,
  type SalesContext,
} from './whatsapp-log.js'

const RETIRED = /I will not send a price/i

export async function saveSalesContext(context: SalesContext): Promise<void> {
  const log = await readWhatsAppLog()
  log.context = context
  await writeWhatsAppLog(log)
}

/** Remember the customer message and answer it once, even if no browser tab is open. */
export async function answerInbound(items: WaInbound[], lineFor: (companyId: string | undefined) => Promise<WaEnv>): Promise<void> {
  if (items.length === 0) return
  const log = await readWhatsAppLog()
  let changed = false
  for (const item of items) {
    const chat = chatFor(log, item.phone, item.name)
    if (!chat.messages.some((message) => message.id === item.id)) {
      chat.messages.push({ id: item.id, at: new Date().toISOString(), author: 'client', text: item.text, status: 'received' })
      changed = true
    }
    if (alreadyAnswered(chat, item.id) || chat.locks?.includes(item.id)) continue
    chat.locks = [...(chat.locks ?? []), item.id].slice(-40)
    changed = true
    await writeWhatsAppLog(log)
    try {
      const reply = await draftReply(log.context, chat, item.text)
      const line = await lineFor(log.context?.companyId)
      const sent = RETIRED.test(reply.text)
        ? { ok: false, status: 409, error: 'This old reply was stopped so it is not sent again.' }
        : await sendWhatsAppText(line, item.phone, reply.text)
      chat.messages.push({
        id: `wa_${item.id}`.slice(0, 140),
        at: new Date().toISOString(),
        author: 'quorum',
        text: reply.text,
        status: sent.ok ? 'sent' : 'failed',
        error: sent.ok ? undefined : sent.error,
      })
      chat.sale = reply.sale
      if (reply.effect) chat.effect = reply.effect
    } catch (error) {
      chat.locks = (chat.locks ?? []).filter((id) => id !== item.id)
      chat.messages.push({
        id: `wa_${item.id}`.slice(0, 140),
        at: new Date().toISOString(),
        author: 'quorum',
        text: 'Yes, I am here. Tell me what you need and I will take it from there.',
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 180) : 'The reply could not be sent.',
      })
    }
    changed = true
    await writeWhatsAppLog(log)
  }
  if (changed) await writeWhatsAppLog(log)
}

export async function rememberOutbound(phone: string, messageId: string, text: string, status: 'sent' | 'failed', error?: string): Promise<void> {
  const log = await readWhatsAppLog()
  const chat = chatFor(log, phone, phone)
  if (chat.messages.some((message) => message.id === messageId)) {
    const message = chat.messages.find((item) => item.id === messageId)
    if (message) {
      message.text = text
      message.status = status
      message.error = error
    }
  } else {
    chat.messages.push({ id: messageId, at: new Date().toISOString(), author: 'quorum', text, status, error })
  }
  await writeWhatsAppLog(log)
}

export async function sendIsDuplicate(phone: string, text: string, inReplyTo?: string): Promise<boolean> {
  const log = await readWhatsAppLog()
  const chat = log.chats.find((item) => item.phone === phone.replace(/\D/g, ''))
  if (!chat) return false
  if (inReplyTo && (chat.locks?.includes(inReplyTo) || alreadyAnswered(chat, inReplyTo))) return true
  const recent = [...chat.messages].reverse().find((message) => message.author === 'quorum' && message.status === 'sent')
  if (!recent) return false
  const age = Date.now() - Date.parse(recent.at)
  return recent.text.trim() === text.trim() && Number.isFinite(age) && age < 2 * 60 * 1000
}

async function draftReply(context: SalesContext | undefined, chat: LogChat, text: string): Promise<{ text: string; sale: LogChat['sale']; effect?: LogEffect }> {
  const company = context?.company || 'the company'
  const staffName = context?.handler?.name || company
  const history = chat.messages.slice(-12).map((message) => ({ author: message.author, text: message.text }))
  const lines = requestLines([...history, { author: 'client', text }])
  const sale = nextSale(chat.sale, text, lines)
  const quoted = lines
    .map((item) => ({ item, price: allowedPrices(context, item).at(-1) }))
    .filter((line) => line.price)
  const missing = lines.filter((item) => !quoted.some((line) => line.item === item))
  const holding = needsQuote(lines) && missing.length > 0
  const alreadyPriced = chat.sale?.stage === 'quoted' || chat.sale?.stage === 'details' || chat.sale?.stage === 'invoiced'
  if (needsQuote(lines) && missing.length === 0 && !alreadyPriced) {
    return {
      text: quoteLines(quoted.map((line) => ({ item: line.item, amount: line.price?.amount ?? '' }))),
      sale: { ...sale, stage: 'quoted', priceAmount: quoted[0]?.price?.amount, detail: lines.join('; ').slice(0, 240) },
    }
  }
  const allowed = needsQuote(lines) ? quoted.flatMap((line) => (line.price ? [line.price] : [])) : allowedPrices(context, sale.item)
  const spoken = await speak(context, staffName, text, history, allowed, holding ? lines : [])
  const safeText = spoken && !inventedPrice(spoken, allowed) ? spoken : ''
  const withHold = holding && safeText && !/hold on while I confirm the price/i.test(safeText)
    ? `Please hold on while I confirm the price. ${safeText}`
    : safeText
  const safe = withHold || humanFallback(company, staffName, text, sale, allowed, holding ? lines : [])
  return { text: safe, sale }
}

function nextSale(current: LogChat['sale'], text: string, lines: string[]): NonNullable<LogChat['sale']> {
  const sale = current ?? { stage: 'open' }
  const item = lines[0] || mentionedItem(text) || sale.item
  const holding = needsQuote(lines)
  if (!item) return sale
  const settled = sale.stage === 'quoted' || sale.stage === 'details' || sale.stage === 'invoiced' || sale.stage === 'calling'
  const stage = holding && !settled ? 'awaiting_price' : sale.stage === 'open' ? 'qualifying' : sale.stage
  return { ...sale, item, detail: holding ? lines.join('; ').slice(0, 240) : sale.detail, stage }
}

function needsQuote(lines: string[]): boolean {
  return lines.length > 1
}

function allowedPrices(context: SalesContext | undefined, item: string | undefined) {
  if (!item) return []
  const name = item.toLowerCase()
  return (context?.prices ?? []).filter((price) => {
    const saved = price.item.toLowerCase()
    return saved === name || name.includes(saved)
  })
}

function humanFallback(
  company: string,
  staffName: string,
  text: string,
  sale: NonNullable<LogChat['sale']>,
  allowed: { amount: string; floor?: string }[],
  lines: string[] = [],
): string {
  const price = allowed.at(-1)
  if (lines.length > 0) {
    return `Please hold on while I confirm the price. I have ${lines.join(', ')}. I will send each figure in this chat as soon as it is confirmed.`
  }
  if (/^(are you there|you there|hello|hi|hey)\b/i.test(text.trim()) && price) {
    return `Yes, I am here. The price is still ${price.amount}. Tell me if you want to go ahead.`
  }
  if (sale.item === 'starlink' || /\bstarlink\b/i.test(text)) {
    return `Yes, we sell Starlink. Where are you located, and which kit do you want: Gen 2, Gen 3, High Performance, or Mini?`
  }
  if (sale.item === 'laptop' || /\blaptops?\b/i.test(text)) {
    return `Yes, we can get you a laptop. What sort of work is it for, and do you already have a specification, or should I recommend one?`
  }
  if (sale.item) {
    return `Yes, we deal on ${sale.item}. Where are you located, and what exactly do you need it for?`
  }
  return `Hello, this is ${staffName} from ${company}. Tell me what you are looking for and I will help you sort it.`
}

function mentionedItem(text: string): string {
  const word = text.match(/\b(starlinks?|laptops?|phones?|computers?|generators?|inverters?|solar|websites?|logos?|printers?|routers?)\b/i)?.[1] ?? ''
  return word.toLowerCase().replace(/s$/, '')
}

async function speak(
  context: SalesContext | undefined,
  staffName: string,
  latest: string,
  history: { author: string; text: string }[],
  allowed: { amount: string; floor?: string }[],
  holding: string[] = [],
): Promise<string> {
  const company = context?.company || 'the company'
  const transcript = history
    .slice(-10)
    .map((message) => `${message.author === 'client' ? 'Customer' : 'You'}: ${message.text}`)
    .join('\n')
  const priceList = allowed.length
    ? allowed.map((price) => `opening ${price.amount}${price.floor ? `, lowest ${price.floor}` : ''}`).join('; ')
    : 'none yet'
  const catalog = (context?.products ?? []).map((product) => `${product.name}: ${product.fact}`).join('\n') || 'not listed yet'
  const goals = (context?.goals ?? []).filter(Boolean).join('; ') || 'win and keep customers'
  const learned = (context?.learned ?? []).filter(Boolean).slice(0, 8).join('\n') || 'nothing saved yet'
  const system = [
    `You are ${staffName}, a salesperson at ${company}.`,
    `The company is: ${context?.business || company}.`,
    `What it is trying to grow: ${goals}.`,
    `What the owner has already taught. Follow it:\n${learned}`,
    `Products and services already on file:\n${catalog}`,
    'Your job is to help this company grow by attending to the customer the way a sharp salesperson would.',
    'Reply on WhatsApp in clear, friendly English. Two to four short sentences. You understand Nigerian Pidgin.',
    'Answer the question they actually asked. If they ask whether the company sells or deals on something in its line of business, say yes, then ask the useful next questions.',
    'For Starlink, ask their location and which kit they want: Gen 2, Gen 3, High Performance, or Mini.',
    'For a laptop, ask what the work is and whether they have a specification. If they want a recommendation for ordinary work, suggest a straightforward HP or Dell with 16GB RAM and 256GB storage.',
    `Confirmed prices you may quote: ${priceList}.`,
    holding.length > 0
      ? `The customer already gave enough to price: ${holding.join('; ')}. You do not have a confirmed price for every line yet. Start with "Please hold on while I confirm the price." Then keep a warm conversation for one or two sentences. Acknowledge what they just said. Do not ask again for a detail they already gave. Do not mention money.`
      : 'Do not invent a naira price. If no price is confirmed for what they want, do not mention money. Understand the need first.',
    'Do not say you are an AI. Do not say you will not guess a figure. Do not hand the chat to someone else.',
  ].join('\n')
  const next = await chatComplete(
    [
      { role: 'system', content: system },
      { role: 'user', content: `Latest customer message:\n${latest}\n\nConversation so far:\n${transcript || latest}` },
    ],
    0.7,
  )
  if (next && !RETIRED.test(next) && !/will not guess a figure/i.test(next) && !inventedPrice(next, allowed)) return next.slice(0, 700)
  return ''
}

function inventedPrice(text: string, allowed: { amount: string; floor?: string }[]): boolean {
  const allowedNumbers = new Set(allowed.flatMap((price) => priceFigures(`${price.amount} ${price.floor ?? ''}`)))
  return priceFigures(text).some((value) => !allowedNumbers.has(value))
}

function priceFigures(text: string): number[] {
  const found = new Set<number>()
  for (const match of text.matchAll(/(?:₦|NGN|naira)\s*([\d,]+)/gi)) {
    const value = Number(match[1].replace(/,/g, ''))
    if (value >= 1000) found.add(value)
  }
  for (const match of text.matchAll(/\b(\d{5,9})\b/g)) {
    const value = Number(match[1])
    if (value >= 1000) found.add(value)
  }
  return [...found]
}
