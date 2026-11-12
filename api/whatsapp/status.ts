import type { IncomingMessage, ServerResponse } from 'node:http'
import { modelRoute, serveModel } from '../../server/model-route.js'
import { serveWhatsApp } from '../../server/whatsapp-routes.js'

export const maxDuration = 30

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const model = modelRoute(req)
  if (model) return serveModel(req, res, model)
  return serveWhatsApp(req, res, '/api/whatsapp/status')
}
