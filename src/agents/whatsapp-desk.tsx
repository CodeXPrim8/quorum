import { useEffect, useRef } from 'react'
import type { AppState, Command } from '../types'

type Inbound = { id: string; phone: string; name: string; text: string }

/** Pull client messages from the company line and send Quorum's reply when the line is connected. */
export function WhatsAppDesk({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const sending = useRef(new Set<string>())

  const companyId = state.company?.id

  useEffect(() => {
    let stop = false
    const pull = async () => {
      try {
        const statusQuery = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
        const [statusRes, inboxRes] = await Promise.all([
          fetch(`/api/whatsapp/status${statusQuery}`),
          fetch('/api/whatsapp/inbox'),
        ])
        if (!statusRes.ok || !inboxRes.ok || stop) return
        const status = (await statusRes.json()) as { linked?: boolean }
        const inbox = (await inboxRes.json()) as { messages?: Inbound[] }
        const items = inbox.messages ?? []
        if (items.length === 0) return
        for (const item of items) {
          dispatchRef.current({
            type: 'WHATSAPP_INBOUND',
            phone: item.phone,
            name: item.name,
            text: item.text,
            messageId: item.id,
            linked: status.linked === true,
          })
        }
        await fetch('/api/whatsapp/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: items.map((item) => item.id) }),
        })
      } catch {
        /* The dev server is the only listener. A missed poll retries. */
      }
    }
    void pull()
    const timer = window.setInterval(() => void pull(), 4000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [companyId])

  useEffect(() => {
    const pending = (state.whatsapp ?? []).flatMap((chat) =>
      chat.messages
        .filter((message) => message.author === 'quorum' && message.status === 'queued')
        .map((message) => ({ phone: chat.phone, message })),
    )
    for (const item of pending) {
      if (sending.current.has(item.message.id)) continue
      sending.current.add(item.message.id)
      void fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: item.phone, text: item.message.text, companyId }),
      })
        .then((response) => {
          const status = response.ok ? 'sent' : response.status === 503 ? 'held' : 'failed'
          dispatchRef.current({ type: 'WHATSAPP_DELIVERY', phone: item.phone, messageId: item.message.id, status })
        })
        .catch(() => {
          dispatchRef.current({ type: 'WHATSAPP_DELIVERY', phone: item.phone, messageId: item.message.id, status: 'failed' })
        })
    }
  }, [state.whatsapp, companyId])

  return null
}
