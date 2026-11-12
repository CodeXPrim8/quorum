import type { IncomingMessage, ServerResponse } from 'node:http'
import { chatAttempts } from '../../server/model-chat.js'

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  const [first] = chatAttempts()
  const linked = Boolean(first)
  const deepseek = first?.url.includes('deepseek')
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(linked
    ? {
        linked: true,
        baseUrl: deepseek ? 'https://api.deepseek.com/v1' : first.url.includes('openai') ? 'https://api.openai.com/v1' : 'https://api.x.ai/v1',
        model: first.model,
      }
    : { linked: false }))
}
