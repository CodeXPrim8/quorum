import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { designImageBody, imageDataUrl, parseDesignImageInput } from './server/design-image'
import {
  LIVE_CALLS_URL,
  LIVE_MODEL,
  LIVE_MODEL_FALLBACK,
  LIVE_SECRETS_URL,
  openaiKeyFromEnv,
  publicSessionPayload,
  sessionCreateBody,
  stripSecrets,
} from './server/openai-live'
import { summarizeWebsite } from './server/company-site'
import { researchQuery } from './server/research'
import {
  applyDesktopInput,
  captureScreenshot,
  desktopAgentReady,
  DesktopAuthError,
  DesktopBusyError,
  endDesktopSession,
  hideUsingOverlay,
  parseDesktopInput,
  showUsingOverlay,
  startDesktopSession,
} from './server/desktop-agent'
import { actOnComputer, chooseComputerWindow, clickForInstruction, listComputerWindows, observeComputer, writeCompose } from './server/computer-use'
import { parseComputerAction } from './src/computer/policy'
import {
  ackInbound,
  enqueueInbound,
  inboxFile,
  lineReady,
  listInbound,
  parseWebhook,
  sendWhatsAppText,
  signatureOk,
  verifyChallenge,
  whatsAppEnv,
} from './server/whatsapp'
import { canHostMedia, instagramReady, publishInstagramFeed, readPublishImage } from './server/instagram'
import { agentPlugin } from './server/agent-plugin'
import { venuesPlugin } from './server/venues-plugin'
import { clearCompanyChannel } from './server/meta-store'
import {
  companyInstagramLine,
  companyMetaPublic,
  companyWhatsAppLine,
  finishInstagramOAuth,
  instagramAuthUrl,
  metaAppEnv,
  metaAppReady,
  readOAuthState,
  saveCompanyWhatsApp,
} from './server/meta-oauth'

