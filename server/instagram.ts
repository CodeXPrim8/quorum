import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export type InstagramEnv = {
  token: string
  userId: string
  publicBase: string
}

export function instagramEnv(env: Record<string, string | undefined>): InstagramEnv {
  return {
    token: String(env.INSTAGRAM_TOKEN ?? '').trim(),
    userId: String(env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '').trim(),
    publicBase: String(env.INSTAGRAM_PUBLIC_BASE ?? '').trim().replace(/\/$/, ''),
  }
}

export function instagramReady(env: InstagramEnv): boolean {
  return Boolean(env.token && env.userId)
}

export function canHostMedia(env: InstagramEnv): boolean {
  return Boolean(env.publicBase && /^https:\/\//i.test(env.publicBase))
}

const MEDIA_ROOT = join(process.cwd(), 'data', 'instagram-media')

export function mediaDir(): string {
  mkdirSync(MEDIA_ROOT, { recursive: true })
  return MEDIA_ROOT
}

export function storePublishImage(bytes: Buffer, mime: 'image/jpeg' | 'image/png'): { id: string; file: string; mime: string } {
  const id = randomBytes(12).toString('hex')
  const ext = mime === 'image/png' ? 'png' : 'jpg'
  const file = join(mediaDir(), `${id}.${ext}`)
  writeFileSync(file, bytes)
  return { id: `${id}.${ext}`, file, mime }
}

export function readPublishImage(id: string): { bytes: Buffer; mime: string } | null {
  if (!/^[a-f0-9]{24}\.(jpg|png)$/.test(id)) return null
  try {
    const bytes = readFileSync(join(MEDIA_ROOT, id))
    return { bytes, mime: id.endsWith('.png') ? 'image/png' : 'image/jpeg' }
  } catch {
    return null
  }
}

export function dropPublishImage(id: string): void {
  if (!/^[a-f0-9]{24}\.(jpg|png)$/.test(id)) return
  try {
    unlinkSync(join(MEDIA_ROOT, id))
  } catch {
    /* already gone */
  }
}

export function parseImageDataUrl(raw: string): { bytes: Buffer; mime: 'image/jpeg' | 'image/png' } | null {
  const match = raw.trim().match(/^data:(image\/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return null
  const mime = /png/i.test(match[1]) ? 'image/png' : 'image/jpeg'
  try {
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
    if (bytes.length < 80 || bytes.length > 8_000_000) return null
    return { bytes, mime }
  } catch {
    return null
  }
}

async function graph(path: string, token: string, body?: Record<string, string>): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; error?: string }> {
  const url = new URL(`https://graph.facebook.com/v21.0/${path.replace(/^\//, '')}`)
  url.searchParams.set('access_token', token)
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const err = data.error as { message?: string } | undefined
    return { ok: false, status: response.status, data, error: err?.message || 'Instagram could not take that post.' }
  }
  return { ok: true, status: response.status, data }
}

async function waitReady(creationId: string, token: string): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < 12; i += 1) {
    const status = await graph(`${creationId}?fields=status_code`, token)
    if (!status.ok) return { ok: false, error: status.error }
    const code = String(status.data.status_code ?? '')
    if (code === 'FINISHED') return { ok: true }
    if (code === 'ERROR' || code === 'EXPIRED') return { ok: false, error: 'Instagram rejected the image container.' }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return { ok: false, error: 'Instagram is still processing the image. Try again in a minute.' }
}

export type PublishInput = {
  caption: string
  /** Public https URL Instagram can fetch, or a data URL when INSTAGRAM_PUBLIC_BASE is set. */
  image: string
}

export async function publishInstagramFeed(
  env: InstagramEnv,
  input: PublishInput,
): Promise<{ ok: boolean; status: number; mediaId?: string; error?: string }> {
  if (!instagramReady(env)) {
    return { ok: false, status: 503, error: 'Instagram is not connected. Put INSTAGRAM_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in .env.' }
  }
  const caption = input.caption.trim().slice(0, 2200)
  let imageUrl = input.image.trim()
  let storedId: string | undefined
  if (imageUrl.startsWith('data:')) {
    if (!canHostMedia(env)) {
      return {
        ok: false,
        status: 503,
        error: 'Set INSTAGRAM_PUBLIC_BASE to a public https address for this Quorum server so Instagram can fetch the image.',
      }
    }
    const parsed = parseImageDataUrl(imageUrl)
    if (!parsed) return { ok: false, status: 400, error: 'That image was not a usable JPEG or PNG.' }
    const stored = storePublishImage(parsed.bytes, parsed.mime)
    storedId = stored.id
    imageUrl = `${env.publicBase}/api/instagram/media/${stored.id}`
  } else if (!/^https:\/\//i.test(imageUrl)) {
    return { ok: false, status: 400, error: 'Instagram needs an https image URL.' }
  }

  try {
    const created = await graph(`${env.userId}/media`, env.token, {
      image_url: imageUrl,
      caption,
    })
    if (!created.ok) return { ok: false, status: created.status, error: created.error }
    const creationId = String(created.data.id ?? '')
    if (!creationId) return { ok: false, status: 502, error: 'Instagram did not return a media container.' }
    const ready = await waitReady(creationId, env.token)
    if (!ready.ok) return { ok: false, status: 502, error: ready.error }
    const published = await graph(`${env.userId}/media_publish`, env.token, { creation_id: creationId })
    if (!published.ok) return { ok: false, status: published.status, error: published.error }
    return { ok: true, status: 200, mediaId: String(published.data.id ?? creationId) }
  } finally {
    if (storedId) dropPublishImage(storedId)
  }
}

/** Test helper: write a tiny JPEG-like buffer path without publishing. */
export function scratchPath(): string {
  return join(tmpdir(), `quorum-ig-${randomBytes(4).toString('hex')}.bin`)
}
