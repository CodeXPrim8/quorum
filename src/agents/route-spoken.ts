import { peopleNamed, personForTopic } from './address'
import type { AppState, Staff } from '../types'

/** Quorum picks who answers. OpenAI Live must not do this. */
export function pickSpeakers(line: string, roster: Staff[], state: AppState, clerk: Staff | null, host: Staff | null): Staff[] {
  const named = peopleNamed(line, roster)
  const topic = named.length === 0 ? personForTopic(line, roster, state.tasks) : null
  let speakers = named.length > 0 ? named.slice(0, 3) : topic ? [topic] : []
  if (speakers.length === 0 && /\b(everyone|everybody|you all|all of you)\b/i.test(line)) speakers = roster.slice(0, 3)
  if (clerk && /\b(minutes|notes|did you (get|catch|write)|read that back)\b/i.test(line) && !speakers.some((person) => person.id === clerk.id)) {
    speakers = [clerk, ...speakers]
  }
  if (speakers.length === 0) {
    const chair = host
    if (chair) speakers = [chair]
  }
  return speakers
}
