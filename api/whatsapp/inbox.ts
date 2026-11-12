import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveWhatsApp } from '../../server/whatsapp-routes.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return serveWhatsApp(req, res, '/api/whatsapp/inbox')
}
