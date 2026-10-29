import type { AppState, OwnerGender, Staff } from '../types'

const MINUTES_ROLES = new Set(['hr_manager', 'quote_specialist', 'campaign_producer', 'account_executive', 'buyer'])

export function ownerHonorific(gender: OwnerGender | undefined): 'sir' | 'ma' | null {
  if (gender === 'male') return 'sir'
  if (gender === 'female') return 'ma'
  return null
}

export function dayPart(at: Date): 'Good morning' | 'Good afternoon' | 'Good evening' {
  const hour = at.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function spokenClock(at: Date): string {
  const hour = at.getHours() % 12 || 12
  const minute = at.getMinutes()
  if (minute === 0) return `It's ${hour} o'clock.`
  return `It's ${hour}:${String(minute).padStart(2, '0')}.`
}

export function roleDepth(state: AppState, roleId: string): number {
  let depth = 0
  let current = state.roles.find((role) => role.id === roleId)
  const seen = new Set<string>()
  while (current?.reportsToRoleId && !seen.has(current.id)) {
    seen.add(current.id)
    depth += 1
    current = state.roles.find((role) => role.id === current?.reportsToRoleId)
  }
  return depth
}

/** The Managing Director when they are on the line, otherwise the most senior person present. */
export function seniorOnCall(people: Staff[], state: AppState): Staff | null {
  if (people.length === 0) return null
  const ranked = [...people].sort((a, b) => {
    const byRank = roleDepth(state, a.roleId) - roleDepth(state, b.roleId)
    if (byRank !== 0) return byRank
    return a.name.localeCompare(b.name)
  })
  return ranked[0] ?? null
}

/** Someone other than the chair, preferably People/HR or a more junior desk. */
export function minutesTaker(people: Staff[], host: Staff, state: AppState): Staff | null {
  const rest = people.filter((person) => person.id !== host.id)
  if (rest.length === 0) return null
  const roleKey = (person: Staff) => state.roles.find((role) => role.id === person.roleId)?.key
  const hr = rest.find((person) => roleKey(person) === 'hr_manager')
  if (hr) return hr
  const preferred = rest.find((person) => {
    const key = roleKey(person)
    return key ? MINUTES_ROLES.has(key) : false
  })
  if (preferred) return preferred
  return [...rest].sort((a, b) => roleDepth(state, b.roleId) - roleDepth(state, a.roleId) || a.name.localeCompare(b.name))[0] ?? null
}

export function openingForCall(input: {
  host: Staff
  clerk: Staff | null
  group: boolean
  gender: OwnerGender | undefined
  at: Date
}): { host: string; clerk: string | null } {
  const honorific = ownerHonorific(input.gender)
  const part = dayPart(input.at)
  const hello = honorific ? `${part}, ${honorific}.` : `${part}.`
  const clock = spokenClock(input.at)
  const first = input.host.name.split(' ')[0]
  if (!input.group) {
    return { host: `${hello} ${clock} It's ${first}. I can hear you.`, clerk: null }
  }
  const host = input.clerk
    ? `${hello} ${clock} I'm ${first}, ${input.host.title}. ${input.clerk.name.split(' ')[0]} will write the minutes for this meeting.`
    : `${hello} ${clock} I'm ${first}, ${input.host.title}. We can hear you.`
  const clerk = input.clerk && honorific ? `I'll take the minutes, ${honorific}.` : input.clerk ? `I'll take the minutes.` : null
  return { host, clerk }
}
