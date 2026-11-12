import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type WaInbound = {
  id: string
  phone: string
  name: string
  text: string
}

export type WaEnv = {
  token: string
  phoneNumberId: string
  verifyToken: string
  appSecret: string
}

export function whatsAppEnv(env: Record<string, string | undefined>): WaEnv {
  return {
    token: String(env.WHATSAPP_TOKEN ?? '').trim(),
    phoneNumberId: String(env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim(),
    verifyToken: String(env.WHATSAPP_VERIFY_TOKEN ?? '').trim(),
    appSecret: String(env.WHATSAPP_APP_SECRET ?? '').trim(),
  }
}

export function lineReady(env: WaEnv): boolean {
  return Boolean(env.token && env.phoneNumberId)
}

export function verifyChallenge(params: URLSearchParams, expected: string): string | null {
  if (!expected) return null
  if (params.get('hub.mode') !== 'subscribe') return null
  if (params.get('hub.verify_token') !== expected) return null
  const challenge = params.get('hub.challenge') ?? ''
  if (!challenge || challenge.length > 256) return null
  return challenge
}

export function signatureOk(raw: string, header: string | undefined, secret: string): boolean {
  if (!secret) return true
  const given = String(header ?? '')
  if (!given.startsWith('sha256=')) return false
  const mac = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  const left = Buffer.from(given.slice('sha256='.length))
  const right = Buffer.from(mac)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export function parseWebhook(payload: unknown): WaInbound[] {
  const root = payload as {
    entry?: { changes?: { value?: { contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: unknown } }[] }[]
  }
  const found: WaInbound[] = []
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const contacts = value?.contacts ?? []
      const messages = Array.isArray(value?.messages) ? value.messages : []
      for (const item of messages) {
        const message = item as { id?: string; from?: string; type?: string; text?: { body?: string } }
        const phone = String(message.from ?? '').replace(/\D/g, '')
        const id = String(message.id ?? '').trim()
        if (!phone || !id) continue
        const contact = contacts.find((person) => String(person.wa_id ?? '').replace(/\D/g, '') === phone)
        const name = contact?.profile?.name?.trim() || phone
        const text =
          message.type === 'text'
            ? String(message.text?.body ?? '').trim()
            : message.type
              ? `The client sent a ${message.type}. Ask them to describe the request in a message.`
              : ''
        if (!text) continue
        found.push({ id, phone, name, text: text.slice(0, 1000) })
      }
    }
  }
  return found
}

export function inboxFile(root = process.cwd()): string {
  return path.join(root, 'data', 'whatsapp-inbox.json')
}

function readQueue(file: string): WaInbound[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as WaInbound[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(file: string, items: WaInbound[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(items.slice(-200)))
}

export function enqueueInbound(file: string, items: WaInbound[]) {
  if (items.length === 0) return
  const current = readQueue(file)
  const seen = new Set(current.map((item) => item.id))
  writeQueue(file, [...current, ...items.filter((item) => !seen.has(item.id))])
}

export function listInbound(file: string): WaInbound[] {
  return readQueue(file)
}

export function ackInbound(file: string, ids: string[]) {
  const drop = new Set(ids)
  writeQueue(file, readQueue(file).filter((item) => !drop.has(item.id)))
}

const RETIRED_REPLY = /I will not send a price/i

export async function sendWhatsAppText(env: WaEnv, to: string, text: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const phone = to.replace(/\D/g, '')
  const body = text.trim().slice(0, 1000)
  if (RETIRED_REPLY.test(body)) return { ok: false, status: 409, error: 'This old reply was stopped so it is not sent again.' }
  if (!lineReady(env) || !phone || !body) return { ok: false, status: 503, error: 'The company WhatsApp line is not connected.' }
  const response = await fetch(`https://graph.facebook.com/v21.0/${env.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    }),
  })
  if (response.ok) return { ok: true, status: response.status }
  return { ok: false, status: response.status, error: graphError(rawSafe(await response.text(), env.token)) }
}

export async function sendWhatsAppDocument(
  env: WaEnv,
  to: string,
  text: string,
  pdfBase64: string,
  filename: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const phone = to.replace(/\D/g, '')
  const caption = text.trim().slice(0, 1000)
  const clean = pdfBase64.replace(/^data:application\/pdf;base64,/i, '')
  if (RETIRED_REPLY.test(caption)) return { ok: false, status: 409, error: 'This old reply was stopped so it is not sent again.' }
  if (!lineReady(env) || !phone || !clean) return { ok: false, status: 503, error: 'The company WhatsApp line is not connected.' }
  const bytes = Buffer.from(clean, 'base64')
  const form = new FormData()
  form.set('messaging_product', 'whatsapp')
  form.set('type', 'application/pdf')
  form.set('file', new Blob([bytes], { type: 'application/pdf' }), filename || 'invoice.pdf')
  const uploaded = await fetch(`https://graph.facebook.com/v21.0/${env.phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}` },
    body: form,
  })
  const uploadedText = await uploaded.text()
  if (!uploaded.ok) return { ok: false, status: uploaded.status, error: graphError(rawSafe(uploadedText, env.token)) }
  let mediaId = ''
  try {
    mediaId = String((JSON.parse(uploadedText) as { id?: string }).id ?? '')
  } catch {
    mediaId = ''
  }
  if (!mediaId) return { ok: false, status: 502, error: 'WhatsApp did not accept the invoice file.' }
  const response = await fetch(`https://graph.facebook.com/v21.0/${env.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'document',
      document: { id: mediaId, filename: filename || 'invoice.pdf', caption },
    }),
  })
  if (response.ok) return { ok: true, status: response.status }
  return { ok: false, status: response.status, error: graphError(rawSafe(await response.text(), env.token)) }
}

function rawSafe(raw: string, token: string): string {
  return token ? raw.split(token).join('…') : raw
}

function graphError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } }
    if (parsed.error?.message) return parsed.error.message.slice(0, 240)
  } catch {
    /* The body is already short enough to show. */
  }
  return raw.slice(0, 240) || 'WhatsApp did not accept the reply.'
}
