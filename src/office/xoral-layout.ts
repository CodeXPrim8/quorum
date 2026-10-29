/** Roads and lots outside the existing office. The office block itself is not in this file. */

export const OFFICE = { x0: -1.2, x1: 26.4, z0: -2.2, z1: 28.2 }

export type Lot = {
  id: string
  name: string
  x: number
  z: number
  /** What a future office on this land would be for. */
  use: string
}

export const LOTS: Lot[] = [
  { id: 'lot_harbor', name: 'Harbor lot', x: 64, z: -18, use: 'A second office facing the north avenue' },
  { id: 'lot_east', name: 'East lot', x: 64, z: 16, use: 'Room for a studio or a warehouse office' },
  { id: 'lot_south', name: 'South lot', x: 14, z: 54, use: 'A yard office behind the current building' },
]

export type Block = {
  x: number
  z: number
  w: number
  d: number
  h: number
  color: string
  roof: 'flat' | 'antenna' | 'setback'
  /** A name on the crown, for the one landmark. */
  sign?: string
  /** A billboard on the face toward the street. */
  board?: string
}

export const BLOCKS: Block[] = [
  { x: -50, z: -54, w: 9, d: 8, h: 22, color: '#d5e2ee', roof: 'antenna' },
  { x: -36, z: -56, w: 7, d: 7, h: 14, color: '#e7eef5', roof: 'setback' },
  { x: -18, z: -58, w: 11, d: 7, h: 18, color: '#f3f1ea', roof: 'flat' },
  { x: 4, z: -58, w: 10, d: 8, h: 28, color: '#6a9ec4', roof: 'antenna', sign: 'Xoral' },
  { x: 22, z: -56, w: 7, d: 7, h: 16, color: '#e4ebf2', roof: 'setback' },
  { x: 40, z: -54, w: 8, d: 6, h: 12, color: '#f7f4ee', roof: 'flat' },
  { x: 62, z: -48, w: 9, d: 8, h: 20, color: '#d0deea', roof: 'antenna' },
  { x: 66, z: 4, w: 6, d: 8, h: 15, color: '#e8eef4', roof: 'setback' },
  { x: 62, z: 34, w: 8, d: 7, h: 11, color: '#f2efe8', roof: 'flat' },
  { x: 36, z: 56, w: 12, d: 7, h: 13, color: '#dce6f0', roof: 'flat' },
  { x: 8, z: 58, w: 7, d: 6, h: 9, color: '#e7eef5', roof: 'setback' },
  { x: -20, z: 56, w: 8, d: 7, h: 12, color: '#f4f1ea', roof: 'flat' },
  { x: -48, z: 40, w: 9, d: 8, h: 17, color: '#d3e0ec', roof: 'antenna' },
  { x: -54, z: 8, w: 7, d: 9, h: 19, color: '#e3ebf3', roof: 'setback' },
  { x: -52, z: -16, w: 6, d: 6, h: 10, color: '#f6f3ec', roof: 'flat' },
  { x: 58, z: -32, w: 5, d: 5, h: 8, color: '#dbe4ee', roof: 'flat' },
  { x: -86, z: -78, w: 10, d: 8, h: 20, color: '#d7e3ef', roof: 'setback' },
  { x: -48, z: -82, w: 8, d: 8, h: 24, color: '#e8eef5', roof: 'antenna' },
  { x: -16, z: -84, w: 12, d: 8, h: 34, color: '#d07a8a', roof: 'antenna' },
  { x: 20, z: -82, w: 9, d: 7, h: 18, color: '#f3f0e8', roof: 'flat' },
  { x: 52, z: -80, w: 8, d: 8, h: 26, color: '#dce7f1', roof: 'setback' },
  { x: 90, z: -58, w: 7, d: 9, h: 16, color: '#e6eef6', roof: 'flat' },
  { x: 94, z: -8, w: 8, d: 8, h: 22, color: '#d2e0ec', roof: 'antenna' },
  { x: 90, z: 40, w: 10, d: 7, h: 14, color: '#f5f2eb', roof: 'flat' },
  { x: 46, z: 82, w: 9, d: 8, h: 19, color: '#d9e5f0', roof: 'setback' },
  { x: 2, z: 86, w: 11, d: 8, h: 23, color: '#e7eef6', roof: 'antenna' },
  { x: -42, z: 82, w: 8, d: 7, h: 15, color: '#f4f1ea', roof: 'flat' },
  { x: -84, z: 46, w: 9, d: 8, h: 21, color: '#d4e2ee', roof: 'antenna' },
  { x: -88, z: -8, w: 7, d: 10, h: 27, color: '#e4edf5', roof: 'setback' },
  { x: -2, z: -80, w: 8, d: 8, h: 40, color: '#3f8fb8', roof: 'antenna', board: 'Xoral' },
  { x: 32, z: -80, w: 7, d: 8, h: 46, color: '#e09a45', roof: 'setback', board: 'Dock Pro' },
  { x: 42, z: -80, w: 7, d: 7, h: 38, color: '#d4655a', roof: 'antenna' },
  { x: 64, z: -80, w: 8, d: 8, h: 44, color: '#5ea88a', roof: 'setback', board: 'Northline' },
  { x: -108, z: -28, w: 8, d: 7, h: 20, color: '#2f5f78', roof: 'antenna' },
  { x: 108, z: -24, w: 8, d: 8, h: 26, color: '#c46a45', roof: 'setback' },
  { x: -36, z: 84, w: 8, d: 7, h: 16, color: '#3d6b4f', roof: 'flat' },
  { x: 96, z: 78, w: 7, d: 7, h: 18, color: '#6b4c7a', roof: 'antenna' },
  { x: 24, z: -108, w: 8, d: 8, h: 30, color: '#24516e', roof: 'antenna' },
  { x: -90, z: -116, w: 8, d: 7, h: 16, color: '#a15c38', roof: 'setback' },
  { x: 96, z: -108, w: 7, d: 7, h: 22, color: '#1f4d4a', roof: 'flat' },
  { x: -148, z: -72, w: 7, d: 7, h: 14, color: '#8a4b78', roof: 'setback' },
]

