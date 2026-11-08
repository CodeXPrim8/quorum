import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type CompanyInstagramSecret = {
  token: string
  userId: string
  username?: string
  pageId?: string
  connectedAt: string
}

export type CompanyWhatsAppSecret = {
  token: string
  phoneNumberId: string
  verifyToken?: string
  displayPhone?: string
  connectedAt: string
}

export type CompanyMetaSecret = {
  companyId: string
  instagram?: CompanyInstagramSecret
  whatsapp?: CompanyWhatsAppSecret
}

type StoreFile = { version: 1; companies: Record<string, string> }

const STORE_PATH = join(process.cwd(), 'data', 'meta-connections.json')

function ensureDir() {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
}

export function encryptKeyFromEnv(env: Record<string, string | undefined>): Buffer | null {
  const raw = String(env.META_ENCRYPT_KEY ?? '').trim()
  if (!raw) return null
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw).digest()
}

function seal(key: Buffer, plain: object): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`
}

function open(key: Buffer, packed: string): CompanyMetaSecret | null {
  const parts = packed.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return null
  try {
    const iv = Buffer.from(parts[1], 'base64url')
    const tag = Buffer.from(parts[2], 'base64url')
    const data = Buffer.from(parts[3], 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plain) as CompanyMetaSecret
    if (!parsed?.companyId) return null
    return parsed
  } catch {
    return null
  }
}

function readFile(): StoreFile {
  ensureDir()
  if (!existsSync(STORE_PATH)) return { version: 1, companies: {} }
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as StoreFile
    if (parsed?.version !== 1 || typeof parsed.companies !== 'object') return { version: 1, companies: {} }
    return parsed
  } catch {
    return { version: 1, companies: {} }
  }
}

function writeFile(store: StoreFile) {
  ensureDir()
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function readCompanyMeta(key: Buffer | null, companyId: string): CompanyMetaSecret | null {
  if (!key || !companyId) return null
  const packed = readFile().companies[companyId]
  if (!packed) return null
  return open(key, packed)
}

export function writeCompanyMeta(key: Buffer | null, record: CompanyMetaSecret): boolean {
  if (!key || !record.companyId) return false
  const store = readFile()
  store.companies[record.companyId] = seal(key, record)
  writeFile(store)
  return true
}

export function patchCompanyMeta(
  key: Buffer | null,
  companyId: string,
  patch: Partial<Pick<CompanyMetaSecret, 'instagram' | 'whatsapp'>>,
): CompanyMetaSecret | null {
  if (!key || !companyId) return null
  const current = readCompanyMeta(key, companyId) ?? { companyId }
  const next: CompanyMetaSecret = {
    companyId,
    instagram: patch.instagram === undefined ? current.instagram : patch.instagram || undefined,
    whatsapp: patch.whatsapp === undefined ? current.whatsapp : patch.whatsapp || undefined,
  }
  if (!next.instagram) delete next.instagram
  if (!next.whatsapp) delete next.whatsapp
  writeCompanyMeta(key, next)
  return next
}

export function clearCompanyChannel(
  key: Buffer | null,
  companyId: string,
  channel: 'instagram' | 'whatsapp',
): CompanyMetaSecret | null {
  if (!key || !companyId) return null
  const current = readCompanyMeta(key, companyId)
  if (!current) return null
  if (channel === 'instagram') delete current.instagram
  if (channel === 'whatsapp') delete current.whatsapp
  if (!current.instagram && !current.whatsapp) {
    const store = readFile()
    delete store.companies[companyId]
    writeFile(store)
    return { companyId }
  }
  writeCompanyMeta(key, current)
  return current
}

/** Find which company owns a WhatsApp phone number id (for inbound webhooks). */
export function findCompanyByWhatsAppPhone(
  key: Buffer | null,
  phoneNumberId: string,
): CompanyMetaSecret | null {
  if (!key || !phoneNumberId) return null
  const store = readFile()
  for (const packed of Object.values(store.companies)) {
    const record = open(key, packed)
    if (record?.whatsapp?.phoneNumberId === phoneNumberId) return record
  }
  return null
}

export function publicMetaStatus(record: CompanyMetaSecret | null): {
  instagram: { connected: boolean; username?: string; accountId?: string }
  whatsapp: { connected: boolean; phoneNumberId?: string; displayPhone?: string }
} {
  return {
    instagram: {
      connected: Boolean(record?.instagram?.token && record.instagram.userId),
      username: record?.instagram?.username,
      accountId: record?.instagram?.userId,
    },
    whatsapp: {
      connected: Boolean(record?.whatsapp?.token && record.whatsapp.phoneNumberId),
      phoneNumberId: record?.whatsapp?.phoneNumberId,
      displayPhone: record?.whatsapp?.displayPhone,
    },
  }
}
