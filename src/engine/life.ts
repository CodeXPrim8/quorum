import { isStaffActive } from '../domain/active'
import { money } from '../lib/format'
import { arrivalTime, walkingPresence } from '../office/presence'
import { barSeats, cafeSeats, chatPair, commuteStart, entrance, loungeSeats, roomAt, rooms, screenSpot, serverSpot, toiletSpot, waterApproach, type Spot } from '../office/world'
import type { AppState, OfficeClock, Ride, Staff, StaffLife } from '../types'

const LUNCH = 12 * 60 + 20
const HOUSE_AT = 12 * 60 + 30
const CAR_AT = 12 * 60 + 45
const MARRY_AT = 11 * 60 + 25
const CAR = 18_000
const HOUSE = 120_000

export function defaultLife(index = 0): StaffLife {
  return {
    salary: 1800,
    balance: 2400,
    marital: 'single',
    spouse: null,
    car: false,
    house: false,
    nextBreak: 9 * 60 + 25 + (index % 7) * 11,
    commute: index * 2,
    ride: (['drive', 'drop', 'bus'] as Ride[])[index % 3],
    spentDay: -1,
    nextErrand: 10 * 60 + (index % 9) * 8,
  }
}

export function freshClock(now: number, minute = 8 * 60 + 40): OfficeClock {
  return {
    minute,
    day: 5,
    speed: 2,
    openMinute: 9 * 60,
    closeMinute: 17 * 60 + 30,
    paidDay: -1,
    socialMark: -1,
    filedDay: -1,
    ownerReportDay: -1,
    updatedAt: now,
  }
}

export function clockOpen(clock: OfficeClock): boolean {
  return clock.minute >= clock.openMinute && clock.minute < clock.closeMinute
}

