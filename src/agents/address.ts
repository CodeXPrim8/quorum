import type { Staff } from '../types'
import { voiceKind, type VoiceKind } from './staff-voice'

export { voiceKind, type VoiceKind }

const ALIASES: Record<string, string[]> = {
  sofia: ['sophia', 'sophie'],
  jonah: ['john'],
  tom: ['thomas'],
  samir: ['sam'],
  elise: ['ellise'],
}

export function spokenNames(person: Staff): string[] {
  const parts = person.name.split(' ').filter(Boolean)
  const first = parts[0]?.toLowerCase() ?? ''
  const last = parts.slice(1).join(' ').toLowerCase()
  return [...new Set([first, last, ...(ALIASES[first] ?? [])].filter((name) => name.length > 1))]
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** People the caller named, in the order the names were spoken. Sophia reaches Sofia. */
export function peopleNamed(text: string, people: Staff[]): Staff[] {
  const hits: { at: number; person: Staff }[] = []
  for (const person of people) {
    let earliest = -1
    for (const name of spokenNames(person)) {
      const match = new RegExp(`\\b${escapeReg(name)}\\b`, 'i').exec(text)
      if (match && (earliest < 0 || match.index < earliest)) earliest = match.index
    }
    if (earliest >= 0) hits.push({ at: earliest, person })
  }
  return hits.sort((a, b) => a.at - b.at).map((hit) => hit.person)
}

const SKIP = new Set(['update', 'about', 'this', 'that', 'with', 'from', 'your', 'what', 'when', 'where', 'please', 'want', 'need', 'give', 'status', 'doing', 'hear', 'yeah', 'okay'])

/** The person whose work the question is about, when no name was spoken. */
export function personForTopic(
  text: string,
  people: Staff[],
  tasks: { assigneeId: string | null; title: string; status: string }[],
): Staff | null {
  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 3 && !SKIP.has(word))
  if (words.length === 0) return null
  let best: { person: Staff; score: number } | null = null
  for (const person of people) {
    const own = tasks.filter((task) => task.assigneeId === person.id && task.status !== 'done').map((task) => task.title)
    const blob = `${person.title} ${person.purpose} ${person.responsibilities.join(' ')} ${own.join(' ')}`.toLowerCase()
    const score = words.filter((word) => blob.includes(word)).length
    if (!best || score > best.score) best = { person, score }
  }
  return best && best.score > 0 ? best.person : null
}
