export type SlipPlay = { play: string; pattern: string }

export type SportsSlip = {
  sport: string
  event: string
  start: string
  competition: string
  plays: SlipPlay[]
  stake: string
}

const FIXTURE = /\b[\p{L}0-9.'’-]{1,}\s+(?:vs\.?|versus|v)\s+[\p{L}0-9.'’-]{1,}\b/iu
const BETTING = /\b(bet|betting|odds|bookmaker|bookie|sportybet|nairabet|bet9ja|betway|1xbet|accumulator|slip|stake)\b/i
const SPORT =
  /\b(football|soccer|premier league|champions league|la liga|serie a|bundesliga|nba|basketball|tennis|boxing|ufc|mma|cricket|rugby|nfl|mlb|nhl|hockey|golf|formula\s*1|\bf1\b|athletics)\b/i
const WEAK = /\b(maybe|might|could|possibly|perhaps|lean|toss-?up|unclear|mixed|unsure|guess)\b/i

/** The owner is asking for a sporting read, not a generic company question. */
export function isSportsAsk(prompt: string): boolean {
  const text = prompt.replace(/\s+/g, ' ').trim()
  if (!text) return false
  return BETTING.test(text) || FIXTURE.test(text) || SPORT.test(text)
}

export function formatSlip(slip: SportsSlip): string {
  const head = [slip.sport, slip.event, slip.start, slip.competition].filter((part) => part && part !== 'unknown')
  const plays = slip.plays
    .map((play) => `${play.play}\n${play.pattern}`)
    .join('\n\n')
  return [
    'Near-sure pattern from the research. This is the strongest pattern I can defend. It is not a guaranteed win. You approve the stake. The book stays linked until you Disconnect.',
    head.join(' · '),
    plays,
    slip.stake,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function emptySlip(event: string): string {
  const name = event.trim() || 'this event'
  return `Nothing on ${name} clears the near-sure bar, so there is no stake.`
}

/** Keep only specific, sport-native plays. Weak language and a guaranteed-win claim are dropped. */
export function parseSlip(raw: string, fallbackEvent = ''): SportsSlip | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const body = JSON.parse(match[0]) as Record<string, unknown>
    if (body.pass === true) return null
    const plays = Array.isArray(body.plays) ? body.plays : []
    const kept: SlipPlay[] = []
    for (const item of plays) {
      if (!item || typeof item !== 'object') continue
      const row = item as { play?: unknown; pattern?: unknown }
      const play = cleanPlay(String(row.play ?? ''))
      const pattern = cleanLine(String(row.pattern ?? ''))
      if (!play || !pattern || WEAK.test(`${play} ${pattern}`)) continue
      if (/\bguaranteed\b/i.test(`${play} ${pattern}`)) continue
      kept.push({ play, pattern })
      if (kept.length === 4) break
    }
    if (kept.length === 0) return null
    const event = cleanLine(String(body.event ?? fallbackEvent)) || fallbackEvent || 'This event'
    return {
      sport: cleanLine(String(body.sport ?? 'Sport')) || 'Sport',
      event,
      start: cleanLine(String(body.start ?? '')),
      competition: cleanLine(String(body.competition ?? '')),
      plays: kept,
      stake: cleanLine(String(body.stake ?? '')) || 'One slip with only these plays. You approve the amount.',
    }
  } catch {
    return null
  }
}

function cleanPlay(value: string): string {
  const text = cleanLine(value)
  if (text.length < 8) return ''
  return /^play\b/i.test(text) ? text : `Play ${text.charAt(0).toLowerCase()}${text.slice(1)}`
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 280)
}
