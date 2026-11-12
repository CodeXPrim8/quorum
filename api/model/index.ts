import type { IncomingMessage, ServerResponse } from 'node:http'
import { chatComplete } from '../../server/model-chat.js'

export const maxDuration = 30

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end()
    return
  }
  try {
    const body = JSON.parse((await readBody(req)) || '{}') as { messages?: { role?: string; content?: string }[] }
    const messages = Array.isArray(body.messages)
      ? body.messages
          .filter((message) => message && (message.role === 'system' || message.role === 'user' || message.role === 'assistant') && (typeof message.content === 'string' || Array.isArray(message.content)))
          .map((message) => ({ role: message.role as 'system' | 'user' | 'assistant', content: message.content as string | unknown[] }))
      : []
    const text = await chatComplete(messages)
    if (!text) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'The chat model did not answer.' }))
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: text } }] }))
  } catch (error) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'The model could not be reached.' }))
  }
}
