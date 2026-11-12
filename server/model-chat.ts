type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | unknown[] }

type Attempt = { url: string; key: string; model: string }

/** The chat models available on this server. DeepSeek is the sales and staff brain. */
export function chatAttempts(env: Record<string, string | undefined> = process.env): Attempt[] {
  const deepseek = String(env.DEEPSEEK_API_KEY ?? '').trim()
  const deepseekModel = String(env.DEEPSEEK_MODEL ?? 'deepseek-chat').trim() || 'deepseek-chat'
  const openai = String(env.OPENAI_API_KEY ?? '').trim()
  const xai = String(env.XAI_API_KEY ?? '').trim()
  const xaiModel = String(env.XAI_MODEL ?? 'grok-4').trim() || 'grok-4'
  const attempts: Attempt[] = []
  if (deepseek) attempts.push({ url: 'https://api.deepseek.com/v1/chat/completions', key: deepseek, model: deepseekModel })
  if (openai) attempts.push({ url: 'https://api.openai.com/v1/chat/completions', key: openai, model: 'gpt-4o' })
  if (xai) attempts.push({ url: 'https://api.x.ai/v1/chat/completions', key: xai, model: xaiModel })
  return attempts
}

export async function chatComplete(messages: ChatMessage[], temperature = 0.7): Promise<string> {
  for (const attempt of chatAttempts()) {
    try {
      const response = await fetch(attempt.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${attempt.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: attempt.model, temperature, messages }),
      })
      if (!response.ok) continue
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
      const text = String(data.choices?.[0]?.message?.content ?? '').replace(/\s+/g, ' ').trim()
      if (text) return text
    } catch {
      /* Try the next model. */
    }
  }
  return ''
}
