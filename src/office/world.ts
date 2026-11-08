import type { Presence } from '../types'

export type Pt = { x: number; y: number }

export type RoomBox = {
  id: string
  name: string
  x: number
  z: number
  w: number
  d: number
  /** Which wall the door is on. */
  doorSide: 'n' | 's'
  doorX: number
  color: string
}

export type Spot = { x: number; y: number; facing: number }

const DOOR = 1.2

export const rooms: RoomBox[] = [
  { id: 'owner', name: 'Owner', x: 3.2, z: 0, w: 6.4, d: 5.5, doorSide: 's', doorX: 6.4, color: '#243140' },
  { id: 'executive', name: 'Executive', x: 9.6, z: 0, w: 6.4, d: 5.5, doorSide: 's', doorX: 12.8, color: '#1f4d4a' },
  { id: 'meeting', name: 'Meeting', x: 16, z: 0, w: 8.2, d: 5.5, doorSide: 's', doorX: 20.1, color: '#3d4a5c' },
  { id: 'sales', name: 'Sales', x: 3.2, z: 7.65, w: 5.2, d: 3.7, doorSide: 'n', doorX: 5.8, color: '#2a628a' },
  { id: 'marketing', name: 'Marketing', x: 8.4, z: 7.65, w: 5.2, d: 3.7, doorSide: 'n', doorX: 11, color: '#b86a1a' },
  { id: 'comms', name: 'Communications', x: 13.6, z: 7.65, w: 5.2, d: 3.7, doorSide: 'n', doorX: 16.2, color: '#8a4b78' },
  { id: 'procurement', name: 'Procurement', x: 18.8, z: 7.65, w: 5.4, d: 3.7, doorSide: 'n', doorX: 21.5, color: '#3d6b4f' },
  { id: 'finance', name: 'Finance', x: 3.2, z: 13.4, w: 6.4, d: 3.6, doorSide: 'n', doorX: 6.4, color: '#8a6232' },
  { id: 'people', name: 'People', x: 9.6, z: 13.4, w: 6.4, d: 3.6, doorSide: 'n', doorX: 12.8, color: '#6b4c7a' },
  { id: 'technology', name: 'Technology', x: 16, z: 13.4, w: 8.2, d: 3.6, doorSide: 'n', doorX: 20.1, color: '#2f4f6f' },
  { id: 'lounge', name: 'Lounge', x: 3.2, z: 18.55, w: 5, d: 7.85, doorSide: 'n', doorX: 5.6, color: '#3e463f' },
  { id: 'cafeteria', name: 'Cafeteria', x: 8.2, z: 18.55, w: 5.6, d: 7.85, doorSide: 'n', doorX: 11, color: '#cbb892' },
  { id: 'toilets', name: 'Toilets', x: 13.8, z: 18.55, w: 3.2, d: 7.85, doorSide: 'n', doorX: 15.4, color: '#4a5a68' },
  { id: 'servers', name: 'Servers', x: 17, z: 18.55, w: 3.2, d: 7.85, doorSide: 'n', doorX: 18.6, color: '#1a2838' },
  { id: 'operations', name: 'Operations', x: 20.2, z: 18.55, w: 4, d: 7.85, doorSide: 'n', doorX: 22.2, color: '#14303a' },
]

export const BUILDING = { w: 24.2, d: 26.4 }

export const entrance = { x: 1.6, y: -0.85 }
export const entranceDoor = { x: 1.6, y: 0 }
export const waterSpot = { x: 1.6, y: 8.6 }
/** Beside the cooler, so a person operates it instead of standing inside it. */
export const waterApproach = { x: 2.35, y: 8.6 }