/** Clockwise ring around the office, clear of the building. */
export const RING: [number, number][] = [
  [-28, -36],
  [48, -36],
  [48, 42],
  [-28, 42],
]

export function missesOffice(x: number, z: number): boolean {
  return x < OFFICE.x0 || x > OFFICE.x1 || z < OFFICE.z0 || z > OFFICE.z1
}

export function nightAmount(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  if (h >= 8 && h < 17) return 0
  if (h >= 20 || h < 5) return 1
  if (h >= 17 && h < 20) return (h - 17) / 3
  return (5 - h) / 3
}

export function loopLength(points: [number, number][]): number {
  let total = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

export function pointOnLoop(points: [number, number][], distance: number, lane: number): { x: number; z: number; yaw: number } {
  const total = loopLength(points)
  let left = ((distance % total) + total) % total
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (left <= len || i === points.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, left / len)
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const yaw = Math.atan2(dx, dz)
      const side = len === 0 ? 0 : lane / len
      return { x: a[0] + dx * t + -dz * side, z: a[1] + dz * t + dx * side, yaw }
    }
    left -= len
  }
  return { x: points[0][0], z: points[0][1], yaw: 0 }
}

/** True when the car's direction should wait at the next corner. */
export function signalRed(elapsed: number, eastWest: boolean): boolean {
  const phase = elapsed % 14
  const nsGreen = phase < 6
  const ewGreen = phase >= 7 && phase < 13
  return eastWest ? !ewGreen : !nsGreen
}

export type Road = {
  a: [number, number]
  b: [number, number]
  width: number
  kind: 'street' | 'highway'
}

