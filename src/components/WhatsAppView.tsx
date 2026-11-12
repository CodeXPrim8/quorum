import { useEffect, useState } from 'react'
import type { AppState, Command } from '../types'
import { formatWhen } from '../lib/format'

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
  const [price, setPrice] = useState('')
  const assignee = selected?.assigneeId ? state.staff.find((person) => person.id === selected.assigneeId) : null
  const open = Boolean(selectedId && selected)

  const companyId = state.company?.id

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
    setPrice('')
  }, [selected?.id])

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
                  {selected.taskId ? '' : ''}
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
            {selected.sale?.stage === 'awaiting_price' && selected.sale.item && (
              <form
                className="wa-panel"
                onSubmit={(event) => {
                  event.preventDefault()
                  const amount = price.trim()
                  if (!amount || !selected.sale?.item) return
                  dispatch({ type: 'CONFIRM_PRICE', item: selected.sale.item, amount, phone: selected.phone })
                  setPrice('')
                }}
              >
                <p>
                  {assignee?.name ?? 'Sales'} needs today’s price for the {selected.sale.item} before {selected.name} is told.
                  {selected.sale.detail ? ` They asked: ${selected.sale.detail}` : ''}
                </p>
                <label>
                  Current price
                  <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="450000" inputMode="decimal" />
                </label>
                <button type="submit" className="btn btn-primary">
                  Confirm price
                </button>
                <small>Staff can reuse this price for two days. After that they ask you again before sending it.</small>
              </form>
            )}
            <div className="wa-stream">
              {selected.messages.map((message) => (
                <article key={message.id} className={message.author === 'quorum' ? 'wa-bubble mine' : 'wa-bubble'}>
                  <p>{message.text}</p>
                  <time dateTime={message.at}>
                    {formatWhen(message.at)} · {deliveryLabel(message.status)}
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

function deliveryLabel(status: string): string {
  if (status === 'sent') return 'sent on WhatsApp'
  if (status === 'queued') return 'sending'
  if (status === 'failed') return 'not sent'
  if (status === 'held') return 'held in Quorum'
  return 'received'
}