export const deskSlots: Record<string, Spot[]> = {
  owner: [],
  executive: [
    { x: 11.1, y: 1.7, facing: 0 },
    { x: 14.4, y: 1.7, facing: 0 },
  ],
  meeting: [],
  sales: [
    { x: 4.4, y: 9.7, facing: Math.PI },
    { x: 7, y: 9.7, facing: Math.PI },
    { x: 4.4, y: 10.8, facing: Math.PI },
    { x: 7, y: 10.8, facing: Math.PI },
  ],
  marketing: [
    { x: 9.6, y: 9.7, facing: Math.PI },
    { x: 12.2, y: 9.7, facing: Math.PI },
    { x: 9.6, y: 10.8, facing: Math.PI },
  ],
  comms: [
    { x: 14.8, y: 9.7, facing: Math.PI },
    { x: 17.4, y: 9.7, facing: Math.PI },
    { x: 14.8, y: 10.8, facing: Math.PI },
  ],
  procurement: [
    { x: 20.1, y: 9.7, facing: Math.PI },
    { x: 22.7, y: 9.7, facing: Math.PI },
    { x: 20.1, y: 10.8, facing: Math.PI },
  ],
  finance: [
    { x: 4.8, y: 15.5, facing: Math.PI },
    { x: 7.8, y: 15.5, facing: Math.PI },
  ],
  people: [
    { x: 11.2, y: 15.5, facing: Math.PI },
    { x: 14.4, y: 15.5, facing: Math.PI },
  ],
  technology: [
    { x: 17.6, y: 15.5, facing: Math.PI },
    { x: 20.2, y: 15.5, facing: Math.PI },
    { x: 22.7, y: 15.5, facing: Math.PI },
  ],
  lounge: [],
  cafeteria: [],
  toilets: [],
  servers: [],
  operations: [
    { x: 21.3, y: 21.2, facing: 0 },
    { x: 23, y: 21.2, facing: 0 },
  ],
  flex: [
    { x: 1.6, y: 3.4, facing: Math.PI / 2 },
    { x: 1.6, y: 14.6, facing: Math.PI / 2 },
  ],
}

export const reportSpots: Spot[] = [
  { x: 4.6, y: 4.2, facing: Math.PI },
  { x: 6.4, y: 4.35, facing: Math.PI },
  { x: 8.2, y: 4.2, facing: Math.PI },
]

/** Seats around the conference table, ordered so a small company still sits on both sides. */
export const meetingRing: Spot[] = [
  { x: 19.75, y: 1.35, facing: 0 },
  { x: 20.55, y: 3.7, facing: Math.PI },
  { x: 18.95, y: 1.35, facing: 0 },
  { x: 21.35, y: 3.7, facing: Math.PI },
  { x: 17.15, y: 2.5, facing: Math.PI / 2 },
  { x: 23.05, y: 2.5, facing: -Math.PI / 2 },
  { x: 18.15, y: 1.35, facing: 0 },
  { x: 22.15, y: 3.7, facing: Math.PI },
  { x: 22.15, y: 1.35, facing: 0 },
  { x: 18.15, y: 3.7, facing: Math.PI },
  { x: 17.15, y: 2.15, facing: Math.PI / 2 },
  { x: 23.05, y: 2.85, facing: -Math.PI / 2 },
  { x: 17.15, y: 2.85, facing: Math.PI / 2 },
  { x: 23.05, y: 2.15, facing: -Math.PI / 2 },
  { x: 19.75, y: 3.7, facing: Math.PI },
  { x: 20.55, y: 1.35, facing: 0 },
]

/** One chair per staff member, up to the seats that fit in the room. */
export function meetingChairs(staffCount: number): Spot[] {
  const count = Math.max(0, Math.min(staffCount, meetingRing.length))
  return meetingRing.slice(0, count)
}

export const meetingSeats: Spot[] = meetingRing
export const meetingGather: (Spot & { sit: boolean })[] = meetingRing.map((spot) => ({ ...spot, sit: true }))
export const ownerSpot = { x: 6.4, y: 2.5 }

