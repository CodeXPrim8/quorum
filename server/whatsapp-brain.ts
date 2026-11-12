import { chatComplete } from './model-chat.js'
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
  const sale = nextSale(chat.sale, text)
  const history = chat.messages.slice(-12).map((message) => ({ author: message.author, text: message.text }))
  const allowed = allowedPrices(context, sale.item)
  const spoken = await speak(context, staffName, text, history, allowed)
  const safe = spoken && !inventedPrice(spoken, allowed) ? spoken : humanFallback(company, staffName, text, sale, allowed)
  return { text: safe, sale }
}

function nextSale(current: LogChat['sale'], text: string): NonNullable<LogChat['sale']> {
  const sale = current ?? { stage: 'open' }
  const item = mentionedItem(text) || sale.item
  if (!item) return sale
  return { ...sale, item, stage: sale.stage === 'open' ? 'qualifying' : sale.stage }
}

function allowedPrices(context: SalesContext | undefined, item: string | undefined) {
  if (!item) return []
  return (context?.prices ?? []).filter((price) => price.item.toLowerCase() === item || item.includes(price.item.toLowerCase()))
}

function humanFallback(
  company: string,
  staffName: string,
  text: string,
  sale: NonNullable<LogChat['sale']>,
  allowed: { amount: string; floor?: string }[],
): string {
  const price = allowed.at(-1)
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
  const system = [
    `You are ${staffName}, a salesperson at ${company}.`,
    `The company is: ${context?.business || company}.`,
    `What it is trying to grow: ${goals}.`,
    `Products and services already on file:\n${catalog}`,
    'Your job is to help this company grow by attending to the customer the way a sharp salesperson would.',
    'Reply on WhatsApp in clear, friendly English. Two to four short sentences. You understand Nigerian Pidgin.',
    'Answer the question they actually asked. If they ask whether the company sells or deals on something in its line of business, say yes, then ask the useful next questions.',
    'For Starlink, ask their location and which kit they want: Gen 2, Gen 3, High Performance, or Mini.',
    'For a laptop, ask what the work is and whether they have a specification. If they want a recommendation for ordinary work, suggest a straightforward HP or Dell with 16GB RAM and 256GB storage.',
    `Confirmed prices you may quote: ${priceList}.`,
    'Do not invent a naira price. If no price is confirmed for what they want, do not mention money. Understand the need first.',
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
