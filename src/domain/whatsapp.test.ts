import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../engine/apply'
import { bareSample } from '../engine/fixture'
import { ackInbound, enqueueInbound, inboxFile, parseWebhook, signatureOk, verifyChallenge } from '../../server/whatsapp'
import { clientLane, clientReply, pickStaff } from './whatsapp'
import { PRICE_FRESH_MS } from './whatsapp-sales'

describe('client lane', () => {
  it('sends a solar quote to the quote specialist and names them without a price', () => {
    const lane = clientLane('Please remind me about the solar quote, PO GRT 683F 32')
    const people = [
      { id: 'sales', roleKey: 'sales_manager', active: true, name: 'Priya Shah', title: 'Sales Manager' },
      { id: 'lena', roleKey: 'quote_specialist', active: true, name: 'Lena Cho', title: 'Quote Specialist' },
    ]
    const person = pickStaff(people, lane.keys)
    const reply = clientReply('Northline', person, lane.refused)
    expect(person?.id).toBe('lena')
    expect(reply).toContain('Lena Cho')
    expect(reply).not.toMatch(/₦|£|\$|€/)
    expect(reply).not.toContain('will not send a price')
  })

  it('sends hiring to HR and refuses an attack', () => {
    expect(clientLane('We want to hire a buyer').keys[0]).toBe('hr_manager')
    expect(clientLane('hack the supplier site').refused).toBe(true)
    expect(clientReply('Northline', null, true)).toContain('this company')
  })
})

describe('whatsapp webhook', () => {
  it('reads a client text message and checks the Meta handshake', () => {
    const messages = parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '15550001111', profile: { name: 'Ada Cole' } }],
                messages: [{ id: 'wamid.1', from: '15550001111', type: 'text', text: { body: 'Need a solar quote' } }],
              },
            },
          ],
        },
      ],
    })
    expect(messages).toEqual([{ id: 'wamid.1', phone: '15550001111', name: 'Ada Cole', text: 'Need a solar quote' }])
    const params = new URLSearchParams('hub.mode=subscribe&hub.verify_token=desk&hub.challenge=44')
    expect(verifyChallenge(params, 'desk')).toBe('44')
    expect(verifyChallenge(params, 'other')).toBeNull()
    expect(signatureOk('{}', 'sha256=nope', 'secret')).toBe(false)
    expect(signatureOk('{}', undefined, '')).toBe(true)
  })

  it('keeps a message until Quorum acknowledges it', () => {
    const file = inboxFile(fs.mkdtempSync(path.join(os.tmpdir(), 'wa-')))
    enqueueInbound(file, [{ id: 'wamid.1', phone: '15550001111', name: 'Ada Cole', text: 'Need a solar quote' }])
    enqueueInbound(file, [{ id: 'wamid.1', phone: '15550001111', name: 'Ada Cole', text: 'Need a solar quote' }])
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(1)
    ackInbound(file, ['wamid.1'])
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([])
  })
})