/** Couches face each other across the coffee table. */
export const loungeSeats: Spot[] = [
  { x: 4.05, y: 21.2, facing: Math.PI / 2 },
  { x: 4.05, y: 22.4, facing: Math.PI / 2 },
  { x: 7.05, y: 21.2, facing: -Math.PI / 2 },
  { x: 7.05, y: 22.4, facing: -Math.PI / 2 },
]
/** Seated-height bar along the south wall of the lounge. */
export const barSeats: Spot[] = [
  { x: 4.3, y: 25.02, facing: 0 },
  { x: 5.55, y: 25.02, facing: 0 },
  { x: 6.8, y: 25.02, facing: 0 },
]
/** Two dining tables, two chairs on each side. */
export const cafeSeats: Spot[] = [
  { x: 9.45, y: 21.05, facing: 0 },
  { x: 10.55, y: 21.05, facing: 0 },
  { x: 9.45, y: 22.2, facing: Math.PI },
  { x: 10.55, y: 22.2, facing: Math.PI },
  { x: 11.65, y: 21.05, facing: 0 },
  { x: 12.75, y: 21.05, facing: 0 },
  { x: 11.65, y: 22.2, facing: Math.PI },
  { x: 12.75, y: 22.2, facing: Math.PI },
]
export const loungeSpot = loungeSeats[0]
export const cafeSpot = cafeSeats[0]
export const toiletSpot = { x: 14.8, y: 21.4 }
export const serverSpot = { x: 18.6, y: 22.6 }
export const screenSpot = { x: 22.2, y: 23.6 }

type Node = { id: string; x: number; y: number }

const nodes: Node[] = [
  { id: 'H0', x: 1.6, y: 0.7 },
  { id: 'H1', x: 1.6, y: 6.5 },
  { id: 'H2', x: 1.6, y: 8.6 },
  { id: 'H3', x: 1.6, y: 12.3 },
  { id: 'H4', x: 1.6, y: 15.8 },
  { id: 'H5', x: 1.6, y: 17.75 },
  { id: 'owner', x: 6.4, y: 6.25 },
  { id: 'executive', x: 12.8, y: 6.25 },
  { id: 'meeting', x: 20.1, y: 6.25 },
  { id: 'sales', x: 5.8, y: 7.15 },
  { id: 'marketing', x: 11, y: 7.15 },
  { id: 'comms', x: 16.2, y: 7.15 },
  { id: 'procurement', x: 21.5, y: 7.15 },
  { id: 'finance', x: 6.4, y: 12.75 },
  { id: 'people', x: 12.8, y: 12.75 },
  { id: 'technology', x: 20.1, y: 12.75 },
  { id: 'lounge', x: 5.6, y: 18.55 },
  { id: 'cafeteria', x: 11, y: 18.55 },
  { id: 'toilets', x: 15.4, y: 18.55 },
  { id: 'servers', x: 18.6, y: 18.55 },
  { id: 'operations', x: 22.2, y: 18.55 },
]

const links: [string, string][] = [
  ['H0', 'H1'],
  ['H1', 'H2'],
  ['H2', 'H3'],
  ['H3', 'H4'],
  ['H4', 'H5'],
  ['H5', 'lounge'],
  ['lounge', 'cafeteria'],
  ['cafeteria', 'toilets'],
  ['toilets', 'servers'],
  ['servers', 'operations'],
  ['H1', 'owner'],
  ['owner', 'executive'],
  ['executive', 'meeting'],
  ['owner', 'sales'],
  ['executive', 'marketing'],
  ['meeting', 'comms'],
  ['comms', 'procurement'],
  ['sales', 'marketing'],
  ['marketing', 'comms'],
  ['H3', 'finance'],
  ['finance', 'people'],
  ['people', 'technology'],
]

const graph = new Map<string, string[]>()
for (const node of nodes) graph.set(node.id, [])
for (const [a, b] of links) {
  graph.get(a)?.push(b)
  graph.get(b)?.push(a)
}

function nodeById(id: string): Node {
  const found = nodes.find((node) => node.id === id)
  if (!found) throw new Error(`Missing nav node ${id}`)
  return found
}

export function doorPoint(room: RoomBox): Pt {
  const z = room.doorSide === 's' ? room.z + room.d : room.z
  return { x: room.doorX, y: z }
}

