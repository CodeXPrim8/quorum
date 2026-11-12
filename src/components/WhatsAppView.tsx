import { useEffect, useRef, useState } from 'react'
import type { AppState, Command } from '../types'
import { requestLines } from '../domain/price-lines'
import { formatWhen } from '../lib/format'

type PriceRow = { item: string; amount: string; floor: string }

export function WhatsAppView({
  state,
  selectedId,
  dispatch,
}: {
  state: AppState
  selectedId?: string
  dispatch: (command: Command) => void
}) {
  const chats = [...(state.whatsapp ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const selected = chats.find((chat) => chat.id === selectedId) ?? chats[0] ?? null
  const [linked, setLinked] = useState<boolean | null>(null)
  const [rows, setRows] = useState<PriceRow[]>([{ item: '', amount: '', floor: '' }])
  const chatRef = useRef('')
  const assignee = selected?.assigneeId ? state.staff.find((person) => person.id === selected.assigneeId) : null
  const open = Boolean(selectedId && selected)

  const companyId = state.company?.id
  const foundKey = requestLines(selected?.messages ?? []).join('|')

  useEffect(() => {
    let stop = false
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
    void fetch(`/api/whatsapp/status${query}`)
      .then((response) => response.json())
      .then((data: { linked?: boolean }) => {
        if (!stop) setLinked(data.linked === true)
      })
      .catch(() => {
        if (!stop) setLinked(false)
      })
    return () => {
      stop = true
    }
  }, [chats.length, companyId])

  useEffect(() => {
    if (!selected) return
    const found = foundKey ? foundKey.split('|') : []
    const prices = state.prices ?? []
    const switched = chatRef.current !== selected.id
    chatRef.current = selected.id
    setRows((current) => {
      const base = switched ? [] : current
      const items = found.length ? found : ['']
      const next = items.map((item) => {
        const kept = base.find((row) => row.item.toLowerCase() === item.toLowerCase())
        if (kept) return kept
        const saved = [...prices].reverse().find((price) => price.item.toLowerCase() === item.toLowerCase())
        return {
          item,
          amount: saved ? saved.amount.replace(/[^\d.]/g, '') : '',
          floor: saved?.floor ? saved.floor.replace(/[^\d.]/g, '') : '',
        }
      })
      const extras = base.filter((row) => !items.some((item) => item.toLowerCase() === row.item.toLowerCase()))
      const merged = [...next, ...extras]
      if (
        merged.length === current.length &&
        merged.every((row, index) => row.item === current[index]?.item && row.amount === current[index]?.amount && row.floor === current[index]?.floor)
      ) {
        return current
      }
      return merged
    })
  }, [selected, foundKey, state.prices])

  function updateRow(index: number, patch: Partial<PriceRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className={open ? 'wa is-open' : 'wa'}>
      <aside className="wa-list">
        <header className="wa-list-head">
          <h1>WhatsApp</h1>
        </header>
        <p className="wa-notice">
          {linked
            ? 'The company line is connected. Staff reply as they would to a real customer. A price is sent only after you confirm it, and that price is checked again after two days.'
            : 'Connect this company’s WhatsApp under Integrations, or set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env as a single-tenant fallback. Webhook verify uses WHATSAPP_VERIFY_TOKEN at /api/whatsapp/webhook.'}
        </p>
        <div className="wa-chats">
          {chats.length === 0 && <p className="wa-empty">No client has written yet.</p>}
          {chats.map((chat) => (
            <a key={chat.id} className="wa-row" href={`#/whatsapp/${chat.id}`} aria-current={chat.id === selected?.id ? 'true' : undefined}>
              <span className="wa-avatar company" aria-hidden="true">
                {chat.name.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{chat.name}</strong>
                <small>{chat.messages.at(-1)?.text}</small>
              </span>
              <time dateTime={chat.updatedAt}>{formatWhen(chat.updatedAt)}</time>
            </a>
          ))}
        </div>
        {(state.customers ?? []).length > 0 && (
          <div className="wa-panel">
            <strong>Customers</strong>
            <ul className="plain">
              {(state.customers ?? []).slice(0, 8).map((customer) => {
                const invoice = (state.invoices ?? []).find((item) => item.phone === customer.phone)
                return (
                  <li key={customer.id}>
                    <span>
                      {customer.name}
                      {customer.company ? ` · ${customer.company}` : ''}
                    </span>
                    <small>
                      {customer.phone}
                      {customer.email ? ` · ${customer.email}` : ''}
                      {invoice ? ` · ${invoice.number} ${invoice.amount}` : ''}
                    </small>
                    <span className="button-row">
                      <button type="button" className="btn" onClick={() => dispatch({ type: 'FOLLOW_UP', customerId: customer.id, channel: 'whatsapp' })}>
                        WhatsApp
                      </button>
                      <button type="button" className="btn" onClick={() => dispatch({ type: 'FOLLOW_UP', customerId: customer.id, channel: 'email' })}>
                        Email
                      </button>
                      <button type="button" className="btn" onClick={() => dispatch({ type: 'FOLLOW_UP', customerId: customer.id, channel: 'call' })}>
                        Call
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </aside>
      <section className="wa-pane" aria-label={selected?.name ?? 'Client chat'}>
        {selected ? (
          <>
            <header className="wa-pane-head">
              <a className="wa-back" href="#/whatsapp">
                Chats
              </a>
              <span className="wa-avatar company" aria-hidden="true">
                {selected.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="wa-pane-title">
                <strong>{selected.name}</strong>
                <p>
                  {selected.phone}
                  {assignee ? ` · ${assignee.name}, ${assignee.title}` : ''}
                </p>
              </div>
              {selected.taskId && (
                <a className="wa-icon" href={`#/tasks/${selected.taskId}`}>
                  Task
                </a>
              )}
              <button type="button" className="wa-icon" onClick={() => dispatch({ type: 'WHATSAPP_DROP', phone: selected.phone })}>
                Remove
              </button>
            </header>
            <form
              className="wa-panel"
              onSubmit={(event) => {
                event.preventDefault()
                const lines = rows
                  .map((row) => ({ item: row.item.trim(), amount: row.amount.trim(), floor: row.floor.trim() || undefined }))
                  .filter((row) => row.item && row.amount)
                if (lines.length === 0) return
                dispatch({ type: 'CONFIRM_PRICES', phone: selected.phone, lines })
              }}
            >
              <p>
                Set a price for each thing while {assignee?.name ?? 'the agent'} keeps talking to {selected.name}. The customer hears the opening price. The agent can come down to the lowest price and no further.
              </p>
              {rows.map((row, index) => (
                <div className="wa-price-line" key={`${selected.id}-${index}`}>
                  <label>
                    {index === 0 ? 'Item' : <span className="sr">Item</span>}
                    <input value={row.item} onChange={(event) => updateRow(index, { item: event.target.value })} placeholder="Item" />
                  </label>
                  <label>
                    {index === 0 ? 'Opening price' : <span className="sr">Opening price</span>}
                    <input value={row.amount} onChange={(event) => updateRow(index, { amount: event.target.value })} placeholder="Opening price" inputMode="decimal" />
                  </label>
                  <label>
                    {index === 0 ? 'Lowest price' : <span className="sr">Lowest price</span>}
                    <input value={row.floor} onChange={(event) => updateRow(index, { floor: event.target.value })} placeholder="Lowest price" inputMode="decimal" />
                  </label>
                </div>
              ))}
              <span className="button-row">
                <button type="button" className="btn" onClick={() => setRows((current) => [...current, { item: '', amount: '', floor: '' }])}>
                  Add a line
                </button>
                <button type="submit" className="btn btn-primary">
                  Send these prices
                </button>
              </span>
              <small>This stays open. Empty prices stay blank until you fill them. Saving sends only the lines that have a price, and Quorum remembers them.</small>
            </form>
            <div className="wa-stream">
              {selected.messages.map((message) => (
                <article key={message.id} className={message.author === 'quorum' ? 'wa-bubble mine' : 'wa-bubble'}>
                  <p>{message.text}</p>
                  <time dateTime={message.at}>
                    {formatWhen(message.at)} · {deliveryLabel(message.status, message.error)}
                  </time>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="wa-empty">Client messages on the company number will appear here.</p>
        )}
      </section>
    </div>
  )
}

function deliveryLabel(status: string, error?: string): string {
  if (status === 'sent') return 'sent on WhatsApp'
  if (status === 'queued' || status === 'sending') return 'sending'
  if (status === 'failed') return error ? `not sent: ${error}` : 'not sent'
  if (status === 'held') return 'held in Quorum'
  return 'received'
}
