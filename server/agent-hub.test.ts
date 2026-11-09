import { describe, expect, it } from 'vitest'
import { quorumDesktopCommand } from './agent-download'
import { AgentHub, makePairCode } from './agent-hub'

describe('agent hub', () => {
  it('issues a 6-character pairing code', () => {
    expect(makePairCode()).toMatch(/^[A-Z2-9]{6}$/)
  })

  it('bakes the pairing secret into the one-click download', () => {
    const file = quorumDesktopCommand('AB23CD', 'ws://127.0.0.1:5173/agent')
    expect(file.startsWith('@echo off')).toBe(true)
    expect(file).toContain("$PairCode = 'AB23CD'")
    expect(file).toContain("$Gateway = 'ws://127.0.0.1:5173/agent'")
  })

  it('pairs a desktop and forwards a command result', async () => {
    const hub = new AgentHub()
    const { code } = hub.pair()
    let sent = ''
    const { deviceId } = hub.hello({
      code,
      name: 'Studio PC',
      send: (raw) => {
        sent = raw
      },
    })
    expect(hub.list()).toEqual([{ id: deviceId, name: 'Studio PC', online: true }])
    const pending = hub.command(deviceId, 'input', { kind: 'move', x: 10, y: 20 })
    const message = JSON.parse(sent) as { requestId: string }
    hub.result(deviceId, message.requestId, true, { ok: true })
    await expect(pending).resolves.toEqual({ ok: true })
    hub.close(deviceId)
    expect(hub.list()[0]?.online).toBe(false)
    hub.hello({ deviceId, name: 'Studio PC', send: () => undefined })
    expect(hub.list()[0]?.online).toBe(true)
  })

  it('rejects an expired or unknown code', () => {
    const hub = new AgentHub()
    expect(() => hub.hello({ code: 'ZZZZZZ', name: 'PC', send: () => undefined, now: Date.now() })).toThrow(/pairing code/i)
  })
})