export function roomAt(point: Pt): RoomBox | null {
  return (
    rooms.find(
      (room) => point.x >= room.x && point.x <= room.x + room.w && point.y >= room.z && point.y <= room.z + room.d,
    ) ?? null
  )
}

function nearestNode(point: Pt): Node {
  return nodes.reduce((best, node) => (dist(point, node) < dist(point, best) ? node : best))
}

function portal(point: Pt): { door: Pt | null; node: string } {
  if (point.y < 0) return { door: entranceDoor, node: 'H0' }
  const room = roomAt(point)
  if (room) return { door: doorPoint(room), node: room.id }
  return { door: null, node: nearestNode(point).id }
}

function astar(fromId: string, toId: string): string[] {
  if (fromId === toId) return [fromId]
  const open = [fromId]
  const came = new Map<string, string>()
  const score = new Map<string, number>([[fromId, 0]])
  while (open.length > 0) {
    open.sort((a, b) => (score.get(a) ?? 0) - (score.get(b) ?? 0))
    const current = open.shift()
    if (!current) break
    if (current === toId) break
    for (const next of graph.get(current) ?? []) {
      const step = dist(nodeById(current), nodeById(next))
      const nextScore = (score.get(current) ?? 0) + step
      if (nextScore < (score.get(next) ?? Infinity)) {
        score.set(next, nextScore)
        came.set(next, current)
        if (!open.includes(next)) open.push(next)
      }
    }
  }
  const path = [toId]
  let cursor = toId
  while (came.has(cursor)) {
    cursor = came.get(cursor) as string
    path.push(cursor)
  }
  path.reverse()
  if (path[0] !== fromId) return [fromId, toId]
  return path
}

function dedupe(points: Pt[]): Pt[] {
  const result: Pt[] = []
  for (const point of points) {
    const prev = result[result.length - 1]
    if (!prev || dist(prev, point) > 0.08) result.push(point)
  }
  return result
}

type Box = { x: number; y: number; w: number; d: number }

/** Tables, the cooler, and the meeting table. Chairs stay walkable. */
export function furnitureBoxes(): Box[] {
  const boxes: Box[] = []
  for (const [roomId, slots] of Object.entries(deskSlots)) {
    if (roomId === 'meeting' || roomId === 'owner') continue
    for (const slot of slots) {
      const cx = slot.x + Math.sin(slot.facing) * 0.5
      const cy = slot.y + Math.cos(slot.facing) * 0.5
      boxes.push({ x: cx - 0.58, y: cy - 0.34, w: 1.16, d: 0.68 })
    }
  }
  boxes.push({ x: 5.15, y: 2.15, w: 2.5, d: 1.15 })
  boxes.push({ x: 17.55, y: 1.7, w: 5.1, d: 1.6 })
  boxes.push({ x: waterSpot.x - 0.24, y: waterSpot.y - 0.24, w: 0.48, d: 0.48 })
  boxes.push({ x: 3.38, y: 20.72, w: 0.48, d: 2.16 })
  boxes.push({ x: 7.24, y: 20.72, w: 0.52, d: 2.16 })
  boxes.push({ x: 4.95, y: 21.48, w: 1.2, d: 0.64 })
  boxes.push({ x: 3.4, y: 25.42, w: 4.3, d: 0.62 })
  boxes.push({ x: 9.15, y: 21.32, w: 1.7, d: 0.62 })
  boxes.push({ x: 11.35, y: 21.32, w: 1.7, d: 0.62 })
  boxes.push({ x: 8.55, y: 25.35, w: 4.9, d: 0.72 })
  boxes.push({ x: 16.15, y: 20.3, w: 0.7, d: 1.15 })
  boxes.push({ x: 16.15, y: 22.1, w: 0.7, d: 1.15 })
  boxes.push({ x: 16.15, y: 23.9, w: 0.7, d: 1.15 })
  boxes.push({ x: 17.15, y: 20.3, w: 0.55, d: 5.2 })
  boxes.push({ x: 19.45, y: 20.3, w: 0.55, d: 5.2 })
  boxes.push({ x: 20.45, y: 25.55, w: 3.5, d: 0.35 })
  for (const room of rooms) {
    const z = room.doorSide === 's' ? room.z + room.d : room.z
    const sign = room.doorSide === 's' ? 1 : -1
    const cx = room.doorX - 1.05 * sign
    const cy = z - 0.06 * sign
    boxes.push({ x: cx - 0.46, y: cy - 0.12, w: 0.92, d: 0.24 })
  }
  boxes.push({ x: 0.1, y: -0.2, w: 0.9, d: 0.24 })
  return boxes
}

