import type { IncomingMessage, ServerResponse } from 'node:http'
import { serveMeta } from '../../server/meta-routes'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return serveMeta(req, res, '/api/meta/disconnect')
}