/** Streets through the districts, joined to the office ring and to the highway. */
export const ROADS: Road[] = [
  { a: [-70, -96], b: [78, -96], width: 8, kind: 'street' },
  { a: [78, -96], b: [78, -70], width: 8, kind: 'street' },
  { a: [78, -70], b: [-70, -70], width: 8, kind: 'street' },
  { a: [-70, -70], b: [-70, -96], width: 8, kind: 'street' },
  { a: [-70, 68], b: [78, 68], width: 8, kind: 'street' },
  { a: [-70, -70], b: [-70, 68], width: 8, kind: 'street' },
  { a: [78, -70], b: [78, 68], width: 8, kind: 'street' },
  { a: [-70, -36], b: [-28, -36], width: 7, kind: 'street' },
  { a: [48, -36], b: [78, -36], width: 7, kind: 'street' },
  { a: [-70, 42], b: [-28, 42], width: 7, kind: 'street' },
  { a: [48, 42], b: [78, 42], width: 7, kind: 'street' },
  { a: [-28, -70], b: [-28, -36], width: 5.5, kind: 'street' },
  { a: [48, 42], b: [48, 68], width: 6, kind: 'street' },
  { a: [-120, -134], b: [140, -134], width: 16, kind: 'highway' },
  { a: [140, -134], b: [140, 112], width: 16, kind: 'highway' },
  { a: [140, 112], b: [-120, 112], width: 16, kind: 'highway' },
  { a: [-120, 112], b: [-120, -134], width: 16, kind: 'highway' },
  { a: [-70, -96], b: [-70, -134], width: 8, kind: 'street' },
  { a: [78, -96], b: [78, -134], width: 8, kind: 'street' },
  { a: [-70, 68], b: [-70, 112], width: 8, kind: 'street' },
  { a: [78, 68], b: [78, 112], width: 8, kind: 'street' },
  { a: [-112, -36], b: [-70, -36], width: 6, kind: 'street' },
  { a: [-112, -36], b: [-112, 4], width: 6, kind: 'street' },
  { a: [-112, 4], b: [-112, 40], width: 6, kind: 'street' },
  { a: [-112, 40], b: [-112, 90], width: 6, kind: 'street' },
  { a: [-112, 20], b: [-70, 20], width: 6, kind: 'street' },
  { a: [-112, 90], b: [-70, 90], width: 6, kind: 'street' },
  { a: [-70, 90], b: [78, 90], width: 6, kind: 'street' },
  { a: [78, 90], b: [132, 90], width: 6, kind: 'street' },
  { a: [-28, 42], b: [-28, 68], width: 6, kind: 'street' },
  { a: [78, -36], b: [108, -36], width: 6, kind: 'street' },
  { a: [108, -36], b: [108, 8], width: 6, kind: 'street' },
  { a: [78, 8], b: [108, 8], width: 6, kind: 'street' },
  { a: [108, 8], b: [108, 48], width: 6, kind: 'street' },
  { a: [108, 48], b: [108, 90], width: 6, kind: 'street' },
  { a: [108, 68], b: [156, 68], width: 6, kind: 'street' },
  { a: [140, -16], b: [156, -16], width: 6, kind: 'street' },
  { a: [-142, 28], b: [-112, 28], width: 6, kind: 'street' },
  { a: [10, -134], b: [10, -160], width: 8, kind: 'street' },
]

/** North district loop. Cars stay on this loop and do not cross the office ring. */
export const DOWNTOWN: [number, number][] = [
  [-70, -96],
  [78, -96],
  [78, -70],
  [-70, -70],
]

/** Outer highway. Separate from the streets so lanes do not cross. */
export const HIGHWAY: [number, number][] = [
  [-120, -134],
  [140, -134],
  [140, 112],
  [-120, 112],
]

/** Eastbound takeoff strip, north of the highway and clear of the towers. */
export const RUNWAY = { x: 10, z: -196, length: 260, width: 14 }
/** Parallel landing strip, farther from the terminal. */
export const LANDING = { x: 10, z: -230, length: 260, width: 14 }

export type House = { x: number; z: number; wall: string; roof: string }