describe('whatsapp command', () => {
  it('files the client message and a task for the quote specialist once', () => {
    const now = Date.parse('2026-11-07T12:00:00Z')
    const state = bareSample(now)
    const command = {
      type: 'WHATSAPP_INBOUND' as const,
      phone: '15550001111',
      name: 'Ada Cole',
      text: 'Please remind me about the solar quote, PO GRT 683F 32',
      messageId: 'wamid.1',
      linked: false,
    }
    const once = applyCommand(state, command, now)
    const twice = applyCommand(once, command, now + 1)
    const chat = twice.whatsapp?.find((item) => item.phone === '15550001111')
    const task = twice.tasks.find((item) => item.id === chat?.taskId)
    expect(chat?.messages).toHaveLength(2)
    expect(chat?.messages[1]?.status).toBe('held')
    expect(chat?.messages[1]?.text).toMatch(/confirming today's price/i)
    expect(chat?.messages[1]?.text).not.toMatch(/₦|£|\$/)
    expect(chat?.sale?.stage).toBe('awaiting_price')
    expect(task?.assigneeId).toBe('staff_lena')
    expect(task?.playbook[0]?.kind).toBe('work')
    expect(twice.tasks.filter((item) => item.title.startsWith('WhatsApp:'))).toHaveLength(1)
  })

  it('asks a short question, confirms a price with the owner, then invoices', () => {
    const now = Date.parse('2026-11-12T02:00:00Z')
    const ask = (state: ReturnType<typeof bareSample>, id: string, text: string, phone = '2348131074911', at = now) =>
      applyCommand(
        state,
        { type: 'WHATSAPP_INBOUND', phone, name: 'Ada Cole', text, messageId: id, linked: true },
        at,
      )
    let state = ask(bareSample(now), 'wamid.a', 'Do you guys have laptop?')
    const first = state.whatsapp?.find((item) => item.phone === '2348131074911')?.messages.at(-1)?.text ?? ''
    expect(first).toMatch(/specification/i)
    expect(first).not.toMatch(/₦/)

    state = ask(state, 'wamid.b', 'HP 8gb, 2 units', '2348131074911', now + 1)
    const held = state.whatsapp?.find((item) => item.phone === '2348131074911')
    expect(held?.sale?.stage).toBe('awaiting_price')
    expect(held?.messages.at(-1)?.text).toMatch(/confirming today's price/i)
    expect(held?.messages.at(-1)?.text).not.toMatch(/₦/)
    expect(state.attention?.spoken).toMatch(/Hello sir, your attention is needed/i)
    expect(state.chat.some((message) => message.threadId === state.attention?.threadId && message.text.includes('2348131074911'))).toBe(true)

    state = applyCommand(state, { type: 'CONFIRM_PRICE', item: 'laptop', amount: '450000' }, now + 2)
    const quoted = state.whatsapp?.find((item) => item.phone === '2348131074911')
    expect(quoted?.messages.at(-1)?.text).toContain('₦450,000')
    expect(quoted?.messages.at(-1)?.status).toBe('queued')
    expect(state.prices?.[0]?.amount).toBe('₦450,000')

    state = ask(state, 'wamid.c', 'I need 2 HP laptops, 8gb', '15550002222', now + 3)
    const second = state.whatsapp?.find((item) => item.phone === '15550002222')
    expect(second?.messages.at(-1)?.text).toContain('₦450,000')
    expect(second?.sale?.stage).toBe('quoted')

    const staleAt = now + PRICE_FRESH_MS + 60_000
    state = ask(state, 'wamid.d', 'I need 2 Dell laptops, 8gb', '15550003333', staleAt)
    const stale = state.whatsapp?.find((item) => item.phone === '15550003333')
    expect(stale?.sale?.stage).toBe('awaiting_price')
    expect(stale?.messages.at(-1)?.text).not.toContain('₦450,000')

    state = ask(state, 'wamid.e', 'Yes, I will take it', '2348131074911', now + 4)
    expect(state.whatsapp?.find((item) => item.phone === '2348131074911')?.sale?.stage).toBe('details')

    state = ask(state, 'wamid.f', 'Ada Cole, ada@example.com, 12 Allen Avenue Lagos', '2348131074911', now + 5)
    const done = state.whatsapp?.find((item) => item.phone === '2348131074911')
    expect(done?.sale?.stage).toBe('invoiced')
    expect(done?.messages.at(-1)?.text).toContain('QSI-20261112-4911')
    expect(state.customers?.some((item) => item.phone === '2348131074911' && item.email === 'ada@example.com')).toBe(true)
    expect(state.invoices?.[0]?.amount).toBe('₦450,000')
  })

  it('asks for a brand before pricing a vague need, then stops at the floor and opens a call', () => {
    const now = Date.parse('2026-11-12T02:00:00Z')
    const ask = (state: ReturnType<typeof bareSample>, id: string, text: string, at = now) =>
      applyCommand(state, { type: 'WHATSAPP_INBOUND', phone: '2348000000001', name: 'Ada Cole', text, messageId: id, linked: true }, at)
    let state = ask(bareSample(now), 'wamid.q1', 'Do you have a laptop?')
    state = ask(state, 'wamid.q2', 'Anyways I need a laptop for work', now + 1)
    const vague = state.whatsapp?.find((item) => item.phone === '2348000000001')
    expect(vague?.sale?.stage).toBe('qualifying')
    expect(vague?.messages.at(-1)?.text).toMatch(/brand/i)
    expect(vague?.messages.at(-1)?.text).not.toContain('Anyways I need a laptop for work')

    state = ask(state, 'wamid.q3', 'HP, 2 units', now + 2)
    state = applyCommand(state, { type: 'CONFIRM_PRICE', item: 'laptop', amount: '1000000', floor: '950000' }, now + 3)
    expect(state.whatsapp?.find((item) => item.phone === '2348000000001')?.messages.at(-1)?.text).toContain('₦1,000,000')
    expect(state.prices?.at(-1)?.floor).toBe('₦950,000')

    state = ask(state, 'wamid.q4', 'Can you do a better price?', now + 4)
    expect(state.whatsapp?.find((item) => item.phone === '2348000000001')?.messages.at(-1)?.text).toContain('₦950,000')

    state = ask(state, 'wamid.q5', 'No, that is too expensive', now + 5)
    expect(state.whatsapp?.find((item) => item.phone === '2348000000001')?.sale?.stage).toBe('calling')
    expect(state.calls?.[0]?.status).toBe('pending_approval')
    expect(state.calls?.[0]?.phone).toBe('2348000000001')
  })

  it('treats a budget as the customer limit and keeps a quoted chat from starting over', () => {
    const now = Date.parse('2026-11-12T07:00:00Z')
    const ask = (state: ReturnType<typeof bareSample>, id: string, text: string, at = now) =>
      applyCommand(state, { type: 'WHATSAPP_INBOUND', phone: '2348131074911', name: 'Ada Cole', text, messageId: id, linked: true }, at)
    let state = ask(bareSample(now), 'wamid.b1', 'Do you have a laptop?')
    state = ask(state, 'wamid.b2', 'i need a laptop for work, my budget is 500000', now + 1)
    const budget = state.whatsapp?.find((item) => item.phone === '2348131074911')
    expect(budget?.sale?.stage).toBe('qualifying')
    expect(budget?.messages.at(-1)?.text).not.toContain('500000')
    expect(budget?.messages.at(-1)?.text).not.toMatch(/I will not send a price/i)

    state = ask(state, 'wamid.b3', 'HP, 2 units', now + 2)
    state = applyCommand(state, { type: 'CONFIRM_PRICE', item: 'laptop', amount: '700000', floor: '650000' }, now + 3)
    state = ask(state, 'wamid.b4', 'thats on the high side', now + 4)
    expect(state.whatsapp?.find((item) => item.phone === '2348131074911')?.messages.at(-1)?.text).toContain('₦650,000')

    state = ask(state, 'wamid.b5', 'are you there', now + 5)
    const here = state.whatsapp?.find((item) => item.phone === '2348131074911')
    expect(here?.sale?.stage).toBe('quoted')
    expect(here?.messages.at(-1)?.text).toMatch(/I am here/i)
    expect(here?.messages.at(-1)?.text).not.toMatch(/specification/i)

    state = ask(state, 'wamid.b6', 'how much gen it go for last', now + 6)
    const last = state.whatsapp?.find((item) => item.phone === '2348131074911')
    expect(last?.sale?.stage).toBe('quoted')
    expect(last?.messages.at(-1)?.text).toContain('₦650,000')
    expect(last?.messages.at(-1)?.text).not.toMatch(/specification/i)
  })
})
