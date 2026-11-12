import type { IncomingMessage, ServerResponse } from 'node:http'
import { companyMetaPublicNow, companyWhatsAppLineNow, metaAppEnv } from './meta-oauth.js'
import { lineReady, parseWebhook, sendWhatsAppDocument, sendWhatsAppText, signatureOk, verifyChallenge, whatsAppEnv } from './whatsapp.js'
import { cloudAckInbound, cloudEnqueueInbound, cloudListInbound } from './whatsapp-cloud.js'
import { answerInbound, rememberOutbound, saveSalesContext, sendIsDuplicate } from './whatsapp-brain.js'
import { readWhatsAppLog, type SalesContext } from './whatsapp-log.js'

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
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

/** Production routes for /api/whatsapp. The local app serves the same paths from Vite. */
export async function serveWhatsApp(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const url = new URL(req.url || '/', 'https://www.quorom.ng')
  const method = req.method || 'GET'
  const app = metaAppEnv(process.env)
  const fallback = whatsAppEnv(process.env)

  if (pathname === '/api/whatsapp/status' && method === 'GET') {
    const companyId = String(url.searchParams.get('companyId') ?? '')
    const line = await companyWhatsAppLineNow(app, companyId || undefined)
    const status = await companyMetaPublicNow(app, companyId || undefined)
    json(res, 200, { linked: lineReady(line), ...status.whatsapp })
    return
  }

  if (pathname === '/api/whatsapp/webhook' && method === 'GET') {
    const challenge = verifyChallenge(url.searchParams, fallback.verifyToken)
    if (!challenge) {
      res.statusCode = 403
      res.setHeader('Content-Type', 'text/plain')
      res.end('This address is for Meta WhatsApp. Open Quorum and go to WhatsApp to read client messages.')
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end(challenge)
    return
  }

  if (pathname === '/api/whatsapp/webhook' && method === 'POST') {
    try {
      const raw = await readBody(req, 1_000_000)
      if (!signatureOk(raw, req.headers['x-hub-signature-256'] as string | undefined, fallback.appSecret || app.appSecret)) {
        res.statusCode = 403
        res.end()
        return
      }
      let payload: unknown = {}
      try {
        payload = raw ? (JSON.parse(raw) as unknown) : {}
      } catch {
        json(res, 200, { ok: true })
        return
      }
      const items = parseWebhook(payload)
      await cloudEnqueueInbound(items)
      await answerInbound(items, (companyId) => companyWhatsAppLineNow(app, companyId))
      json(res, 200, { ok: true })
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'The WhatsApp webhook could not be saved.' })
    }
    return
  }

  if (pathname === '/api/whatsapp/inbox' && method === 'GET') {
    try {
      json(res, 200, { messages: await cloudListInbound() })
    } catch (error) {
      json(res, 503, { error: error instanceof Error ? error.message : 'The WhatsApp inbox could not be read.' })
    }
    return
  }

  if (pathname === '/api/whatsapp/ack' && method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req, 100_000)) || '{}') as { ids?: string[] }
      await cloudAckInbound(Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [])
      json(res, 200, { ok: true })
    } catch {
      json(res, 400, { error: 'The inbox acknowledgement was not readable.' })
    }
    return
  }

  if (pathname === '/api/whatsapp/send' && method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req, 800_000)) || '{}') as {
        to?: string
        text?: string
        companyId?: string
        pdf?: string
        filename?: string
        messageId?: string
        inReplyTo?: string
      }
      const line = await companyWhatsAppLineNow(app, body.companyId)
      const outboundId = String(body.messageId ?? '')
      const inReplyTo = String(body.inReplyTo ?? '')
      if (!body.pdf && (await sendIsDuplicate(String(body.to ?? ''), String(body.text ?? ''), inReplyTo || undefined))) {
        json(res, 200, { ok: true, skipped: true })
        return
      }
      const result = body.pdf
        ? await sendWhatsAppDocument(line, String(body.to ?? ''), String(body.text ?? ''), body.pdf, String(body.filename ?? 'invoice.pdf'))
        : await sendWhatsAppText(line, String(body.to ?? ''), String(body.text ?? ''))
      if (outboundId) {
        await rememberOutbound(String(body.to ?? ''), outboundId, String(body.text ?? ''), result.ok ? 'sent' : 'failed', result.error)
      }
      json(res, result.ok ? 200 : result.status, result.ok ? { ok: true } : { error: result.error })
    } catch (error) {
      json(res, 502, { error: error instanceof Error ? error.message : 'WhatsApp could not be reached.' })
    }
    return
  }

  if (pathname === '/api/whatsapp/thread' && method === 'GET') {
    const log = await readWhatsAppLog()
    json(res, 200, { chats: log.chats })
    return
  }

  if (pathname === '/api/whatsapp/context' && method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req, 200_000)) || '{}') as SalesContext
      if (!body || typeof body.company !== 'string') {
        json(res, 400, { error: 'The sales context was not readable.' })
        return
      }
      await saveSalesContext({
        companyId: body.companyId,
        company: body.company,
        handler: body.handler ?? null,
        sales: body.sales ?? null,
        prices: Array.isArray(body.prices) ? body.prices.slice(-30) : [],
        products: Array.isArray(body.products) ? body.products.slice(0, 20) : [],
        account: body.account,
      })
      json(res, 200, { ok: true })
    } catch {
      json(res, 400, { error: 'The sales context was not readable.' })
    }
    return
  }

  res.statusCode = 404
  res.end()
}
