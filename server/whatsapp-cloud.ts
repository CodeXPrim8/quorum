import { cloudMetaConfig } from './meta-store.js'
import type { WaInbound } from './whatsapp.js'

type CloudConfig = NonNullable<ReturnType<typeof cloudMetaConfig>>

const BUCKET = 'meta-connections'
const OBJECT = 'whatsapp-inbox'

function headers(cfg: CloudConfig, extra?: Record<string, string>): Record<string, string> {
  return { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, ...extra }
}

function objectUrl(cfg: CloudConfig): string {
  return `${cfg.url}/storage/v1/object/${BUCKET}/${OBJECT}`
}

async function ensureBucket(cfg: CloudConfig): Promise<void> {
  const response = await fetch(`${cfg.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers(cfg, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  })
  if (response.ok || response.status === 409) return
  const detail = await response.text()
  if (/already exists/i.test(detail)) return
  throw new Error('The WhatsApp inbox could not be opened.')
}

async function readQueue(): Promise<WaInbound[]> {
  const cfg = cloudMetaConfig()
  if (!cfg) throw new Error('WhatsApp inbox storage is not configured.')
  const response = await fetch(objectUrl(cfg), { headers: headers(cfg) })
  if (response.status === 404) return []
  const raw = await response.text()
  if (!response.ok) {
    if (/not_found|Object not found/i.test(raw)) return []
    throw new Error('The WhatsApp inbox could not be read.')
  }
  try {
    const parsed = JSON.parse(raw) as WaInbound[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeQueue(items: WaInbound[]): Promise<void> {
  const cfg = cloudMetaConfig()
  if (!cfg) throw new Error('WhatsApp inbox storage is not configured.')
  await ensureBucket(cfg)
  const response = await fetch(objectUrl(cfg), {
    method: 'POST',
    headers: headers(cfg, { 'Content-Type': 'application/json', 'x-upsert': 'true' }),
    body: JSON.stringify(items.slice(-200)),
  })
  if (!response.ok) throw new Error('The WhatsApp inbox could not be saved.')
}

export async function cloudListInbound(): Promise<WaInbound[]> {
  return readQueue()
}

export async function cloudEnqueueInbound(items: WaInbound[]): Promise<void> {
  if (items.length === 0) return
  const current = await readQueue()
  const seen = new Set(current.map((item) => item.id))
  await writeQueue([...current, ...items.filter((item) => !seen.has(item.id))])
}

export async function cloudAckInbound(ids: string[]): Promise<void> {
  const drop = new Set(ids)
  await writeQueue((await readQueue()).filter((item) => !drop.has(item.id)))
}
