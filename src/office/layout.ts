export type Room = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

/** Percentages of the floor. Characters use the same coordinate space so walks cross rooms. */
export const rooms: Room[] = [
  { id: 'owner', name: 'Owner', x: 1, y: 2, w: 23, h: 29 },
  { id: 'executive', name: 'Executive', x: 25, y: 2, w: 23, h: 29 },
  { id: 'meeting', name: 'Meeting', x: 49, y: 2, w: 50, h: 29 },
  { id: 'sales', name: 'Sales', x: 1, y: 33, w: 23, h: 30 },
  { id: 'marketing', name: 'Marketing', x: 25, y: 33, w: 23, h: 30 },
  { id: 'comms', name: 'Communications', x: 49, y: 33, w: 23, h: 30 },
  { id: 'procurement', name: 'Procurement', x: 73, y: 33, w: 26, h: 30 },
  { id: 'finance', name: 'Finance', x: 1, y: 65, w: 23, h: 33 },
  { id: 'people', name: 'People', x: 25, y: 65, w: 23, h: 33 },
  { id: 'technology', name: 'Technology', x: 49, y: 65, w: 35, h: 33 },
  { id: 'flex', name: 'Flex', x: 85, y: 65, w: 14, h: 33 },
]

export const deskSlots: Record<string, { x: number; y: number }[]> = {
  executive: [
    { x: 36, y: 16 },
    { x: 36, y: 24 },
  ],
  sales: [
    { x: 8, y: 44 },
    { x: 16, y: 44 },
    { x: 8, y: 55 },
    { x: 16, y: 55 },
  ],
  marketing: [
    { x: 32, y: 44 },
    { x: 40, y: 44 },
    { x: 32, y: 55 },
    { x: 40, y: 55 },
  ],
  comms: [
    { x: 56, y: 44 },
    { x: 64, y: 44 },
    { x: 56, y: 55 },
    { x: 64, y: 55 },
  ],
  procurement: [
    { x: 80, y: 44 },
    { x: 90, y: 44 },
    { x: 80, y: 55 },
    { x: 90, y: 55 },
  ],
  finance: [
    { x: 8, y: 78 },
    { x: 16, y: 78 },
    { x: 8, y: 90 },
  ],
  people: [
    { x: 32, y: 78 },
    { x: 40, y: 78 },
    { x: 32, y: 90 },
  ],
  technology: [
    { x: 56, y: 78 },
    { x: 66, y: 78 },
    { x: 76, y: 78 },
    { x: 56, y: 90 },
    { x: 66, y: 90 },
  ],
  flex: [
    { x: 90, y: 78 },
    { x: 90, y: 90 },
  ],
}

export const meetingSeats = [
  { x: 60, y: 12 },
  { x: 72, y: 12 },
  { x: 84, y: 12 },
  { x: 60, y: 22 },
  { x: 72, y: 22 },
  { x: 84, y: 22 },
]

export const reportSpots = [
  { x: 12, y: 27 },
  { x: 20, y: 27 },
  { x: 6, y: 27 },
]

export const ownerSpot = { x: 6, y: 8 }

export function nextDesk(roomId: string, taken: { x: number; y: number }[]) {
  const slots = deskSlots[roomId] ?? deskSlots.flex
  const free = slots.find((slot) => !taken.some((point) => point.x === slot.x && point.y === slot.y))
  if (free) return { roomId: roomId in deskSlots ? roomId : 'flex', ...free }
  const overflow = deskSlots.flex[taken.length % deskSlots.flex.length]
  return { roomId: 'flex', x: overflow.x, y: overflow.y }
}