const CELL = 0.42
type Grid = { originX: number; originY: number; cols: number; rows: number; cells: Uint8Array }
let walkGrid: Grid | null = null

function ensureGrid(): Grid {
  if (walkGrid) return walkGrid
  const originX = -7.2
  const originY = -2.8
  const maxX = BUILDING.w + 0.6
  const maxY = BUILDING.d + 0.4
  const cols = Math.ceil((maxX - originX) / CELL)
  const rows = Math.ceil((maxY - originY) / CELL)
  const cells = new Uint8Array(cols * rows)
  const walls = wallSolids()
  const furniture = furnitureBoxes()
  for (let iy = 0; iy < rows; iy += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const x = originX + ix * CELL
      const y = originY + iy * CELL
      let block = false
      const onSidewalk = y < 0.15 && y > -2.5 && x > -1.3 && x < BUILDING.w - 0.35
      const westAisle = x > -1.8 && x < -0.2 && y >= -0.35 && y < BUILDING.d - 0.2
      const indoors = x > 0.3 && x < BUILDING.w - 0.3 && y > 0.15 && y < BUILDING.d - 0.28
      if (!onSidewalk && !westAisle && !indoors) block = true
      if (!block) {
        const pad = CELL * 0.62
        for (const wall of walls) {
          if (x > wall.x - pad && x < wall.x + wall.w + pad && y > wall.z - pad && y < wall.z + wall.d + pad) {
            block = true
            break
          }
        }
      }
      if (!block) {
        for (const box of furniture) {
          if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.d) {
            block = true
            break
          }
        }
      }
      cells[iy * cols + ix] = block ? 1 : 0
    }
  }
  const pins: Pt[] = [waterApproach, ...loungeSeats, ...barSeats, ...cafeSeats, toiletSpot, serverSpot, screenSpot, ...reportSpots, ...meetingRing]
  for (const slots of Object.values(deskSlots)) pins.push(...slots)
  for (const pin of pins) {
    const ix = Math.round((pin.x - originX) / CELL)
    const iy = Math.round((pin.y - originY) / CELL)
    if (ix >= 0 && iy >= 0 && ix < cols && iy < rows) cells[iy * cols + ix] = 0
  }
  for (const pin of [entrance, entranceDoor, ...rooms.map(doorPoint)]) {
    const ix = Math.round((pin.x - originX) / CELL)
    const iy = Math.round((pin.y - originY) / CELL)
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = ix + dx
        const y = iy + dy
        if (x >= 0 && y >= 0 && x < cols && y < rows) cells[y * cols + x] = 0
      }
    }
  }
  walkGrid = { originX, originY, cols, rows, cells }
  return walkGrid
}

function cellAt(grid: Grid, point: Pt): { ix: number; iy: number } | null {
  const ix = Math.round((point.x - grid.originX) / CELL)
  const iy = Math.round((point.y - grid.originY) / CELL)
  if (ix < 0 || iy < 0 || ix >= grid.cols || iy >= grid.rows) return null
  return { ix, iy }
}

