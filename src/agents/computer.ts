import type { ComputerAction, ControlInfo } from '../computer/policy'
import { readDesktopToken } from './desktop'

export type ComputerWindow = { hwnd: string; processName: string; title: string }

export type ComputerView = {
  title: string
  processName: string
  image: string
  width: number
  height: number
  controls: ControlInfo[]
  note?: string
}

export type ComputerLogItem = { id: number; text: string }

type ActResult =
  | { ok: true; note: string }
  | { ok: false; needsApproval: true; reason: string }
  | { ok: false; handoff: true; reason: string }

type Listener = () => void

let scope: ComputerWindow | null = null
let view: ComputerView | null = null
let log: ComputerLogItem[] = []
let logId = 1
let pending: { reason: string } | null = null
let decide: ((allowed: boolean) => void) | null = null
let stopped = false
const listeners = new Set<Listener>()

function emit(): void {
  for (const fn of listeners) fn()
}

export function subscribeComputer(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function computerScope(): ComputerWindow | null {
  return scope
}

export function computerView(): ComputerView | null {
  return view
}

export function computerLog(): ComputerLogItem[] {
  return log
}

export function computerPending(): { reason: string } | null {
  return pending
}

export function computerStopped(): boolean {
  return stopped
}

export function noteComputer(text: string): void {
  log = [...log, { id: logId, text }].slice(-40)
  logId += 1
  emit()
}

export function clearComputerSession(): void {
  scope = null
  view = null
  log = []
  pending = null
  if (decide) decide(false)
  decide = null
  stopped = true
  emit()
}

export function armComputerSession(): void {
  stopped = false
  emit()
}

export function waitForComputerApproval(reason: string): Promise<boolean> {
  pending = { reason }
  emit()
  return new Promise((resolve) => {
    decide = (allowed) => {
      pending = null
      decide = null
      emit()
      resolve(allowed)
    }
  })
}

export function decideComputerApproval(allowed: boolean): void {
  decide?.(allowed)
}

function token(): string {
  const value = readDesktopToken()
  if (!value) throw new Error('Computer access is stopped.')
  return value
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Computer use could not continue.')
  return data
}

export async function listComputerWindows(): Promise<ComputerWindow[]> {
  const data = await post<{ windows?: ComputerWindow[] }>('/api/computer/windows', { sessionToken: token() })
  return data.windows ?? []
}

export async function chooseComputerWindow(hwnd: string): Promise<ComputerWindow> {
  const data = await post<{ window: ComputerWindow }>('/api/computer/target', { sessionToken: token(), hwnd })
  scope = data.window
  noteComputer(`Window in scope: ${data.window.title}`)
  emit()
  return data.window
}

export async function observeComputer(): Promise<ComputerView> {
  const next = await post<ComputerView>('/api/computer/observe', { sessionToken: token() })
  view = next
  emit()
  return next
}

export async function clickForInstruction(
  instruction: string,
  options?: { label?: string; dryRun?: boolean },
): Promise<{ clicked: string | null; saw: string[] }> {
  return post<{ clicked: string | null; saw: string[] }>('/api/computer/click', {
    sessionToken: token(),
    instruction,
    label: options?.label ?? '',
    dryRun: options?.dryRun === true,
  })
}

export async function writeComputerDraft(draft: { to: string; subject: string; body: string }): Promise<void> {
  await post('/api/computer/compose', { sessionToken: token(), ...draft })
}

export async function actOnComputer(action: ComputerAction, approved = false): Promise<ActResult> {
  return post<ActResult>('/api/computer/act', { sessionToken: token(), action, approved })
}

export async function stopComputerBridge(): Promise<void> {
  clearComputerSession()
  try {
    await fetch('/api/computer/stop', { method: 'POST' })
  } catch {
    // Local state is already cleared.
  }
}
