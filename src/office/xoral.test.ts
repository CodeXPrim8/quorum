import { describe, expect, it } from 'vitest'
import {
  BLOCKS,
  BRIDGES,
  CANAL,
  ESTATES,
  HOUSES,
  LAMPS,
  LOTS,
  RING,
  ROADS,
  TOLLS,
  LANDING,
  RUNWAY,
  WALK,
  lampClearsOffice,
  missesOffice,
  nextProgress,
  nightAmount,
  pointOnLoop,
  pointOnWalk,
} from './xoral-layout'

describe('Xoral City layout', () => {
  it('keeps roads, towers, and lots outside the office block', () => {
    for (const point of RING) expect(missesOffice(point[0], point[1])).toBe(true)
    for (const block of BLOCKS) expect(missesOffice(block.x, block.z)).toBe(true)
    for (const lot of LOTS) expect(missesOffice(lot.x, lot.z)).toBe(true)
    for (const house of HOUSES) expect(missesOffice(house.x, house.z)).toBe(true)
    for (const estate of ESTATES) expect(missesOffice(estate.x, estate.z)).toBe(true)
    for (const bridge of BRIDGES) expect(missesOffice(bridge.x, bridge.z)).toBe(true)
    for (const toll of TOLLS) expect(missesOffice(toll.x, toll.z)).toBe(true)
    expect(missesOffice((CANAL.x0 + CANAL.x1) / 2, CANAL.z)).toBe(true)
    for (const road of ROADS) {
      const steps = Math.max(2, Math.ceil(Math.hypot(road.b[0] - road.a[0], road.b[1] - road.a[1]) / 4))
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps
        const x = road.a[0] + (road.b[0] - road.a[0]) * t
        const z = road.a[1] + (road.b[1] - road.a[1]) * t
        expect(missesOffice(x, z)).toBe(true)
      }
    }
    for (const lamp of LAMPS) expect(lampClearsOffice(lamp)).toBe(true)
    for (const block of BLOCKS) {
      expect(Math.abs(block.z - RUNWAY.z)).toBeGreaterThan(40)
      expect(Math.abs(block.z - LANDING.z)).toBeGreaterThan(40)
    }
  })

  it('is bright at noon and dark at night', () => {
    expect(nightAmount(12)).toBe(0)
    expect(nightAmount(22)).toBe(1)
    expect(nightAmount(18.5)).toBeGreaterThan(0)
    expect(nightAmount(18.5)).toBeLessThan(1)
  })

  it('keeps the promenade outside the office and on the footbridges', () => {
    for (const point of WALK) expect(missesOffice(point[0], point[1])).toBe(true)
    for (const bridge of BRIDGES.filter((item) => item.kind === 'foot')) {
      const joined = WALK.some((point) => Math.hypot(point[0] - bridge.x, point[1] - bridge.z) < 3)
      expect(joined).toBe(true)
    }
    const start = pointOnWalk(WALK, 0)
    const ahead = pointOnWalk(WALK, 6)
    expect(Math.hypot(start.x - ahead.x, start.z - ahead.z)).toBeGreaterThan(2)
  })

  it('follows the ring without jumping', () => {
    const a = pointOnLoop(RING, 0, 1.5)
    const b = pointOnLoop(RING, 4, 1.5)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(8)
  })

  it('stops a car for a red light or a car ahead', () => {
    expect(nextProgress(10, 20, true, 8, 0.1)).toBe(10)
    expect(nextProgress(10, 4, false, 8, 0.1)).toBe(10)
    expect(nextProgress(10, 6, false, 8, 0.1)).toBeGreaterThan(10)
    expect(nextProgress(10, 6, false, 8, 0.1)).toBeLessThan(nextProgress(10, 20, false, 8, 0.1))
  })
})