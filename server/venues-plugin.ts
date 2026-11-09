import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { lookupBook } from '../src/domain/venues'
import { connectVenue, disconnectVenue, listVenueStatus } from './venues'

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

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function venuesPlugin(): Plugin {
  const handle = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const path = url.pathname
    if (!path.startsWith('/api/venues')) {
      next()
      return
    }
    if (path === '/api/venues/status' && req.method === 'GET') {
      json(res, 200, { venues: listVenueStatus(String(url.searchParams.get('companyId') ?? '')) })
      return
    }
    if (path === '/api/venues/lookup' && req.method === 'GET') {
      const hit = lookupBook(String(url.searchParams.get('q') ?? ''))
      json(res, 200, { hit })
      return
    }
    if (path === '/api/venues/connect' && req.method === 'POST') {
      void readBody(req)
        .then((raw) => {
          const body = JSON.parse(raw || '{}') as {
            companyId?: string
            venueId?: string
            name?: string
            loginUrl?: string
          }
          const result = connectVenue(String(body.companyId ?? ''), String(body.venueId ?? ''), {
            name: body.name,
            loginUrl: body.loginUrl,
            market: 'sports',
          })
          json(res, 200, result)
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'Could not connect that platform.' })
        })
      return
    }
    if (path === '/api/venues/disconnect' && req.method === 'POST') {
      void readBody(req)
        .then((raw) => {
          const body = JSON.parse(raw || '{}') as { companyId?: string; venueId?: string }
          disconnectVenue(String(body.companyId ?? ''), String(body.venueId ?? ''))
          json(res, 200, { ok: true, venues: listVenueStatus(String(body.companyId ?? '')) })
        })
        .catch((error: unknown) => {
          json(res, 400, { error: error instanceof Error ? error.message : 'Could not disconnect.' })
        })
      return
    }
    res.statusCode = 404
    res.end()
  }
  return {
    name: 'quorum-venues',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}