function readBody(req: IncomingMessage, max = 80_000): Promise<string> {
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

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function openaiHeaders(key: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

/** Browser calls stay on this computer. OpenAI keys stay in the server env. DeepSeek keys still come from the linked chat model. */
function modelProxy(env: Record<string, string>): Plugin {
  const openaiKey = () => openaiKeyFromEnv({ ...process.env, ...env })

  const handle = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const path = (req.url ?? '').split('?')[0]

    if (path === '/api/realtime/status') {
      json(res, 200, { ready: Boolean(openaiKey()) })
      return
    }

    if (path === '/api/realtime/session') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      const key = openaiKey()
      if (!key) {
        json(res, 503, { error: 'Put OPENAI_API_KEY in the server environment. It is voice only.' })
        return
      }
      void (async () => {
        const mint = (model: string) =>
          fetch(LIVE_SECRETS_URL, {
            method: 'POST',
            headers: openaiHeaders(key),
            body: JSON.stringify(sessionCreateBody(model)),
          })
        let response = await mint(LIVE_MODEL)
        let raw = await response.text()
        if (!response.ok && LIVE_MODEL !== LIVE_MODEL_FALLBACK) {
          const retry = await mint(LIVE_MODEL_FALLBACK)
          if (retry.ok) {
            response = retry
            raw = await retry.text()
          }
        }
        if (!response.ok) {
          json(res, response.status, { error: 'OpenAI Live could not start a voice session.' })
          return
        }
        const payload = stripSecrets(publicSessionPayload(JSON.parse(raw) as unknown), key)
        json(res, 200, { ...payload, realtimeUrl: LIVE_CALLS_URL, model: payload.model || LIVE_MODEL })
      })().catch((error: unknown) => {
        json(res, 502, { error: error instanceof Error ? error.message : 'OpenAI Live could not be reached.' })
      })
      return
    }

    if (path === '/api/design/status') {
      json(res, 200, { ready: Boolean(openaiKey()) })
      return
    }

    if (path === '/api/design') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      const key = openaiKey()
      if (!key) {
        json(res, 503, { error: 'Put OPENAI_API_KEY in the server environment for Maya’s photograph layer.' })
        return
      }
      void readBody(req, 20_000)
        .then(async (raw) => {
          const input = parseDesignImageInput(JSON.parse(raw) as unknown)
          const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(designImageBody(input)),
          })
          const payload = (await response.json()) as { data?: { b64_json?: string }[] }
          const b64 = payload.data?.[0]?.b64_json
          if (!response.ok || !b64) {
            json(res, response.ok ? 502 : response.status, { error: 'The photograph could not be made.' })
            return
          }
          json(res, 200, stripSecrets({ image: imageDataUrl(b64) }, key))
        })
        .catch((error: unknown) => {
          json(res, 502, { error: error instanceof Error ? error.message : 'The photograph could not be made.' })
        })
      return
    }

    if (path === '/api/speech') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      const key = openaiKey()
      if (!key) {
        json(res, 503, { error: 'Put OPENAI_API_KEY in the server environment. It is voice only.' })
        return
      }
      void readBody(req)
        .then(async (raw) => {
          const body = JSON.parse(raw) as { voice?: string; input?: string }
          const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: openaiHeaders(key),
            body: JSON.stringify({
              model: 'tts-1-hd',
              voice: body.voice || 'coral',
              input: String(body.input ?? '').slice(0, 4000),
              response_format: 'mp3',
            }),
          })
          const buf = Buffer.from(await response.arrayBuffer())
          res.statusCode = response.status
          res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg')
          res.end(buf)
        })
        .catch((error: unknown) => {
          json(res, 502, { error: error instanceof Error ? error.message : 'The voice could not be reached.' })
        })
      return
    }

    if (path === '/api/desktop/status') {
      json(res, 200, { ready: desktopAgentReady(), sessionRequired: true })
      return
    }

    if (path === '/api/desktop/session') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 4_000)
        .then((raw) => {
          const body = JSON.parse(raw || '{}') as { action?: string }
          if (body.action === 'end') {
            endDesktopSession()
            json(res, 200, { ok: true, active: false })
            return
          }
          if (body.action !== 'start') {
            json(res, 400, { error: 'action must be start or end.' })
            return
          }
          if (!desktopAgentReady()) {
            json(res, 503, { error: 'Desktop control needs Windows and PowerShell on this computer.' })
            return
          }
          const started = startDesktopSession()
          json(res, 200, { ok: true, active: true, token: started.token })
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'Desktop session failed.' })
        })
      return
    }

    if (path === '/api/desktop/using') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 4_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { action?: string; sessionToken?: string }
          if (body.action === 'end') {
            hideUsingOverlay()
            json(res, 200, { ok: true })
            return
          }
          if (body.action !== 'start') {
            json(res, 400, { error: 'action must be start or end.' })
            return
          }
          await showUsingOverlay(body.sessionToken)
          json(res, 200, { ok: true })
        })
        .catch((error: unknown) => {
          const status =
            error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 502
          json(res, status, { error: error instanceof Error ? error.message : 'Using overlay failed.' })
        })
      return
    }

    if (path === '/api/desktop/screenshot') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 8_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { sessionToken?: string }
          const shot = await captureScreenshot(body.sessionToken)
          json(res, 200, shot)
        })
        .catch((error: unknown) => {
          const status =
            error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 502
          json(res, status, { error: error instanceof Error ? error.message : 'Screenshot failed.' })
        })
      return
    }

    if (path === '/api/computer/windows') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 4_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { sessionToken?: string }
          json(res, 200, { windows: await listComputerWindows(body.sessionToken) })
        })
        .catch((error: unknown) => {
          const status = error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 502
          json(res, status, { error: error instanceof Error ? error.message : 'Windows could not be listed.' })
        })
      return
    }

    if (path === '/api/computer/target') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 4_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { sessionToken?: string; hwnd?: string }
          const window = await chooseComputerWindow(body.sessionToken, String(body.hwnd ?? ''))
          json(res, 200, { window })
        })
        .catch((error: unknown) => {
          const status = error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 400
          json(res, status, { error: error instanceof Error ? error.message : 'That window could not be selected.' })
        })
      return
    }

    if (path === '/api/computer/observe') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 4_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { sessionToken?: string }
          json(res, 200, await observeComputer(body.sessionToken))
        })
        .catch((error: unknown) => {
          const status = error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 502
          json(res, status, { error: error instanceof Error ? error.message : 'The window could not be read.' })
        })
      return
    }

    if (path === '/api/computer/click') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 8_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { sessionToken?: string; instruction?: string; label?: string; dryRun?: boolean }
          json(res, 200, await clickForInstruction(body.sessionToken, String(body.instruction ?? ''), {
            label: String(body.label ?? ''),
            dryRun: body.dryRun === true,
          }))
        })
        .catch((error: unknown) => {
          const status = error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 400
          json(res, status, { error: error instanceof Error ? error.message : 'That click failed.' })
        })
      return
    }

    if (path === '/api/computer/compose') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 16_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { sessionToken?: string; to?: string; subject?: string; body?: string }
          json(res, 200, await writeCompose(body.sessionToken, {
            to: String(body.to ?? ''),
            subject: String(body.subject ?? ''),
            body: String(body.body ?? ''),
          }))
        })
        .catch((error: unknown) => {
          const status = error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 400
          json(res, status, { error: error instanceof Error ? error.message : 'The draft could not be typed.' })
        })
      return
    }

    if (path === '/api/computer/act') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 8_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as {
            sessionToken?: string
            approved?: boolean
            approvedStake?: boolean
            action?: unknown
          }
          const action = parseComputerAction(JSON.stringify(body.action ?? {}))
          if (!action) {
            json(res, 400, { error: 'That computer action is not in the allowed set.' })
            return
          }
          json(res, 200, await actOnComputer(body.sessionToken, action, Boolean(body.approved), Boolean(body.approvedStake)))
        })
        .catch((error: unknown) => {
          const status = error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 400
          json(res, status, { error: error instanceof Error ? error.message : 'The computer action failed.' })
        })
      return
    }

    if (path === '/api/computer/stop') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      endDesktopSession()
      json(res, 200, { ok: true, active: false })
      return
    }

    if (path === '/api/desktop/input') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 20_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { sessionToken?: string } & Record<string, unknown>
          const input = parseDesktopInput(body)
          await applyDesktopInput(body.sessionToken, input)
          json(res, 200, { ok: true })
        })
        .catch((error: unknown) => {
          const status =
            error instanceof DesktopAuthError || error instanceof DesktopBusyError ? error.status : 502
          json(res, status, { error: error instanceof Error ? error.message : 'Desktop input failed.' })
        })
      return
    }

    if (path === '/api/research') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 4_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { query?: string }
          const result = await researchQuery(String(body.query ?? ''))
          json(res, 200, result)
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'The lookup could not run.' })
        })
      return
    }

    if (path === '/api/company-site') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end()
        return
      }
      void readBody(req, 4_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { url?: string }
          const page = await summarizeWebsite(String(body.url ?? ''))
          json(res, 200, page)
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'The website could not be read.' })
        })
      return
    }

    const xaiKey = String(env.XAI_API_KEY ?? process.env.XAI_API_KEY ?? '').trim()
    const xaiModel = String(env.XAI_MODEL ?? process.env.XAI_MODEL ?? 'grok-4').trim() || 'grok-4'
    const deepseekKey = String(env.DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? '').trim()
    const deepseekModel = String(env.DEEPSEEK_MODEL ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat').trim() || 'deepseek-chat'
    if (path === '/api/model/link' && req.method === 'GET') {
      json(res, 200, deepseekKey
        ? { linked: true, baseUrl: 'https://api.deepseek.com/v1', model: deepseekModel }
        : { linked: Boolean(xaiKey), baseUrl: 'https://api.x.ai/v1', model: xaiModel })
      return
    }
    if (path !== '/api/model') {
      next()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    void readBody(req, 2_500_000)
      .then(async (raw) => {
        const body = JSON.parse(raw) as { baseUrl?: string; model?: string; apiKey?: string; messages?: unknown }
        const base = String(body.baseUrl ?? '').trim().replace(/\/$/, '')
        if (!/^https?:\/\//i.test(base)) {
          json(res, 400, { error: 'The model address must start with http:// or https://.' })
          return
        }
        const deepseekHost = base === 'https://api.deepseek.com' || base === 'https://api.deepseek.com/v1'
        const useDeepseek = deepseekHost && (!body.apiKey || body.apiKey === 'server') && Boolean(deepseekKey)
        const useServerKey = base === 'https://api.x.ai/v1' && (!body.apiKey || body.apiKey === 'server') && Boolean(xaiKey)
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${useDeepseek ? deepseekKey : useServerKey ? xaiKey : (body.apiKey ?? '')}`,
          },
          body: JSON.stringify({
            model: body.model && body.model !== 'server'
              ? body.model
              : useDeepseek
                ? deepseekModel
                : useServerKey
                  ? xaiModel
                  : body.model,
            messages: body.messages,
            temperature: 0.7,
          }),
        })
        const text = await response.text()
        res.statusCode = response.status
        res.setHeader('Content-Type', 'application/json')
        res.end(text)
      })
      .catch((error: unknown) => {
        json(res, 502, { error: error instanceof Error ? error.message : 'The model could not be reached.' })
      })
  }
  return {
    name: 'quorum-model-proxy',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

function whatsAppProxy(env: Record<string, string>): Plugin {
  const app = metaAppEnv(env)
  const fallback = whatsAppEnv(env)
  const file = inboxFile()
  const handle = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/api/whatsapp')) {
      next()
      return
    }
    if (path === '/api/whatsapp/status' && req.method === 'GET') {
      const companyId = String(url.searchParams.get('companyId') ?? '')
      const line = companyWhatsAppLine(app, companyId || undefined)
      json(res, 200, {
        linked: lineReady(line),
        ...companyMetaPublic(app, companyId || undefined).whatsapp,
      })
      return
    }
    if (path === '/api/whatsapp/webhook' && req.method === 'GET') {
      const challenge = verifyChallenge(url.searchParams, fallback.verifyToken)
      if (!challenge) {
        res.statusCode = 403
        res.end()
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.end(challenge)
      return
    }
    if (path === '/api/whatsapp/webhook' && req.method === 'POST') {
      void readBody(req, 1_000_000)
        .then((raw) => {
          if (!signatureOk(raw, req.headers['x-hub-signature-256'] as string | undefined, fallback.appSecret || app.appSecret)) {
            res.statusCode = 403
            res.end()
            return
          }
          const payload = raw ? (JSON.parse(raw) as unknown) : {}
          enqueueInbound(file, parseWebhook(payload))
          json(res, 200, { ok: true })
        })
        .catch(() => {
          json(res, 200, { ok: true })
        })
      return
    }
    if (path === '/api/whatsapp/inbox' && req.method === 'GET') {
      json(res, 200, { messages: listInbound(file) })
      return
    }
    if (path === '/api/whatsapp/ack' && req.method === 'POST') {
      void readBody(req, 100_000)
        .then((raw) => {
          const body = JSON.parse(raw || '{}') as { ids?: string[] }
          ackInbound(file, Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [])
          json(res, 200, { ok: true })
        })
        .catch(() => json(res, 400, { error: 'The inbox acknowledgement was not readable.' }))
      return
    }
    if (path === '/api/whatsapp/send' && req.method === 'POST') {
      void readBody(req, 20_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { to?: string; text?: string; companyId?: string }
          const line = companyWhatsAppLine(app, body.companyId)
          const result = await sendWhatsAppText(line, String(body.to ?? ''), String(body.text ?? ''))
          json(res, result.ok ? 200 : result.status, result.ok ? { ok: true } : { error: result.error })
        })
        .catch((error: unknown) => {
          json(res, 502, { error: error instanceof Error ? error.message : 'WhatsApp could not be reached.' })
        })
      return
    }
    res.statusCode = 404
    res.end()
  }
  return {
    name: 'quorum-whatsapp',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

function instagramProxy(env: Record<string, string>): Plugin {
  const app = metaAppEnv(env)
  const handle = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/api/instagram')) {
      next()
      return
    }
    if (path === '/api/instagram/status' && req.method === 'GET') {
      const companyId = String(url.searchParams.get('companyId') ?? '')
      const line = companyInstagramLine(app, companyId || undefined)
      const publicStatus = companyMetaPublic(app, companyId || undefined)
      json(res, 200, {
        linked: instagramReady(line),
        canHost: canHostMedia(line) || publicStatus.canHost,
        ...publicStatus.instagram,
      })
      return
    }
    const media = path.match(/^\/api\/instagram\/media\/([a-f0-9]{24}\.(?:jpg|png))$/)
    if (media && req.method === 'GET') {
      const file = readPublishImage(media[1])
      if (!file) {
        res.statusCode = 404
        res.end()
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', file.mime)
      res.setHeader('Cache-Control', 'no-store')
      res.end(file.bytes)
      return
    }
    if (path === '/api/instagram/publish' && req.method === 'POST') {
      void readBody(req, 9_000_000)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { caption?: string; image?: string; companyId?: string }
          const line = companyInstagramLine(app, body.companyId)
          const result = await publishInstagramFeed(line, {
            caption: String(body.caption ?? ''),
            image: String(body.image ?? ''),
          })
          json(res, result.ok ? 200 : result.status, result.ok ? { ok: true, mediaId: result.mediaId } : { error: result.error })
        })
        .catch((error: unknown) => {
          json(res, 502, { error: error instanceof Error ? error.message : 'Instagram could not be reached.' })
        })
      return
    }
    res.statusCode = 404
    res.end()
  }
  return {
    name: 'quorum-instagram',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

function metaProxy(env: Record<string, string>): Plugin {
  const app = metaAppEnv(env)
  const handle = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/api/meta')) {
      next()
      return
    }
    if (path === '/api/meta/status' && req.method === 'GET') {
      const companyId = String(url.searchParams.get('companyId') ?? '')
      json(res, 200, companyMetaPublic(app, companyId || undefined))
      return
    }
    if (path === '/api/meta/instagram/connect' && req.method === 'GET') {
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
      res.statusCode = 302
      res.setHeader('Location', target)
      res.end()
      return
    }
    if (path === '/api/meta/callback' && req.method === 'GET') {
      const err = url.searchParams.get('error_description') || url.searchParams.get('error')
      if (err) {
        res.statusCode = 302
        res.setHeader('Location', `/#/integrations?meta=error&message=${encodeURIComponent(err)}`)
        res.end()
        return
      }
      const code = String(url.searchParams.get('code') ?? '')
      const state = String(url.searchParams.get('state') ?? '')
      const parsed = readOAuthState(app, state)
      if (!code || !parsed) {
        res.statusCode = 302
        res.setHeader('Location', '/#/integrations?meta=error&message=Invalid%20Meta%20callback')
        res.end()
        return
      }
      void finishInstagramOAuth(app, parsed.companyId, code)
        .then((result) => {
          const q = new URLSearchParams({
            meta: 'instagram',
            username: result.username || '',
            accountId: result.accountId,
          })
          res.statusCode = 302
          res.setHeader('Location', `/#/integrations?${q.toString()}`)
          res.end()
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Instagram connect failed.'
          res.statusCode = 302
          res.setHeader('Location', `/#/integrations?meta=error&message=${encodeURIComponent(message)}`)
          res.end()
        })
      return
    }
    if (path === '/api/meta/whatsapp/connect' && req.method === 'POST') {
      void readBody(req, 20_000)
        .then((raw) => {
          const body = JSON.parse(raw || '{}') as {
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
          const saved = saveCompanyWhatsApp(app, companyId, {
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
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'WhatsApp could not be saved.' })
        })
      return
    }
    if (path === '/api/meta/disconnect' && req.method === 'POST') {
      void readBody(req, 10_000)
        .then((raw) => {
          const body = JSON.parse(raw || '{}') as { companyId?: string; channel?: string }
          const companyId = String(body.companyId ?? '').trim()
          const channel = body.channel === 'whatsapp' ? 'whatsapp' : body.channel === 'instagram' ? 'instagram' : null
          if (!companyId || !channel) {
            json(res, 400, { error: 'companyId and channel are required.' })
            return
          }
          if (!app.encryptKey) {
            json(res, 503, { error: 'Set META_ENCRYPT_KEY before disconnecting.' })
            return
          }
          clearCompanyChannel(app.encryptKey, companyId, channel)
          json(res, 200, { ok: true, ...companyMetaPublic(app, companyId) })
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'Disconnect failed.' })
        })
      return
    }
    res.statusCode = 404
    res.end()
  }
  return {
    name: 'quorum-meta',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), modelProxy(env), whatsAppProxy(env), instagramProxy(env), metaProxy(env), agentPlugin(), venuesPlugin()],
    optimizeDeps: {
      exclude: ['@xenova/transformers'],
    },
    test: {
      environment: 'node',
    },
  }
})
