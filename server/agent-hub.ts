import { randomBytes } from 'node:crypto'

export type AgentDevice = {
  id: string
  name: string
  online: boolean
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type LiveDevice = AgentDevice & {
  send: (raw: string) => void
  pending: Map<string, Pending>
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makePairCode(): string {
  const bytes = randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return code
}

export class AgentHub {
  private codes = new Map<string, number>()
  private devices = new Map<string, LiveDevice>()

  pair(now = Date.now()): { code: string; expiresAt: number } {
    this.sweep(now)
    const code = makePairCode()
    const expiresAt = now + 10 * 60 * 1000
    this.codes.set(code, expiresAt)
    return { code, expiresAt }
  }

  list(): AgentDevice[] {
    return [...this.devices.values()].map(({ id, name, online }) => ({ id, name, online }))
  }

  hello(input: { code?: string; deviceId?: string; name: string; send: (raw: string) => void; now?: number }): { deviceId: string } {
    const now = input.now ?? Date.now()
    this.sweep(now)
    const existingId = String(input.deviceId ?? '')
    const existing = existingId ? this.devices.get(existingId) : undefined
    if (existing) {
      existing.online = true
      existing.send = input.send
      existing.name = input.name.trim().slice(0, 80) || existing.name
      return { deviceId: existing.id }
    }
    const code = String(input.code ?? '').trim().toUpperCase()
    const expires = this.codes.get(code)
    if (!expires || expires < now) throw new Error('That pairing code is wrong or expired. Create a new one on the website.')
    this.codes.delete(code)
    const deviceId = randomBytes(8).toString('hex')
    this.devices.set(deviceId, {
      id: deviceId,
      name: input.name.trim().slice(0, 80) || 'Windows PC',
      online: true,
      send: input.send,
      pending: new Map(),
    })
    return { deviceId }
  }

  close(deviceId: string): void {
    const device = this.devices.get(deviceId)
    if (!device) return
    device.online = false
    for (const pending of device.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Quorum Desktop disconnected.'))
    }
    device.pending.clear()
  }

  async command(deviceId: string, op: string, body: unknown, timeoutMs = 45_000): Promise<unknown> {
    const device = this.devices.get(deviceId)
    if (!device?.online) throw new Error('Quorum Desktop is offline. Open it on the PC you want to control.')
    const requestId = randomBytes(8).toString('hex')
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        device.pending.delete(requestId)
        reject(new Error('Quorum Desktop did not answer in time.'))
      }, timeoutMs)
      device.pending.set(requestId, { resolve, reject, timer })
    })
    device.send(JSON.stringify({ type: 'command', requestId, op, body: body ?? {} }))
    return result
  }

  result(deviceId: string, requestId: string, ok: boolean, data: unknown, error?: string): void {
    const device = this.devices.get(deviceId)
    const pending = device?.pending.get(requestId)
    if (!device || !pending) return
    device.pending.delete(requestId)
    clearTimeout(pending.timer)
    if (ok) pending.resolve(data)
    else pending.reject(new Error(error || 'Quorum Desktop could not run that step.'))
  }

  private sweep(now: number): void {
    for (const [code, expires] of this.codes) {
      if (expires < now) this.codes.delete(code)
    }
  }
}
