import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cloudMetaConfig } from './meta-store.js'

export type LogMessage = {
  id: string
  at: string
  author: 'client' | 'quorum'
  text: string
  status: 'received' | 'sent' | 'failed' | 'held'
  error?: string
}

export type LogEffect = {
  customer?: { name: string; email?: string; address?: string; company?: string; item?: string }
  invoice?: { number: string; item: string; detail?: string; amount: string; customerName: string; email?: string; address?: string; company?: string }
  call?: boolean
}

export type LogSale = {
  item?: string
  detail?: string
  stage: string
  askedDetail?: boolean
  offeredFloor?: boolean
  priceAmount?: string
  invoiceNumber?: string
}

export type LogChat = {
  phone: string
  name: string
  sale?: LogSale
  messages: LogMessage[]
  effect?: LogEffect
  /** Inbound ids the server is answering, so a browser tab does not send a second reply. */
  locks?: string[]
}

export type SalesContext = {
  companyId?: string
  company: string
  handler: { id: string; name: string; title: string } | null
  sales: { id: string; name: string; title: string } | null
  prices: { id: string; item: string; amount: string; floor?: string; confirmedAt: string }[]
  products: { id: string; name: string; fact: string }[]
  account?: { bankName: string; accountName: string; accountNumber: string }
}

export type WhatsAppLog = {
  context?: SalesContext
  chats: LogChat[]
}

const FILE = join(process.cwd(), 'data', 'whatsapp-log.json')
const OBJECT = 'whatsapp-log'

function empty(): WhatsAppLog {
  return { chats: [] }
}

function cloud() {
  return cloudMetaConfig()
}

async function readCloud(): Promise<WhatsAppLog> {
  const cfg = cloud()
  if (!cfg) return readFile()
  const response = await fetch(`${cfg.url}/storage/v1/object/meta-connections/${OBJECT}`, {
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
  })
  if (response.status === 404) return empty()
  const raw = await response.text()
  if (!response.ok) {
    if (/not_found|Object not found/i.test(raw)) return empty()
    throw new Error('The WhatsApp conversation could not be read.')
  }
  return parse(raw)
}

async function writeCloud(log: WhatsAppLog): Promise<void> {
  const cfg = cloud()
  if (!cfg) {
    writeFile(log)
    return
  }
  const bucket = await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'meta-connections', name: 'meta-connections', public: false }),
  })
  if (!bucket.ok && bucket.status !== 409) {
    const detail = await bucket.text()
    if (!/already exists/i.test(detail)) throw new Error('The WhatsApp conversation store could not be opened.')
  }
  const response = await fetch(`${cfg.url}/storage/v1/object/meta-connections/${OBJECT}`, {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: JSON.stringify(trim(log)),
  })
  if (!response.ok) throw new Error('The WhatsApp conversation could not be saved.')
}

function readFile(): WhatsAppLog {
  try {
    if (!existsSync(FILE)) return empty()
    return parse(readFileSync(FILE, 'utf8'))
  } catch {
    return empty()
  }
}

function writeFile(log: WhatsAppLog): void {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(FILE, JSON.stringify(trim(log)))
}

function parse(raw: string): WhatsAppLog {
  try {
    const parsed = JSON.parse(raw) as WhatsAppLog
    return { context: parsed.context, chats: Array.isArray(parsed.chats) ? parsed.chats : [] }
  } catch {
    return empty()
  }
}

function trim(log: WhatsAppLog): WhatsAppLog {
  return {
    context: log.context,
    chats: log.chats.slice(-80).map((chat) => ({ ...chat, messages: chat.messages.slice(-80) })),
  }
}

export async function readWhatsAppLog(): Promise<WhatsAppLog> {
  return cloud() ? readCloud() : readFile()
}

export async function writeWhatsAppLog(log: WhatsAppLog): Promise<void> {
  if (cloud()) await writeCloud(log)
  else writeFile(log)
}

export function chatFor(log: WhatsAppLog, phone: string, name: string): LogChat {
  const found = log.chats.find((chat) => chat.phone === phone)
  if (found) {
    if (name && found.name === phone) found.name = name
    return found
  }
  const created: LogChat = { phone, name, messages: [], locks: [] }
  log.chats.push(created)
  return created
}

export function alreadyAnswered(chat: LogChat, messageId: string): boolean {
  return chat.messages.some((message) => message.author === 'quorum' && message.id === `wa_${messageId}`.slice(0, 140))
}
