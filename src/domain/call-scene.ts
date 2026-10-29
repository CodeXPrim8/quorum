import { minutesTaker, ownerHonorific, seniorOnCall, spokenClock } from './meeting'
import { assignmentFor } from './selectors'
import type { AppState, Staff } from '../types'

export type SpokenLine = { staffId: string; text: string }

export type OfficeMood = {
  kind: 'morning' | 'blocked' | 'waiting' | 'late' | 'calm'
  note: string
}

export function officeAt(minute: number): Date {
  const hours = Math.floor(minute / 60) % 24
  const mins = minute % 60
  return new Date(2026, 9, 28, hours, mins)
}

export function officeMood(state: AppState): OfficeMood {
  const blocked = state.tasks.filter((task) => task.status === 'blocked')
  const waiting = state.tasks.filter((task) => task.status === 'waiting_for_owner')
  const hour = Math.floor(state.clock.minute / 60)
  if (blocked.length > 0) {
    return { kind: 'blocked', note: `${blocked[0].title} is stuck` }
  }
  if (waiting.length > 0) {
    return { kind: 'waiting', note: `waiting on you for ${waiting[0].title}` }
  }
  if (hour >= 17) {
    return { kind: 'late', note: 'it has been a long day' }
  }
  if (hour >= 5 && hour < 12) {
    return { kind: 'morning', note: 'the morning still feels open' }
  }
  return { kind: 'calm', note: 'the floor is moving' }
}

function firstName(person: { name: string }): string {
  return person.name.split(' ')[0] ?? person.name
}

function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return items
  const start = ((seed % items.length) + items.length) % items.length
  return [...items.slice(start), ...items.slice(0, start)]
}

function pick<T>(items: T[], seed: number): T {
  return items[((seed % items.length) + items.length) % items.length]
}

/** Several people greet the owner and each other from the floor, not a scripted chair-and-clerk pair. */
export function sceneOpening(state: AppState, people: Staff[]): SpokenLine[] {
  if (people.length === 0) return []
  const owner = state.company?.ownerName ?? 'you'
  const ownerFirst = firstName({ name: owner })
  const honorific = ownerHonorific(state.company?.ownerGender)
  const you = honorific ?? ownerFirst
  const at = officeAt(state.clock.minute)
  const clock = spokenClock(at)
  const mood = officeMood(state)
  const chair = seniorOnCall(people, state) ?? people[0]
  const clerk = people.length > 1 ? minutesTaker(people, chair, state) : null
  const seed = state.clock.minute + people.map((person) => person.id).join('').length + mood.kind.length
  const order = rotate(people, seed)
  const opener = order[0] ?? chair
  const buddy = order.find((person) => person.id !== opener.id)
  const third = order.find((person) => person.id !== opener.id && person.id !== buddy?.id)
  const lines: SpokenLine[] = []

  const hostLines: Record<OfficeMood['kind'], string[]> = {
    morning: [
      `Hey ${you}. ${clock} It’s actually a beautiful morning in here.`,
      `${you} — morning. I just sat down. How are you?`,
      `Oh, ${you}’s on. Morning. Sun’s being kind for once.`,
    ],
    blocked: [
      `${you}, glad you hopped on. I’ll be honest, I’m not happy with the progress.`,
      `Hey ${you}. We have a problem on the floor and I didn’t want to wait.`,
      `${you}. Tension’s up. Something’s stuck and it’s showing.`,
    ],
    waiting: [
      `${you}, we were waiting on you — not in a bad way, we just stalled.`,
      `Hey ${you}. We paused because we needed you, and now you’re here.`,
      `${you}. Thanks for jumping. We were hanging in the office for this.`,
    ],
    late: [
      `${you}. Long day. I’m glad we’re talking before people peel off.`,
      `Evening, ${you}. Everyone’s a bit tired, but we’re here.`,
      `Hey ${you}. Late one. Let’s keep this human.`,
    ],
    calm: [
      `Hey ${you}. We’re on, and the office is pretty settled.`,
      `${you} — hi. Good to hear you.`,
      `Oh hey ${you}. We can just talk.`,
    ],
  }
  lines.push({ staffId: opener.id, text: pick(hostLines[mood.kind], seed) })

  if (buddy) {
    const buddyName = firstName(buddy)
    const openerName = firstName(opener)
    const buddyLines: Record<OfficeMood['kind'], string[]> = {
      morning: [
        `Hey ${openerName}. Hey ${you}. I’m ${buddyName}. Morning.`,
        `${firstName(opener)}, hey. ${you}, good to see you on this.`,
        `Hi everyone. ${you}, hope your morning’s been decent.`,
      ],
      blocked: [
        `Yeah. ${you}, I’m ${buddyName} — I’m frustrated too. It’s sitting there.`,
        `${firstName(opener)}’s right. Hey ${you}. This one’s been eating at me.`,
        `Hi ${you}. I’m not going to pretend I’m fine with where this is.`,
      ],
      waiting: [
        `Hi ${you}. We were hovering. Thanks for coming on.`,
        `${you} — hey. I can finally say this out loud.`,
        `Morning-ish. ${you}, we needed your voice on this.`,
      ],
      late: [
        `Hey ${you}. I’m ${buddyName}. Long one for me too.`,
        `${firstName(opener)}, yeah. ${you}, I’m still here.`,
        `Hi. Tired, but I’m listening.`,
      ],
      calm: [
        `Hey ${you}. ${firstName(opener)}, good to hear you.`,
        `Hi all. ${you}, I’m ${buddyName}.`,
        `${you} — hey. I’m on my laptop if you need me.`,
      ],
    }
    lines.push({ staffId: buddy.id, text: pick(buddyLines[mood.kind], seed + 3) })
  }

  if (third && people.length > 2) {
    const task = assignmentFor(state, third.id)
    const work = task ? `I’ve been on “${task.title}”.` : 'I’ve been at my desk.'
    const thirdLines = [
      `Hey. ${firstName(third)} here. ${work}`,
      `Hi ${you}. Just waving from my desk.`,
      `Hey everyone. I’m in.`,
    ]
    lines.push({ staffId: third.id, text: pick(thirdLines, seed + 7) })
  }

  if (clerk && !lines.some((line) => line.staffId === clerk.id)) {
    const note = honorific
      ? `I’ll keep a light note of what we decide, ${honorific}. Not a transcript.`
      : `I’ll keep a light note of what we decide. Not a transcript.`
    lines.push({ staffId: clerk.id, text: note })
  } else if (clerk) {
    lines.push({
      staffId: clerk.id,
      text: pick(
        [
          `I’ll scribble minutes so we don’t lose it.`,
          `I’m listening, and I’ll write the useful bits down.`,
          `Notes are on me. Talk like people.`,
        ],
        seed + 11,
      ),
    })
  }

  return lines
}

export function floorPrompt(state: AppState, person: Staff): string {
  const mood = officeMood(state)
  const task = assignmentFor(state, person.id)
  const at = officeAt(state.clock.minute)
  return [
    `Office clock: ${spokenClock(at)} Floor mood: ${mood.kind} (${mood.note}).`,
    `You are ${person.presence.label}, pose ${person.presence.pose}.`,
    task ? `Your live work: ${task.title} (${task.status}).` : 'You do not have an open task.',
    `Colleagues on this call are real people in the same office. Greet them by first name when it fits.`,
    `Sound like a person, not an assistant. Do not reuse a greeting pattern. One or two short spoken sentences. Emotion is allowed.`,
  ].join(' ')
}