/** Minutes from local midnight, including a fraction of the current minute. */
function wallMinute(now: number): number {
  const date = new Date(now)
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

function localDayNumber(now: number): number {
  const date = new Date(now)
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

/** A short move of the office clock, including the step across midnight. */
function smallStep(before: number, after: number): boolean {
  const delta = after - before
  if (delta >= -0.05 && delta <= 20) return true
  return before >= 24 * 60 - 20 && after <= 20
}

function advanceClock(state: AppState, now: number): AppState {
  if (state.settings.realTime) {
    const minute = wallMinute(now)
    let day = state.clock.day
    if (state.clock.updatedAt > 0) {
      const gained = localDayNumber(now) - localDayNumber(state.clock.updatedAt)
      if (gained > 0) day += gained
    }
    const jumped = state.clock.updatedAt > 0 && !smallStep(state.clock.minute, minute)
    const clock = { ...state.clock, minute, day, updatedAt: now }
    if (jumped && minute >= clock.closeMinute) {
      if (clock.filedDay !== day) clock.filedDay = day
      if (clock.ownerReportDay < day) clock.ownerReportDay = day
    }
    return { ...state, clock }
  }
  if (state.clock.updatedAt === 0) return { ...state, clock: { ...state.clock, updatedAt: now } }
  const elapsed = Math.min(8, Math.max(0, (now - state.clock.updatedAt) / 1000))
  let minute = state.clock.minute + elapsed * state.clock.speed
  let day = state.clock.day
  while (minute >= 24 * 60) {
    minute -= 24 * 60
    day += 1
  }
  return { ...state, clock: { ...state.clock, minute, day, updatedAt: now } }
}

function committed(state: AppState, person: Staff, now: number): boolean {
  if (person.presence.pose === 'call' || person.presence.label === 'On a call') return true
  if (person.presence.movingUntil > now && person.presence.lifeIntent === 'none') return true
  if (person.presence.mode === 'reporting' || person.presence.mode === 'meeting') return true
  if (person.presence.meetingTaskId) return true
  return state.tasks.some(
    (task) => task.handoff && (task.handoff.walkerId === person.id || task.assigneeId === person.id),
  )
}

/** Office movement stays on the floor. It is not company work and is not written into activity or reports. */
function note(state: AppState, _person: Staff, _message: string, _now: number): AppState {
  return state
}

function patchPerson(state: AppState, person: Staff): AppState {
  return { ...state, staff: state.staff.map((item) => (item.id === person.id ? person : item)) }
}

function seatTaken(staff: Staff[], spot: { x: number; y: number }): boolean {
  return staff.some((person) => Math.hypot(person.presence.x - spot.x, person.presence.y - spot.y) < 0.4)
}

function canJoin(state: AppState, person: Staff, now: number): boolean {
  return (
    person.enabled &&
    isStaffActive(state, person) &&
    person.presence.pose === 'sit' &&
    person.presence.lifeIntent === 'none' &&
    person.presence.movingUntil <= now &&
    !committed(state, person, now)
  )
}

function goSit(state: AppState, person: Staff, spot: Spot, label: string, now: number, dwellMs: number): AppState {
  const arriveAt = arrivalTime(person.presence, spot, now, state.settings.reducedMotion)
  const presence = walkingPresence(person.presence, spot, label, now, arriveAt, 'desk', null, 'sit', 'errand', state.settings.reducedMotion)
  presence.dwellUntil = arriveAt + dwellMs
  const seated = {
    ...person,
    life: { ...person.life, nextErrand: person.life.nextErrand + 55 },
    presence,
  }
  return note(patchPerson(state, seated), person, `${label}.`, now)
}

/** Lounge meetings share the couches. Meals share a cafeteria table. */
function sendBreak(state: AppState, person: Staff, kind: 'lounge' | 'cafe' | 'toilet' | 'server' | 'screens', now: number): AppState | null {
  if (kind === 'toilet' || kind === 'server' || kind === 'screens') {
    const spot = kind === 'toilet' ? toiletSpot : kind === 'server' ? serverSpot : screenSpot
    const label = kind === 'toilet' ? 'In the toilet' : kind === 'server' ? 'In the server room' : 'At the operations screens'
    if (seatTaken(state.staff, spot)) return null
    const arriveAt = arrivalTime(person.presence, spot, now, state.settings.reducedMotion)
    const presence = walkingPresence(person.presence, spot, label, now, arriveAt, 'desk', null, 'stand', 'errand', state.settings.reducedMotion)
    const gone = { ...person, life: { ...person.life, nextErrand: person.life.nextErrand + 55 }, presence }
    return note(patchPerson(state, gone), person, `${label}.`, now)
  }
  const seats = (kind === 'lounge' ? loungeSeats : cafeSeats).filter((spot) => !seatTaken(state.staff, spot))
  if (kind === 'lounge' && seats.length === 0) {
    const stool = barSeats.find((spot) => !seatTaken(state.staff, spot))
    if (!stool) return null
    return goSit(state, person, stool, 'At the lounge bar', now, 7000)
  }
  if (seats.length === 0) return null
  const company = kind === 'lounge' ? 2 : 1
  const guests = state.staff.filter((item) => item.id !== person.id && canJoin(state, item, now)).slice(0, Math.min(company, seats.length - 1))
  const label = kind === 'lounge' ? (guests.length > 0 ? 'In a lounge meeting' : 'Sitting in the lounge') : 'Eating in the cafeteria'
  const dwell = kind === 'lounge' ? 11000 : 10000
  let next = goSit(state, person, seats[0], label, now, dwell)
  guests.forEach((guest, index) => {
    next = goSit(next, guest, seats[index + 1], label, now, dwell)
  })
  return next
}

/**
 * Office hours, water, pay, and personal spending.
 * This is the in-app ledger. It does not call a bank, a shop, or a registry.
 */
export function advanceLife(state: AppState, now: number): AppState {
  let next = advanceClock(state, now)
  const clock = next.clock
  const open = clockOpen(clock)

  if (clock.minute >= 12 * 60 && clock.paidDay !== clock.day) {
    next = {
      ...next,
      clock: { ...next.clock, paidDay: clock.day },
      staff: next.staff.map((person) =>
        person.enabled ? { ...person, life: { ...person.life, balance: person.life.balance + person.life.salary } } : person,
      ),
    }
    for (const person of next.staff.filter((item) => item.enabled)) {
      next = note(next, person, `Payday +${money(person.life.salary)}. Balance ${money(person.life.balance)}.`, now)
    }
  }

  for (const seed of [...next.staff]) {
    const person = next.staff.find((item) => item.id === seed.id)
    if (!person || !person.enabled || !isStaffActive(next, person)) continue
    const walking = person.presence.movingUntil > now
    if (!walking && (person.presence.pose === 'drink' || person.presence.lifeIntent === 'chat' || person.presence.lifeIntent === 'errand') && now >= person.presence.dwellUntil) {
      const arriveAt = arrivalTime(person.presence, { x: person.deskX, y: person.deskY }, now, next.settings.reducedMotion)
      const presence = walkingPresence(
        person.presence,
        { x: person.deskX, y: person.deskY },
        'their desk',
        now,
        arriveAt,
        'desk',
        null,
        'sit',
        'none',
        next.settings.reducedMotion,
      )
      next = patchPerson(next, { ...person, presence })
      continue
    }
    if (committed(next, person, now) || walking) continue
    const due = clock.minute >= clock.openMinute + person.life.commute
    const inbound = next.staff.filter((item) => item.presence.lifeIntent === 'arrive' && item.presence.movingUntil > now).length
    if (person.presence.pose === 'away' && open && due && inbound < 2) {
      const start = commuteStart(next.staff.indexOf(person), person.life.ride)
      const from = {
        ...person.presence,
        x: start.x,
        y: start.y,
        originX: start.x,
        originY: start.y,
        path: [start],
      }
      const arriveAt = arrivalTime(from, { x: person.deskX, y: person.deskY }, now, next.settings.reducedMotion)
      const how = person.life.ride === 'drive' ? 'Parked and came in.' : person.life.ride === 'bus' ? 'Got off the bus and came in.' : 'Was dropped off and came in.'
      next = patchPerson(next, {
        ...person,
        presence: walkingPresence(
          from,
          { x: person.deskX, y: person.deskY },
          'their desk',
          now,
          arriveAt,
          'desk',
          null,
          'sit',
          'arrive',
          next.settings.reducedMotion,
        ),
      })
      next = note(next, person, how, now)
      continue
    }
    const leaveAt = clock.closeMinute + person.life.commute
    const outbound = next.staff.filter((item) => item.presence.lifeIntent === 'leave' && item.presence.movingUntil > now).length
    if (person.presence.pose !== 'away' && clock.minute >= leaveAt && outbound < 2) {
      const arriveAt = arrivalTime(person.presence, entrance, now, next.settings.reducedMotion)
      next = patchPerson(next, {
        ...person,
        presence: walkingPresence(
          person.presence,
          entrance,
          'the front door',
          now,
          arriveAt,
          'desk',
          null,
          'away',
          'leave',
          next.settings.reducedMotion,
        ),
      })
      next = note(next, person, 'Left for the day.', now)
      continue
    }
    const coolerBusy = next.staff.some((item) => item.presence.lifeIntent === 'water' && item.presence.movingUntil > now)
    if (
      open &&
      !coolerBusy &&
      person.presence.pose === 'sit' &&
      clock.minute >= person.life.nextBreak &&
      clock.minute < clock.closeMinute - 40
    ) {
      const arriveAt = arrivalTime(person.presence, waterApproach, now, next.settings.reducedMotion)
      next = patchPerson(next, {
        ...person,
        life: { ...person.life, nextBreak: person.life.nextBreak + 80 },
        presence: walkingPresence(
          person.presence,
          waterApproach,
          'the water cooler',
          now,
          arriveAt,
          'desk',
          null,
          'drink',
          'water',
          next.settings.reducedMotion,
        ),
      })
      next = note(next, person, 'Went for water.', now)
      continue
    }
    const errandBusy = next.staff.some((item) => item.presence.lifeIntent === 'errand' && item.presence.movingUntil > now)
    if (open && !errandBusy && person.presence.pose === 'sit' && person.presence.lifeIntent === 'none' && clock.minute >= person.life.nextErrand && clock.minute < clock.closeMinute - 25) {
      const technical = person.roomId === 'technology' || person.roomId === 'operations'
      const kinds = technical
        ? (['lounge', 'cafe', 'toilet', 'server', 'screens'] as const)
        : (['lounge', 'cafe', 'toilet'] as const)
      const start = (person.name.length + Math.floor(clock.minute / 40)) % kinds.length
      let sent = false
      for (let offset = 0; offset < kinds.length; offset += 1) {
        const updated = sendBreak(next, person, kinds[(start + offset) % kinds.length], now)
        if (!updated) continue
        next = updated
        sent = true
        break
      }
      if (sent) continue
    }
    const mark = Math.floor(clock.minute / 28)
    const chatting = next.staff.some((item) => item.presence.lifeIntent === 'chat')
    if (open && !chatting && mark !== next.clock.socialMark && clock.minute > clock.openMinute + 12 && person.presence.pose === 'sit') {
      const partner = next.staff.find(
        (item) =>
          item.id !== person.id &&
          item.roomId === person.roomId &&
          item.enabled &&
          item.presence.pose === 'sit' &&
          item.presence.movingUntil <= now &&
          item.presence.lifeIntent === 'none' &&
          !committed(next, item, now),
      )
      const room = rooms.find((item) => item.id === person.roomId) ?? roomAt({ x: person.deskX, y: person.deskY })
      if (partner && room) {
        next = { ...next, clock: { ...next.clock, socialMark: mark } }
        const [left, right] = chatPair(room)
        const leftAt = arrivalTime(person.presence, left, now, next.settings.reducedMotion)
        const rightAt = arrivalTime(partner.presence, right, now, next.settings.reducedMotion)
        next = patchPerson(next, {
          ...person,
          presence: walkingPresence(person.presence, left, partner.name.split(' ')[0], now, leftAt, 'desk', null, 'stand', 'chat', next.settings.reducedMotion),
        })
        next = patchPerson(next, {
          ...partner,
          presence: walkingPresence(partner.presence, right, person.name.split(' ')[0], now, rightAt, 'desk', null, 'stand', 'chat', next.settings.reducedMotion),
        })
        next = note(next, person, `Stopped to talk with ${partner.name.split(' ')[0]}.`, now)
      }
    }
  }

  if (clock.minute >= LUNCH) {
    for (const person of next.staff) {
      if (!person.enabled || person.life.spentDay === clock.day) continue
      const cost = 12 + (person.name.length % 5)
      if (person.life.balance < cost) continue
      const balance = person.life.balance - cost
      const updated = { ...person, life: { ...person.life, balance, spentDay: clock.day } }
      next = patchPerson(next, updated)
      next = note(next, updated, `Bought lunch −${money(cost)}. Balance ${money(balance)}.`, now)
    }
  }

  if (clock.minute >= HOUSE_AT) {
    for (const person of next.staff) {
      if (!person.enabled || person.life.house || person.life.balance < HOUSE) continue
      const balance = person.life.balance - HOUSE
      const updated = { ...person, life: { ...person.life, balance, house: true } }
      next = patchPerson(next, updated)
      next = note(next, updated, `Bought a house −${money(HOUSE)}. Balance ${money(balance)}.`, now)
    }
  }

  if (clock.minute >= CAR_AT) {
    for (const person of next.staff) {
      if (!person.enabled || person.life.car || person.life.balance < CAR) continue
      if (!person.life.house && person.life.balance >= HOUSE) continue
      const balance = person.life.balance - CAR
      const updated = { ...person, life: { ...person.life, balance, car: true } }
      next = patchPerson(next, updated)
      next = note(next, updated, `Bought a car −${money(CAR)}. Balance ${money(balance)}.`, now)
    }
  }

  if (clock.minute >= MARRY_AT) {
    const lena = next.staff.find((person) => person.id === 'staff_lena' && person.life.marital === 'single')
    if (lena) {
      const updated = { ...lena, life: { ...lena.life, marital: 'married' as const, spouse: 'Noah Park' } }
      next = patchPerson(next, updated)
      next = note(next, updated, 'Married Noah Park.', now)
    }
  }

  return next
}
