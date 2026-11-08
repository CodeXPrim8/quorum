import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../engine/apply'
import { bareSample } from '../engine/fixture'
import { ackInbound, enqueueInbound, inboxFile, parseWebhook, signatureOk, verifyChallenge } from '../../server/whatsapp'
import { clientLane, clientReply, pickStaff } from './whatsapp'

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
    expect(reply).not.toMatch(/£|\$|€|\d+\s?(usd|gbp)/i)
    expect(reply).toContain('will not send a price')
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
    expect(task?.assigneeId).toBe('staff_lena')
    expect(task?.playbook[0]?.kind).toBe('work')
    expect(twice.tasks.filter((item) => item.title.startsWith('WhatsApp:'))).toHaveLength(1)
  })
})
