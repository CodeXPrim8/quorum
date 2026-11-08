const STORAGE_KEY = 'quorum.model.v1'

export type ModelLink = {
  baseUrl: string
  model: string
  apiKey: string
}

export type ModelContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | ModelContentPart[]
}

/** Use the Grok key kept on this computer, without copying it into the browser. */
export async function loadServerModel(): Promise<ModelLink | null> {
  try {
    const response = await fetch('/api/model/link')
    const data = (await response.json()) as { linked?: boolean; baseUrl?: string; model?: string }
    if (!data.linked || !data.baseUrl || !data.model) return readModelLink()
    const link = { baseUrl: data.baseUrl, model: data.model, apiKey: 'server' }
    saveModelLink(link)
    return link
  } catch {
    return readModelLink()
  }
}

export function readModelLink(): ModelLink | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ModelLink>
    if (!parsed.baseUrl || !parsed.model || !parsed.apiKey) return null
    return { baseUrl: parsed.baseUrl, model: parsed.model, apiKey: parsed.apiKey }
  } catch {
    return null
  }
}

export function saveModelLink(link: ModelLink | null): void {
  if (!link) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(link))
}

export function splitDesign(reply: string, allowDesign: boolean): { text: string; designBrief?: string } {
  const match = reply.match(/(?:^|\n)\s*DESIGN:\s*(.+)\s*$/i)
  const designBrief = allowDesign && match ? match[1].trim().slice(0, 80) : undefined
  const text = reply.replace(/(?:^|\n)\s*DESIGN:\s*.+\s*$/i, '').trim()
  return { text: clip(text || reply.trim(), 600), designBrief }
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function clipContent(content: ModelMessage['content']): ModelMessage['content'] {
  if (typeof content === 'string') return content.slice(0, 4000)
  return content.map((part) =>
    part.type === 'text' ? { ...part, text: part.text.slice(0, 4000) } : part,
  )
}

export async function askModel(link: ModelLink, messages: ModelMessage[]): Promise<string> {
  const response = await fetch('/api/model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: link.baseUrl,
      model: link.model,
      apiKey: link.apiKey,
      messages: messages.map((message) => ({ role: message.role, content: clipContent(message.content) })),
    }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string }
    choices?: { message?: { content?: string } }[]
  }
  if (!response.ok) {
    const reason = typeof data.error === 'string' ? data.error : data.error?.message
    throw new Error(hideKey(reason || 'The model did not answer.', link.apiKey))
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('The model returned an empty reply.')
  return content.trim()
}

function hideKey(message: string, key: string): string {
  const hidden = key ? message.split(key).join('…') : message
  return hidden.slice(0, 180)
}
