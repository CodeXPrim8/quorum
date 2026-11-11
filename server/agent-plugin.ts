import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { WebSocketServer, type WebSocket } from 'ws'
import { AgentHub } from './agent-hub'
import { quorumDesktopCommand } from './agent-download'

function readBody(req: IncomingMessage, max = 2_000_000): Promise<string> {
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

export function agentPlugin(): Plugin {
  const hub = new AgentHub()
  const wss = new WebSocketServer({ noServer: true })
  const sockets = new Map<WebSocket, string>()

  const handle = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/api/agent')) {
      next()
      return
    }
    if (path === '/api/agent/pair' && req.method === 'POST') {
      json(res, 200, hub.pair())
      return
    }
    if (path === '/api/agent/download' && req.method === 'GET') {
      const paired = hub.pair()
      const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '127.0.0.1:5173')
      const proto = String(req.headers['x-forwarded-proto'] ?? 'http') === 'https' ? 'wss' : 'ws'
      const file = quorumDesktopCommand(paired.code, `${proto}://${host}/agent`)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', 'attachment; filename="QSIDesktop.cmd"')
      res.end(file)
      return
    }
    if (path === '/api/agent/devices' && req.method === 'GET') {
      json(res, 200, { devices: hub.list() })
      return
    }
    if (path === '/api/agent/command' && req.method === 'POST') {
      void readBody(req)
        .then(async (raw) => {
          const body = JSON.parse(raw || '{}') as { deviceId?: string; op?: string; body?: unknown }
          const deviceId = String(body.deviceId ?? '')
          const op = String(body.op ?? '')
          if (!deviceId || !op) {
            json(res, 400, { error: 'deviceId and op are required.' })
            return
          }
          const data = await hub.command(deviceId, op, body.body ?? {})
          json(res, 200, data ?? { ok: true })
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'Quorum Desktop could not run that step.' })
        })
      return
    }
    res.statusCode = 404
    res.end()
  }

  const attach = (http: { on: (event: string, listener: (...args: unknown[]) => void) => void } & { _quorumAgent?: boolean }) => {
    if (http._quorumAgent) return
    http._quorumAgent = true
    http.on('upgrade', (req: IncomingMessage, socket: unknown, head: Buffer) => {
      const path = (req.url ?? '').split('?')[0]
      if (path !== '/agent') return
      wss.handleUpgrade(req, socket as never, head, (ws) => {
        ws.on('message', (raw) => {
          let message: { type?: string; code?: string; deviceId?: string; name?: string; requestId?: string; ok?: boolean; data?: unknown; error?: string }
          try {
            message = JSON.parse(String(raw)) as typeof message
          } catch {
            return
          }
          if (message.type === 'hello') {
            try {
              const { deviceId } = hub.hello({
                code: String(message.code ?? ''),
                deviceId: String(message.deviceId ?? ''),
                name: String(message.name ?? 'Windows PC'),
                send: (text) => ws.send(text),
              })
              sockets.set(ws, deviceId)
              ws.send(JSON.stringify({ type: 'welcome', deviceId }))
            } catch (error: unknown) {
              ws.send(JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Pairing failed.' }))
              ws.close()
            }
            return
          }
          const deviceId = sockets.get(ws)
          if (!deviceId || message.type !== 'result' || !message.requestId) return
          hub.result(deviceId, message.requestId, message.ok === true, message.data, message.error)
        })
        ws.on('close', () => {
          const deviceId = sockets.get(ws)
          if (deviceId) hub.close(deviceId)
          sockets.delete(ws)
        })
      })
    })
  }

  return {
    name: 'quorum-desktop-agent',
    configureServer(server) {
      server.middlewares.use(handle)
      if (server.httpServer) attach(server.httpServer as never)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
      if (server.httpServer) attach(server.httpServer as never)
    },
  }
}