function nearestOpen(grid: Grid, point: Pt): { ix: number; iy: number } | null {
  const origin = cellAt(grid, point)
  if (!origin) return null
  if (grid.cells[origin.iy * grid.cols + origin.ix] === 0) return origin
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let iy = origin.iy - radius; iy <= origin.iy + radius; iy += 1) {
      for (let ix = origin.ix - radius; ix <= origin.ix + radius; ix += 1) {
        if (ix < 0 || iy < 0 || ix >= grid.cols || iy >= grid.rows) continue
        if (grid.cells[iy * grid.cols + ix] === 0) return { ix, iy }
      }
    }
  }
  return null
}

function segmentClear(grid: Grid, a: Pt, b: Pt): boolean {
  const steps = Math.max(1, Math.ceil(dist(a, b) / (CELL * 0.45)))
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    const cell = cellAt(grid, point)
    if (!cell || grid.cells[cell.iy * grid.cols + cell.ix] === 1) return false
  }
  return true
}

function smooth(grid: Grid, points: Pt[]): Pt[] {
  if (points.length < 3) return points
  const kept: Pt[] = [points[0]]
  let cursor = 0
  while (cursor < points.length - 1) {
    let farthest = cursor + 1
    for (let index = points.length - 1; index > cursor + 1; index -= 1) {
      if (segmentClear(grid, points[cursor], points[index])) {
        farthest = index
        break
      }
    }
    kept.push(points[farthest])
    cursor = farthest
  }
  return kept
}

function gridRoute(from: Pt, to: Pt): Pt[] | null {
  const grid = ensureGrid()
  const start = nearestOpen(grid, from)
  const goal = nearestOpen(grid, to)
  if (!start || !goal) return null
  const key = (ix: number, iy: number) => iy * grid.cols + ix
  const open = [key(start.ix, start.iy)]
  const came = new Map<number, number>()
  const score = new Map<number, number>([[key(start.ix, start.iy), 0]])
  const goalKey = key(goal.ix, goal.iy)
  while (open.length > 0) {
    open.sort((a, b) => (score.get(a) ?? 0) - (score.get(b) ?? 0))
    const current = open.shift()
    if (current === undefined) break
    if (current === goalKey) break
    const ix = current % grid.cols
    const iy = Math.floor(current / grid.cols)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = ix + dx
      const ny = iy + dy
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue
      if (grid.cells[ny * grid.cols + nx] === 1) continue
      const nextKey = key(nx, ny)
      const nextScore = (score.get(current) ?? 0) + 1
      if (nextScore < (score.get(nextKey) ?? Infinity)) {
        score.set(nextKey, nextScore)
        came.set(nextKey, current)
        if (!open.includes(nextKey)) open.push(nextKey)
      }
    }
  }
  if (!came.has(goalKey) && key(start.ix, start.iy) !== goalKey) return null
  const chain = [goalKey]
  let cursor = goalKey
  while (came.has(cursor)) {
    cursor = came.get(cursor) as number
    chain.push(cursor)
  }
  chain.reverse()
  const points = chain.map((id) => ({
    x: grid.originX + (id % grid.cols) * CELL,
    y: grid.originY + Math.floor(id / grid.cols) * CELL,
  }))
  return stampDoors(smooth(grid, dedupe([from, ...points, to])))
}

/** A shortened path can skip the cell in the middle of a doorway. Put that point back. */
function stampDoors(points: Pt[]): Pt[] {
  const doors = [entranceDoor, ...rooms.map(doorPoint)]
  const out: Pt[] = []
  for (let index = 0; index < points.length; index += 1) {
    out.push(points[index])
    if (index === points.length - 1) break
    const next = points[index + 1]
    const hits = doors
      .filter((door) => closestOnSegment(points[index], next, door) < 0.65)
      .sort((a, b) => dist(points[index], a) - dist(points[index], b))
    out.push(...hits)
  }
  return dedupe(out)
}

function closestOnSegment(a: Pt, b: Pt, point: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  if (length < 1e-6) return dist(a, point)
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
  return dist({ x: a.x + dx * t, y: a.y + dy * t }, point)
}

