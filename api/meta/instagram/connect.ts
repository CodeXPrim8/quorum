import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveMeta } from '../../../server/meta-routes.js'

export const maxDuration = 30

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return serveMeta(req, res, '/api/meta/instagram/connect')
}
