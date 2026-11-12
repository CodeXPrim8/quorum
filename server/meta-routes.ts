import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  companyMetaPublicNow,
  finishInstagramOAuth,
  instagramAuthUrl,
  metaAppEnv,
  metaAppReady,
  readOAuthState,
  saveCompanyWhatsApp,
} from './meta-oauth.js'
import { clearCompanyChannelCloud, cloudMetaConfig } from './meta-store.js'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function redirect(res: ServerResponse, location: string) {
  res.statusCode = 302
  res.setHeader('Location', location)
  res.end()
}

function home(): string {
  return String(process.env.META_PUBLIC_BASE ?? 'https://www.quorom.ng')
    .trim()
    .replace(/\/$/, '')
}

function integrations(query: string): string {
  return `${home()}/#/integrations?${query}`
}

function readBody(req: IncomingMessage, max = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > max) {
        reject(new Error('The request is too large.'))
        req.destroy()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Production routes for /api/meta. The local app serves the same paths from Vite. */
export async function serveMeta(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const url = new URL(req.url || '/', 'https://www.quorom.ng')
  const method = req.method || 'GET'
  const app = metaAppEnv(process.env)

  if (pathname === '/api/meta/status' && method === 'GET') {
    const companyId = String(url.searchParams.get('companyId') ?? '')
    json(res, 200, await companyMetaPublicNow(app, companyId || undefined))
    return
  }

  if (pathname === '/api/meta/instagram/connect' && (method === 'GET' || method === 'HEAD')) {
    const companyId = String(url.searchParams.get('companyId') ?? '').trim()
    if (!companyId) {
      json(res, 400, { error: 'companyId is required.' })
      return
    }
    if (!metaAppReady(app)) {
      json(res, 503, {
        error:
          'Set META_APP_ID, META_APP_SECRET, META_ENCRYPT_KEY, and META_PUBLIC_BASE (https) before companies can connect Instagram.',
      })
      return
    }
    const target = instagramAuthUrl(app, companyId)
    if (!target) {
      json(res, 503, { error: 'Instagram connect is not ready.' })
      return
    }
    redirect(res, target)
    return
  }

  if (pathname === '/api/meta/callback' && method === 'GET') {
    const err = url.searchParams.get('error_description') || url.searchParams.get('error')
    if (err) {
      redirect(res, integrations(`meta=error&message=${encodeURIComponent(err)}`))
      return
    }
    const code = String(url.searchParams.get('code') ?? '')
    const state = String(url.searchParams.get('state') ?? '')
    const parsed = readOAuthState(app, state)
    if (!code || !parsed) {
      redirect(res, integrations('meta=error&message=Invalid%20Meta%20callback'))
      return
    }
    if (!cloudMetaConfig()) {
      redirect(res, integrations('meta=error&message=Meta%20storage%20is%20not%20configured'))
      return
    }
    try {
      const result = await finishInstagramOAuth(app, parsed.companyId, code)
      const q = new URLSearchParams({
        meta: 'instagram',
        username: result.username || '',
        accountId: result.accountId,
      })
      redirect(res, integrations(q.toString()))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Instagram connect failed.'
      redirect(res, integrations(`meta=error&message=${encodeURIComponent(message)}`))
    }
    return
  }

  if (pathname === '/api/meta/whatsapp/connect' && method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}') as {
        companyId?: string
        token?: string
        phoneNumberId?: string
        verifyToken?: string
        displayPhone?: string
      }
      const companyId = String(body.companyId ?? '').trim()
      if (!companyId) {
        json(res, 400, { error: 'companyId is required.' })
        return
      }
      if (!app.encryptKey) {
        json(res, 503, { error: 'Set META_ENCRYPT_KEY before companies can connect WhatsApp.' })
        return
      }
      const saved = await saveCompanyWhatsApp(app, companyId, {
        token: String(body.token ?? ''),
        phoneNumberId: String(body.phoneNumberId ?? ''),
        verifyToken: body.verifyToken ? String(body.verifyToken) : undefined,
        displayPhone: body.displayPhone ? String(body.displayPhone) : undefined,
      })
      json(res, 200, {
        ok: true,
        whatsapp: {
          connected: true,
          phoneNumberId: saved.phoneNumberId,
          displayPhone: saved.displayPhone,
          source: 'company',
        },
      })
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'WhatsApp could not be saved.' })
    }
    return
  }

  if (pathname === '/api/meta/disconnect' && method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req, 10_000)) || '{}') as { companyId?: string; channel?: string }
      const companyId = String(body.companyId ?? '').trim()
      const channel = body.channel === 'whatsapp' ? 'whatsapp' : body.channel === 'instagram' ? 'instagram' : null
      if (!companyId || !channel) {
        json(res, 400, { error: 'companyId and channel are required.' })
        return
      }
      if (!app.encryptKey || !cloudMetaConfig()) {
        json(res, 503, { error: 'Set META_ENCRYPT_KEY before disconnecting.' })
        return
      }
      await clearCompanyChannelCloud(app.encryptKey, companyId, channel)
      json(res, 200, { ok: true, ...(await companyMetaPublicNow(app, companyId)) })
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Disconnect failed.' })
    }
    return
  }

  res.statusCode = 404
  res.end()
}
