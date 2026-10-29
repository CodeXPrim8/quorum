export function money(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value)
}

export function formatClock(minute: number): string {
  const hours = Math.floor(minute / 60) % 24
  const mins = Math.floor(minute % 60)
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function iso(now: number, offsetMs = 0): string {
  return new Date(now + offsetMs).toISOString()
}

export function formatWhen(at: string, now = Date.now()): string {
  const delta = now - new Date(at).getTime()
  if (Number.isNaN(delta) || delta < 45_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function activityLine(actorName: string, message: string): string {
  const trimmed = message.trim()
  if (trimmed.startsWith(actorName)) return trimmed
  return `${actorName}: ${trimmed}`
}
