import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveMeta } from '../../../server/meta-routes'

export const maxDuration = 30

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return serveMeta(req, res, '/api/meta/instagram/connect')
}
