import os from 'node:os'
import WebSocket from 'ws'
import { parseComputerAction } from '../src/computer/policy'
import {
  applyDesktopInput,
  captureScreenshot,
  desktopAgentReady,
  endDesktopSession,
  hideUsingOverlay,
  parseDesktopInput,
  showUsingOverlay,
  startDesktopSession,
} from '../server/desktop-agent'
import {
  actOnComputer,
  chooseComputerWindow,
  clickForInstruction,
  listComputerWindows,
  observeComputer,
  writeCompose,
} from '../server/computer-use'

function arg(flag: string): string {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? String(process.argv[index + 1] ?? '') : ''
}

const code = (arg('--code') || process.env.QUORUM_PAIR_CODE || '').trim().toUpperCase()
const gateway = (arg('--gateway') || process.env.QUORUM_GATEWAY || 'ws://127.0.0.1:5173/agent').trim()

if (!code) {
  console.error('Quorum Desktop needs a pairing code from the website.')
  console.error('Example: npm run quorum-desktop -- --code ABC123')
  process.exit(1)
}

if (!desktopAgentReady()) {
  console.error('Quorum Desktop controls Windows only in this build.')
  process.exit(1)
}

let token: string | null = null
let socket: WebSocket | null = null
let deviceId = ''

function send(message: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

async function run(op: string, body: Record<string, unknown>): Promise<unknown> {
  if (op === 'session_start') {
    const started = startDesktopSession()
    token = started.token
    await showUsingOverlay(token)
    return { ok: true, active: true }
  }
  if (op === 'session_end' || op === 'stop') {
    endDesktopSession()
    hideUsingOverlay()
    token = null
    return { ok: true, active: false }
  }
  if (!token) throw new Error('Allow computer use on the Quorum website first.')
  if (op === 'screenshot') return captureScreenshot(token)
  if (op === 'input') {
    await applyDesktopInput(token, parseDesktopInput(body))
    return { ok: true }
  }
  if (op === 'using') {
    if (body.action === 'end') hideUsingOverlay()
    else await showUsingOverlay(token)
    return { ok: true }
  }
  if (op === 'windows') return { windows: await listComputerWindows(token) }
  if (op === 'target') return { window: await chooseComputerWindow(token, String(body.hwnd ?? '')) }
  if (op === 'observe') return observeComputer(token)
  if (op === 'click') {
    return clickForInstruction(token, String(body.instruction ?? ''), {
      label: String(body.label ?? ''),
      dryRun: body.dryRun === true,
    })
  }
  if (op === 'compose') {
    return writeCompose(token, {
      to: String(body.to ?? ''),
      subject: String(body.subject ?? ''),
      body: String(body.body ?? ''),
    })
  }
  if (op === 'act') {
    const action = parseComputerAction(JSON.stringify(body.action ?? {}))
    if (!action) throw new Error('That computer action is not in the allowed set.')
    return actOnComputer(token, action, Boolean(body.approved), Boolean(body.approvedStake))
  }
  throw new Error(`Unknown desktop command: ${op}`)
}

function connect(): void {
  console.log(`Quorum Desktop connecting to ${gateway}`)
  const next = new WebSocket(gateway)
  socket = next
  next.on('open', () => {
    next.send(JSON.stringify({ type: 'hello', code, deviceId, name: os.hostname() }))
  })
  next.on('message', (raw) => {
    let message: { type?: string; deviceId?: string; requestId?: string; op?: string; body?: Record<string, unknown>; error?: string }
    try {
      message = JSON.parse(String(raw)) as typeof message
    } catch {
      return
    }
    if (message.type === 'welcome' && message.deviceId) {
      deviceId = message.deviceId
      console.log(`Online as ${os.hostname()} (${deviceId}). This PC can be controlled from the Quorum website.`)
      return
    }
    if (message.type === 'error') {
      console.error(message.error || 'Pairing failed.')
      next.close()
      return
    }
    if (message.type === 'command' && message.requestId && message.op) {
      const requestId = message.requestId
      void run(message.op, message.body ?? {})
        .then((data) => send({ type: 'result', requestId, ok: true, data }))
        .catch((error: unknown) => {
          send({
            type: 'result',
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'The step failed.',
          })
        })
    }
  })
  next.on('close', () => {
    if (deviceId) console.log('Disconnected. Reconnecting…')
    setTimeout(connect, 2000)
  })
  next.on('error', () => {
    next.close()
  })
}

connect()
