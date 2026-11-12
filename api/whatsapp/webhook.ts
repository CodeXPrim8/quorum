import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveWhatsApp } from '../../server/whatsapp-routes.js'

export const maxDuration = 30

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return serveWhatsApp(req, res, '/api/whatsapp/webhook')
}
