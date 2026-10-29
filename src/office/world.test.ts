import { describe, expect, it } from 'vitest'
import { deskSlots, dist, doorPoint, entranceDoor, furnitureBoxes, procurementDoor, rooms, route, salesDoor, serverSpot } from './world'

describe('office routes', () => {
  it('walks from sales to procurement through both doors', () => {
    const path = route(deskSlots.sales[0], deskSlots.procurement[0])
    expect(path.length).toBeGreaterThan(3)
    expect(path.some((point) => dist(point, salesDoor) < 0.7)).toBe(true)
    expect(path.some((point) => dist(point, procurementDoor) < 0.7)).toBe(true)
    const straight = dist(deskSlots.sales[0], deskSlots.procurement[0])
    expect(path.reduce((total, point, index) => (index === 0 ? 0 : total + dist(path[index - 1], point)), 0)).toBeGreaterThan(straight)
  })

  it('goes around the desk in front of a chair and still uses the front door', () => {
    const path = route(deskSlots.sales[2], salesDoor)
    const table = furnitureBoxes().find((box) => box.x < 5 && box.y > 8 && box.y < 10)
    expect(table).toBeTruthy()
    const center = { x: (table?.x ?? 0) + (table?.w ?? 0) / 2, y: (table?.y ?? 0) + (table?.d ?? 0) / 2 }
    for (let index = 1; index < path.length; index += 1) {
      const steps = 8
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps
        const point = {
          x: path[index - 1].x + (path[index].x - path[index - 1].x) * t,
          y: path[index - 1].y + (path[index].y - path[index - 1].y) * t,
        }
        expect(dist(point, center)).toBeGreaterThan(0.28)
      }
    }
    const fromStreet = route({ x: 6.4, y: -1.2 }, deskSlots.sales[0])
    expect(fromStreet.some((point) => dist(point, entranceDoor) < 0.8)).toBe(true)
  })

  it('reaches the server room through its door', () => {
    const door = doorPoint(rooms.find((room) => room.id === 'servers') as (typeof rooms)[number])
    const path = route(deskSlots.technology[0], serverSpot)
    expect(path.some((point) => dist(point, door) < 0.8)).toBe(true)
  })
})
