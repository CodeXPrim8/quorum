import type { LifeIntent, Pose, Presence, PresenceMode } from '../types'
import { positionAt, route, travelMs, type Pt } from './world'

export function settledPresence(x: number, y: number, mode: PresenceMode = 'desk', label = 'At desk'): Presence {
  const pose: Pose = mode === 'desk' || mode === 'waiting' ? 'sit' : 'stand'
  return {
    mode,
    x,
    y,
    originX: x,
    originY: y,
    movingUntil: 0,
    label,
    meetingTaskId: null,
    path: [{ x, y }],
    pathFrom: 0,
    pose,
    lifeIntent: 'none',
    dwellUntil: 0,
  }
}

export function awayPresence(): Presence {
  return {
    ...settledPresence(1.6, -0.85, 'desk', 'Out'),
    pose: 'away',
    lifeIntent: 'leave',
  }
}

export function walkingPresence(
  presence: Presence,
  to: Pt,
  label: string,
  now: number,
  arriveAt: number,
  mode: PresenceMode,
  meetingTaskId: string | null,
  pose: Pose,
  lifeIntent: LifeIntent,
  reduced: boolean,
): Presence {
  const from = positionAt(presence, now)
  const path = reduced ? [to] : route(from, to)
  return {
    mode,
    x: to.x,
    y: to.y,
    originX: from.x,
    originY: from.y,
    movingUntil: arriveAt,
    label,
    meetingTaskId,
    path,
    pathFrom: now,
    pose,
    lifeIntent,
    dwellUntil: lifeIntent === 'water' ? arriveAt + 5600 : lifeIntent === 'chat' ? arriveAt + 4800 : lifeIntent === 'errand' ? arriveAt + 5200 : 0,
  }
}

export function arrivalTime(presence: Presence, to: Pt, now: number, reduced: boolean): number {
  return now + travelMs(reduced, positionAt(presence, now), to)
}
