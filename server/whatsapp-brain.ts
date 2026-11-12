import { planClientTurn } from '../src/domain/whatsapp-sales.ts'
import type { PriceEntry, Product, WaMessage, WaSale } from '../src/types.ts'
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
let skipGpt41 = false

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
  const handler = context?.handler ?? null
  const history: WaMessage[] = chat.messages.slice(-12).map((message) => ({
    id: message.id,
    at: message.at,
    author: message.author,
    text: message.text,
    status: message.status,
  }))
  const prices = (context?.prices ?? []) as PriceEntry[]
  const products = (context?.products ?? []).map((product) => ({ ...product, kind: 'hardware' as const })) as Product[]
  const plan = planClientTurn({
    company,
    handler,
    sales: context?.sales ?? handler,
    text,
    profileName: chat.name,
    phone: chat.phone,
    sale: chat.sale as WaSale | undefined,
    history,
    prices,
    products,
    now: Date.now(),
    account: context?.account,
  })
  const spoken = RETIRED.test(plan.reply) ? `Hello, this is ${handler?.name || company}. How can I help you today?` : await speak(company, handler?.name || company, plan.reply, history)
  return {
    text: spoken,
    sale: plan.sale,
    effect: {
      customer: plan.customer,
      invoice: plan.invoice,
      call: plan.call,
    },
  }
}

async function speak(company: string, staffName: string, draft: string, history: WaMessage[]): Promise<string> {
  const transcript = history
    .slice(-8)
    .map((message) => `${message.author === 'client' ? 'Customer' : 'You'}: ${message.text}`)
    .join('\n')
  const system = [
    `You are ${staffName} at ${company}, replying to a customer on WhatsApp.`,
    'Write the next message only. Sound like a person: friendly, brief, and professional. Two to four sentences.',
    'You understand informal English and Nigerian Pidgin.',
    'Follow the brief. Do not add a price, a discount, or any number that is not already in the brief.',
    'Do not say you are an AI, do not hand the customer to someone else, and do not say you will not send a price.',
    'If they asked whether you are there, answer that first.',
  ].join(' ')
  const user = `Brief:\n${draft}\n\nConversation so far:\n${transcript || 'Customer just wrote.'}`
  const openai = String(process.env.OPENAI_API_KEY ?? '').trim()
  const deepseek = String(process.env.DEEPSEEK_API_KEY ?? '').trim()
  const deepseekModel = String(process.env.DEEPSEEK_MODEL ?? 'deepseek-chat').trim() || 'deepseek-chat'
  const attempts: { url: string; key: string; model: string }[] = []
  if (openai && !skipGpt41) attempts.push({ url: 'https://api.openai.com/v1/chat/completions', key: openai, model: 'gpt-4.1' })
  if (openai) attempts.push({ url: 'https://api.openai.com/v1/chat/completions', key: openai, model: 'gpt-4o' })
  if (deepseek) attempts.push({ url: 'https://api.deepseek.com/v1/chat/completions', key: deepseek, model: deepseekModel })
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${attempt.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: attempt.model,
          temperature: 0.6,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      if (response.status === 404 && attempt.model === 'gpt-4.1') {
        skipGpt41 = true
        continue
      }
      if (!response.ok) continue
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
      const next = String(data.choices?.[0]?.message?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 700)
      if (next && sameAmounts(draft, next) && !RETIRED.test(next)) return next
    } catch {
      /* Try the next model. The brief is still safe to send. */
    }
  }
  return draft
}

function sameAmounts(original: string, next: string): boolean {
  const before = amounts(original)
  const after = amounts(next)
  return before.every((value) => after.includes(value)) && after.every((value) => before.includes(value))
}

function amounts(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*/g)].map((match) => match[0].replace(/,/g, ''))
}