function doorRoute(from: Pt, to: Pt): Pt[] {
  const startRoom = roomAt(from)
  const endRoom = roomAt(to)
  if (startRoom && startRoom === endRoom) return dedupe([from, to])
  const start = portal(from)
  const end = portal(to)
  const through = astar(start.node, end.node).map((id) => nodeById(id))
  const points: Pt[] = [from]
  if (start.door) points.push(start.door)
  points.push(...through)
  if (end.door) points.push(end.door)
  points.push(to)
  return dedupe(points)
}

/** Walks through door gaps and around tables. Falls back to the corridor graph. */
export function route(from: Pt, to: Pt): Pt[] {
  return gridRoute(from, to) ?? doorRoute(from, to)
}

export function chatPair(room: RoomBox): [Pt, Pt] {
  const y = room.doorSide === 's' ? room.z + room.d - 0.8 : room.z + 0.8
  const x = room.x + room.w * 0.5
  return [
    { x: x - 0.45, y },
    { x: x + 0.45, y },
  ]
}

export function commuteStop(index: number, ride: 'drive' | 'drop' | 'bus'): Pt {
  if (ride === 'drive') {
    const col = index % 2
    const row = Math.floor(index / 2) % 6
    return { x: -4.7 + col * 2.35, y: 2.1 + row * 2.2 }
  }
  if (ride === 'bus') return { x: 19.2, y: -1.45 }
  return { x: 7.5 + (index % 5) * 1.7, y: -1.45 }
}