export const HOUSES: House[] = [
  { x: -104, z: 8, wall: '#f4e0c4', roof: '#c4554a' },
  { x: -104, z: 16, wall: '#f7f1e4', roof: '#2f6b4f' },
  { x: -104, z: 24, wall: '#f0d0b4', roof: '#2a628a' },
  { x: -104, z: 32, wall: '#e7eef6', roof: '#c47b4a' },
  { x: -104, z: 40, wall: '#f6e4ea', roof: '#8a4b78' },
  { x: -96, z: 12, wall: '#efe6c8', roof: '#8a6232' },
  { x: -96, z: 22, wall: '#e5f0e4', roof: '#1f4d4a' },
  { x: -96, z: 32, wall: '#f3d7c4', roof: '#a15c38' },
  { x: -104, z: 48, wall: '#f7f1e4', roof: '#2a628a' },
  { x: -96, z: 46, wall: '#f6e4ea', roof: '#c4554a' },
  { x: 100, z: 16, wall: '#f7e7c8', roof: '#c4554a' },
  { x: 100, z: 26, wall: '#e8f0ea', roof: '#2a628a' },
  { x: 100, z: 36, wall: '#f6d5c8', roof: '#3d6b4f' },
  { x: 100, z: 46, wall: '#efe6f2', roof: '#8a4b78' },
  { x: 116, z: 18, wall: '#fff6e4', roof: '#c47b4a' },
  { x: 116, z: 28, wall: '#e7eef8', roof: '#1f4d4a' },
  { x: 116, z: 38, wall: '#f3e0c4', roof: '#8a6232' },
  { x: 24, z: 98, wall: '#f4e0c4', roof: '#c4554a' },
  { x: 34, z: 98, wall: '#e5f0e4', roof: '#2f6b4f' },
  { x: 44, z: 98, wall: '#f6e4ea', roof: '#2a628a' },
  { x: 54, z: 98, wall: '#efe6c8', roof: '#8a4b78' },
  { x: -104, z: 58, wall: '#f7f1e4', roof: '#c4554a' },
  { x: -96, z: 58, wall: '#e7eef6', roof: '#2a628a' },
  { x: -104, z: 68, wall: '#f6e4ea', roof: '#3d6b4f' },
  { x: -96, z: 68, wall: '#f3d7c4', roof: '#8a6232' },
  { x: -104, z: 78, wall: '#efe6c8', roof: '#8a4b78' },
  { x: -96, z: 78, wall: '#e5f0e4', roof: '#c47b4a' },
  { x: 124, z: 16, wall: '#f7e7c8', roof: '#2f6b4f' },
  { x: 124, z: 26, wall: '#efe6f2', roof: '#c4554a' },
  { x: 124, z: 36, wall: '#e8f0ea', roof: '#2a628a' },
  { x: 124, z: 46, wall: '#f3e0c4', roof: '#8a4b78' },
  { x: 132, z: 22, wall: '#fff6e4', roof: '#1f4d4a' },
  { x: 132, z: 34, wall: '#f6d5c8', roof: '#8a6232' },
  { x: -56, z: 98, wall: '#f4e0c4', roof: '#2a628a' },
  { x: -46, z: 98, wall: '#e5f0e4', roof: '#c4554a' },
  { x: 66, z: 98, wall: '#f6e4ea', roof: '#3d6b4f' },
  { x: 80, z: 98, wall: '#efe6c8', roof: '#8a4b78' },
  { x: -90, z: -28, wall: '#f7f1e4', roof: '#c47b4a' },
  { x: -80, z: -28, wall: '#f6e4ea', roof: '#2f6b4f' },
  { x: -90, z: -18, wall: '#e7eef6', roof: '#8a6232' },
  { x: -80, z: -18, wall: '#f3d7c4', roof: '#2a628a' },
]

/** Water between the downtown towers and the office ring. */
export const CANAL = { z: -48, x0: -100, x1: 100, half: 5 }

export type Bridge = { x: number; z: number; span: number; width: number; kind: 'road' | 'foot' }

/** Road bridges carry a street across the canal. Footbridges cross where there is no street. */
export const BRIDGES: Bridge[] = [
  { x: -70, z: -48, span: 18, width: 9, kind: 'road' },
  { x: -28, z: -48, span: 18, width: 8, kind: 'road' },
  { x: 78, z: -48, span: 18, width: 9, kind: 'road' },
  { x: 8, z: -48, span: 18, width: 3.2, kind: 'foot' },
  { x: 46, z: -48, span: 18, width: 3.2, kind: 'foot' },
  { x: 30, z: 112, span: 22, width: 3.2, kind: 'foot' },
]

/** x, z, and height. Raised points sit on a footbridge deck. */
export type WalkPoint = [number, number, number]

