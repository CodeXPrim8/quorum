import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import {
  LIVE_MODEL,
  openaiKeyFromEnv,
  publicSessionPayload,
  sessionCreateBody,
  stripSecrets,
} from './server/openai-live'

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
    'OpenAI-Beta': 'realtime=v1',
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
      void fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: openaiHeaders(key),
        body: JSON.stringify(sessionCreateBody()),
      })
        .then(async (response) => {
          const raw = await response.text()
          if (!response.ok) {
            json(res, response.status, { error: 'OpenAI Live could not start a voice session.' })
            return
          }
          const payload = stripSecrets(publicSessionPayload(JSON.parse(raw) as unknown), key)
          json(res, 200, { ...payload, realtimeUrl: 'https://api.openai.com/v1/realtime', model: payload.model || LIVE_MODEL })
        })
        .catch((error: unknown) => {
          json(res, 502, { error: error instanceof Error ? error.message : 'OpenAI Live could not be reached.' })
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

    if (path !== '/api/model') {
      next()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    void readBody(req)
      .then(async (raw) => {
        const body = JSON.parse(raw) as { baseUrl?: string; model?: string; apiKey?: string; messages?: unknown }
        const base = String(body.baseUrl ?? '').trim().replace(/\/$/, '')
        if (!/^https?:\/\//i.test(base)) {
          json(res, 400, { error: 'The model address must start with http:// or https://.' })
          return
        }
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${body.apiKey ?? ''}`,
          },
          body: JSON.stringify({ model: body.model, messages: body.messages, temperature: 0.7 }),
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), modelProxy(env)],
    optimizeDeps: {
      exclude: ['@xenova/transformers'],
    },
    test: {
      environment: 'node',
    },
  }
})
