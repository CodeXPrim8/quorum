import type { IncomingMessage, ServerResponse } from 'node:http'
import { chatAttempts, chatComplete } from './model-chat.js'

function readBody(req: IncomingMessage, max = 2_500_000): Promise<string> {
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

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Staff chat on the public site. Kept on an existing route so the live site stays within its function limit. */
export function modelRoute(req: IncomingMessage): 'link' | 'chat' | null {
  const header = [req.headers['x-forwarded-uri'], req.headers['x-vercel-original-url'], req.headers['x-invoke-path'], req.headers['x-matched-path']]
    .flat()
    .filter(Boolean)
    .join(' ')
  const raw = `${req.url || ''} ${header}`
  if (raw.includes('/api/model/link') || raw.includes('link=1')) return 'link'
  if (raw.includes('/api/model') || raw.includes('route=model')) return 'chat'
  return null
}

export async function serveModel(req: IncomingMessage, res: ServerResponse, kind: 'link' | 'chat') {
  if (kind === 'link') {
    const [first] = chatAttempts()
    const deepseek = first?.url.includes('deepseek')
    send(res, 200, first
      ? {
          linked: true,
          baseUrl: deepseek ? 'https://api.deepseek.com/v1' : first.url.includes('openai') ? 'https://api.openai.com/v1' : 'https://api.x.ai/v1',
          model: first.model,
        }
      : { linked: false })
    return
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end()
    return
  }
  try {
    const body = JSON.parse((await readBody(req)) || '{}') as { messages?: { role?: string; content?: string | unknown[] }[] }
    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter((message) => message && (message.role === 'system' || message.role === 'user' || message.role === 'assistant') && (typeof message.content === 'string' || Array.isArray(message.content)))
          .map((message) => ({ role: message.role as 'system' | 'user' | 'assistant', content: message.content as string | unknown[] }))
      : []
    const text = await chatComplete(messages)
    if (!text) {
      send(res, 502, { error: 'The chat model did not answer.' })
      return
    }
    send(res, 200, { choices: [{ message: { content: text } }] })
  } catch (error) {
    send(res, 502, { error: error instanceof Error ? error.message : 'The model could not be reached.' })
  }
}
