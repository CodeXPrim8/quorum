import { useEffect, useRef } from 'react'
import type { AppState, Command, WaSale } from '../types'
import { polishWhatsApp } from './whatsapp-voice'

type Inbound = { id: string; phone: string; name: string; text: string }

type ThreadChat = {
  phone: string
  name: string
  sale?: WaSale
  messages: { id: string; at: string; author: 'client' | 'quorum'; text: string; status: 'received' | 'sent' | 'failed' | 'held'; error?: string }[]
  effect?: {
    customer?: { name: string; email?: string; address?: string; company?: string; item?: string }
    invoice?: { number: string; item: string; detail?: string; amount: string; customerName: string; email?: string; address?: string; company?: string }
    call?: boolean
  }
}

function salesContext(state: AppState) {
  const roleKey = (staffId: string) => state.roles.find((role) => role.id === state.staff.find((person) => person.id === staffId)?.roleId)?.key ?? ''
  const person = (keys: string[]) => {
    for (const key of keys) {
      const found = state.staff.find((item) => roleKey(item.id) === key)
      if (found) return { id: found.id, name: found.name, title: found.title }
    }
    const first = state.staff[0]
    return first ? { id: first.id, name: first.name, title: first.title } : null
  }
  const profile = state.company?.invoiceProfile
  return {
    companyId: state.company?.id,
    company: state.company?.name ?? 'the company',
    business: state.company?.businessType,
    goals: (state.company?.goals ?? []).map((goal) => goal.text).slice(0, 8),
    handler: person(['account_executive', 'sales_manager', 'quote_specialist']),
    sales: person(['quote_specialist', 'sales_manager', 'account_executive']),
    prices: (state.prices ?? []).slice(-30),
    products: (state.products ?? []).slice(0, 20).map((product) => ({ id: product.id, name: product.name, fact: product.fact.slice(0, 140) })),
    account: profile?.accountNumber
      ? { bankName: profile.bankName, accountName: profile.accountName, accountNumber: profile.accountNumber }
      : undefined,
  }
}

const POSTED_KEY = 'qsi.wa.posted'

function postedIds(): Set<string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(POSTED_KEY) || '[]') as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function markPosted(id: string) {
  const ids = postedIds()
  ids.add(id)
  sessionStorage.setItem(POSTED_KEY, JSON.stringify([...ids].slice(-500)))
}

/** Pull client messages from the company line and send Quorum's reply when the line is connected. */
export function WhatsAppDesk({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const stateRef = useRef(state)
  stateRef.current = state
  const sending = useRef(new Set<string>())

  const companyId = state.company?.id
  const companyName = state.company?.name ?? 'the company'

  useEffect(() => {
    let stop = false
    const pull = async () => {
      try {
        const statusQuery = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
        const [statusRes, inboxRes, threadRes] = await Promise.all([
          fetch(`/api/whatsapp/status${statusQuery}`),
          fetch('/api/whatsapp/inbox'),
          fetch('/api/whatsapp/thread'),
        ])
        if (!statusRes.ok || !inboxRes.ok || stop) return
        const status = (await statusRes.json()) as { linked?: boolean }
        const inbox = (await inboxRes.json()) as { messages?: Inbound[] }
        const thread = threadRes.ok ? ((await threadRes.json()) as { chats?: ThreadChat[] }) : { chats: [] }
        if (thread.chats && thread.chats.length > 0) {
          dispatchRef.current({ type: 'WHATSAPP_SYNC', chats: thread.chats })
        }
        void fetch('/api/whatsapp/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(salesContext(stateRef.current)),
        }).catch(() => undefined)
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
        .map((message) => ({ phone: chat.phone, message, staffId: chat.assigneeId })),
    )
    for (const item of pending) {
      if (sending.current.has(item.message.id) || postedIds().has(item.message.id)) {
        if (postedIds().has(item.message.id) && item.message.status === 'queued') {
          dispatchRef.current({
            type: 'WHATSAPP_DELIVERY',
            phone: item.phone,
            messageId: item.message.id,
            status: 'failed',
            error: 'This reply was already handed to WhatsApp and was not sent again.',
          })
        }
        continue
      }
      sending.current.add(item.message.id)
      markPosted(item.message.id)
      const staff = state.staff.find((person) => person.id === item.staffId)
      void (async () => {
        dispatchRef.current({ type: 'WHATSAPP_DELIVERY', phone: item.phone, messageId: item.message.id, status: 'sending' })
        const canned = /I will not send a price/i.test(item.message.text)
        const text = canned ? item.message.text : await polishWhatsApp(companyName, staff?.name ?? companyName, item.message.text)
        if (canned) {
          dispatchRef.current({
            type: 'WHATSAPP_DELIVERY',
            phone: item.phone,
            messageId: item.message.id,
            status: 'failed',
            error: 'This old reply was stopped so it is not sent again.',
          })
          return
        }
        try {
          const response = await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: item.phone,
              text,
              companyId,
              messageId: item.message.id,
              inReplyTo: item.message.id.startsWith('wa_') ? item.message.id.slice(3) : undefined,
              pdf: item.message.file?.dataUrl,
              filename: item.message.file?.name,
            }),
          })
          const body = (await response.json().catch(() => ({}))) as { error?: string; skipped?: boolean }
          const status = body.skipped || response.ok ? 'sent' : response.status === 503 ? 'held' : 'failed'
          dispatchRef.current({
            type: 'WHATSAPP_DELIVERY',
            phone: item.phone,
            messageId: item.message.id,
            status,
            error: response.ok ? undefined : body.error || 'WhatsApp did not accept the reply.',
          })
        } catch {
          dispatchRef.current({
            type: 'WHATSAPP_DELIVERY',
            phone: item.phone,
            messageId: item.message.id,
            status: 'failed',
            error: 'WhatsApp could not be reached.',
          })
        }
      })()
    }
  }, [state.whatsapp, state.staff, companyId, companyName])

  return null
}