export function commuteStart(index: number, ride: 'drive' | 'drop' | 'bus'): Pt {
  const stop = commuteStop(index, ride)
  if (ride === 'drive') return { x: -1.15, y: stop.y }
  return { x: stop.x, y: stop.y + 0.5 }
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function pathLength(path: Pt[]): number {
  let total = 0
  for (let index = 1; index < path.length; index += 1) total += dist(path[index - 1], path[index])
  return total
}

export function pointAlong(path: Pt[], t: number): Pt {
  if (path.length === 0) return { x: 0, y: 0 }
  if (path.length === 1 || t <= 0) return path[0]
  const lengths: number[] = []
  let total = 0
  for (let index = 1; index < path.length; index += 1) {
    const step = dist(path[index - 1], path[index])
    lengths.push(step)
    total += step
  }
  if (total === 0 || t >= 1) return path[path.length - 1]
  let remain = total * t
  for (let index = 1; index < path.length; index += 1) {
    const step = lengths[index - 1]
    if (remain <= step) {
      const u = step === 0 ? 0 : remain / step
      return {
        x: path[index - 1].x + (path[index].x - path[index - 1].x) * u,
        y: path[index - 1].y + (path[index].y - path[index - 1].y) * u,
      }
    }
    remain -= step
  }
  return path[path.length - 1]
}

export function positionAt(presence: Presence, now: number): Pt {
  if (presence.path.length === 0) return { x: presence.x, y: presence.y }
  if (presence.movingUntil <= now) return { x: presence.x, y: presence.y }
  const span = presence.movingUntil - presence.pathFrom
  if (span <= 0) return { x: presence.x, y: presence.y }
  const t = Math.min(1, Math.max(0, (now - presence.pathFrom) / span))
  return pointAlong(presence.path, t)
}

export function travelMs(reduced: boolean, from: Pt, to: Pt): number {
  if (reduced) return 0
  return Math.max(2600, Math.round((pathLength(route(from, to)) / 1.45) * 1000))
}

export function nextDesk(roomId: string, taken: Pt[]) {
  const slots = deskSlots[roomId] ?? deskSlots.flex
  const free = slots.find((slot) => !taken.some((point) => point.x === slot.x && point.y === slot.y))
  if (free) return { roomId: roomId in deskSlots ? roomId : 'flex', x: free.x, y: free.y }
  const overflow = deskSlots.flex[taken.length % deskSlots.flex.length]
  return { roomId: 'flex', x: overflow.x, y: overflow.y }
}

export function facingAt(roomId: string, point: Pt): number {
  const slot = (deskSlots[roomId] ?? []).find((item) => item.x === point.x && item.y === point.y)
  return slot?.facing ?? 0
}

export type Solid = { x: number; z: number; w: number; d: number }

function splitRun(start: number, length: number, gaps: { center: number; width: number }[]): [number, number][] {
  const end = start + length
  let cursor = start
  const parts: [number, number][] = []
  for (const gap of [...gaps].sort((a, b) => a.center - b.center)) {
    const gapStart = gap.center - gap.width / 2
    const gapEnd = gap.center + gap.width / 2
    if (gapStart - cursor > 0.05) parts.push([cursor, gapStart - cursor])
    cursor = Math.max(cursor, gapEnd)
  }
  if (end - cursor > 0.05) parts.push([cursor, end - cursor])
  return parts
}

/** Wall rectangles in plan. Doors are the gaps. */
export function wallSolids(): Solid[] {
  const t = 0.14
  const solids: Solid[] = []
  const alongX = (z: number, x: number, length: number, gaps: { center: number; width: number }[]) => {
    for (const [start, width] of splitRun(x, length, gaps)) solids.push({ x: start, z, w: width, d: t })
  }
  const alongZ = (x: number, z: number, length: number, gaps: { center: number; width: number }[]) => {
    for (const [start, depth] of splitRun(z, length, gaps)) solids.push({ x, z: start, w: t, d: depth })
  }

  alongX(-t, 0, BUILDING.w, [{ center: entranceDoor.x, width: DOOR }])
  alongX(BUILDING.d, 0, BUILDING.w, [])
  alongZ(-t, 0, BUILDING.d, [])
  alongZ(BUILDING.w, 0, BUILDING.d, [])

  alongX(5.5 - t / 2, 3.2, 21, [
    { center: 6.4, width: DOOR },
    { center: 12.8, width: DOOR },
    { center: 20.1, width: DOOR },
  ])
  alongX(7.65 - t / 2, 3.2, 21, [
    { center: 5.8, width: DOOR },
    { center: 11, width: DOOR },
    { center: 16.2, width: DOOR },
    { center: 21.5, width: DOOR },
  ])
  alongX(11.35 - t / 2, 3.2, 21, [])
  alongX(13.4 - t / 2, 3.2, 21, [
    { center: 6.4, width: DOOR },
    { center: 12.8, width: DOOR },
    { center: 20.1, width: DOOR },
  ])
  alongX(17 - t / 2, 3.2, 21, [])

  alongZ(3.2 - t / 2, 0, 5.5, [])
  alongZ(9.6 - t / 2, 0, 5.5, [])
  alongZ(16 - t / 2, 0, 5.5, [])
  alongZ(3.2 - t / 2, 7.65, 3.7, [])
  alongZ(8.4 - t / 2, 7.65, 3.7, [])
  alongZ(13.6 - t / 2, 7.65, 3.7, [])
  alongZ(18.8 - t / 2, 7.65, 3.7, [])
  alongZ(3.2 - t / 2, 13.4, 3.6, [])
  alongZ(9.6 - t / 2, 13.4, 3.6, [])
  alongZ(16 - t / 2, 13.4, 3.6, [])

  alongZ(3.2 - t / 2, 17, BUILDING.d - 17, [{ center: 17.75, width: DOOR }])
  alongX(18.55 - t / 2, 3.2, 21, [
    { center: 5.6, width: DOOR },
    { center: 11, width: DOOR },
    { center: 15.4, width: DOOR },
    { center: 18.6, width: DOOR },
    { center: 22.2, width: DOOR },
  ])
  alongZ(8.2 - t / 2, 18.55, 7.85, [])
  alongZ(13.8 - t / 2, 18.55, 7.85, [])
  alongZ(17 - t / 2, 18.55, 7.85, [])
  alongZ(20.2 - t / 2, 18.55, 7.85, [])

  return solids
}

export const salesDoor = doorPoint(rooms.find((room) => room.id === 'sales') as RoomBox)
export const procurementDoor = doorPoint(rooms.find((room) => room.id === 'procurement') as RoomBox)
