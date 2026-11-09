const DEVICE_KEY = 'quorum.agent.device.v1'

export type AgentDevice = { id: string; name: string; online: boolean }

export function readAgentDevice(): string | null {
  try {
    return sessionStorage.getItem(DEVICE_KEY)
  } catch {
    return null
  }
}

export function writeAgentDevice(id: string | null): void {
  try {
    if (!id) sessionStorage.removeItem(DEVICE_KEY)
    else sessionStorage.setItem(DEVICE_KEY, id)
  } catch {
    // Private mode still shows the pairing code.
  }
}

export function usingRemoteAgent(): boolean {
  return Boolean(readAgentDevice())
}

export async function remoteCommand<T>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const deviceId = readAgentDevice()
  if (!deviceId) throw new Error('No Quorum Desktop is connected.')
  const response = await fetch('/api/agent/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, op, body }),
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Quorum Desktop could not run that step.')
  return data
}