/** A closed promenade. It meets every footbridge and stays outside the office. */
export const WALK: WalkPoint[] = [
  [-80, -62, 0],
  [8, -62, 0],
  [8, -57, 3.3],
  [8, -48, 3.3],
  [8, -39, 3.3],
  [8, -31, 0],
  [46, -31, 0],
  [46, -39, 3.3],
  [46, -48, 3.3],
  [46, -57, 3.3],
  [46, -62, 0],
  [90, -62, 0],
  [90, -31, 0],
  [54, -31, 0],
  [54, 48, 0],
  [90, 48, 0],
  [90, 84, 0],
  [30, 84, 0],
  [30, 101, 3.3],
  [30, 112, 3.3],
  [30, 123, 3.3],
  [30, 124, 0],
  [-16, 124, 0],
  [30, 124, 0],
  [30, 123, 3.3],
  [30, 112, 3.3],
  [30, 101, 3.3],
  [30, 84, 0],
  [-80, 84, 0],
  [-80, 48, 0],
  [-34, 48, 0],
  [-34, -31, 0],
  [-80, -31, 0],
]

export function pointOnWalk(points: WalkPoint[], distance: number): { x: number; z: number; y: number; yaw: number } {
  let total = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  let left = ((distance % total) + total) % total
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (left <= len || i === points.length - 1) {
      const t = len === 0 ? 0 : Math.min(1, left / len)
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      return {
        x: a[0] + dx * t,
        z: a[1] + dz * t,
        y: a[2] + (b[2] - a[2]) * t,
        yaw: Math.atan2(dx, dz),
      }
    }
    left -= len
  }
  return { x: points[0][0], z: points[0][1], y: points[0][2], yaw: 0 }
}

export type Toll = { x: number; z: number; alongX: boolean }

/** Booths on the highway, one on each long side of the city. */
export const TOLLS: Toll[] = [
  { x: -46, z: -134, alongX: true },
  { x: 48, z: 112, alongX: true },
  { x: 140, z: 16, alongX: false },
]

export type Estate = { x: number; z: number; wall: string; roof: string; trim: string; name: string; gate: 1 | -1 }

export const ESTATES: Estate[] = [
  { x: -158, z: 28, wall: '#f6efe2', roof: '#8a3d32', trim: '#1f4d4a', name: 'Westmere', gate: 1 },
  { x: 168, z: -16, wall: '#f3e6d4', roof: '#2a628a', trim: '#c47b4a', name: 'Eastmere', gate: -1 },
  { x: 168, z: 68, wall: '#f7f1e6', roof: '#3d6b4f', trim: '#8a6232', name: 'Southmere', gate: -1 },
]

export type Lamp = { x: number; z: number }

export const LAMPS: Lamp[] = [
  { x: -10, z: -40 },
  { x: 16, z: -40 },
  { x: 40, z: -40 },
  { x: 52, z: -16 },
  { x: 52, z: 10 },
  { x: 52, z: 34 },
  { x: -32, z: 8 },
  { x: -32, z: -12 },
  { x: 10, z: 48 },
  { x: 36, z: 48 },
  { x: -40, z: -96 },
  { x: -8, z: -96 },
  { x: 24, z: -96 },
  { x: 56, z: -96 },
  { x: -40, z: -70 },
  { x: 8, z: -70 },
  { x: 36, z: -70 },
  { x: 60, z: -70 },
  { x: -40, z: 68 },
  { x: 12, z: 68 },
  { x: 52, z: 68 },
  { x: -74, z: -16 },
  { x: -74, z: 24 },
  { x: 82, z: -40 },
  { x: 82, z: 8 },
  { x: -40, z: -140 },
  { x: 24, z: -140 },
  { x: 86, z: -140 },
  { x: -116, z: 16 },
  { x: -116, z: 32 },
]

export function lampClearsOffice(lamp: Lamp): boolean {
  return lamp.x < OFFICE.x0 - 18 || lamp.x > OFFICE.x1 + 18 || lamp.z < OFFICE.z0 - 18 || lamp.z > OFFICE.z1 + 18
}

/** How far a car moves this frame. It stops for a red light and for a car too close ahead. */
export function nextProgress(current: number, gap: number, red: boolean, speed: number, delta: number): number {
  if (red || gap < 4.8) return current
  const move = gap < 8 ? speed * 0.4 : speed
  return current + move * delta
}
