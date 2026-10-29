import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Group, type Mesh } from 'three'
import type { Staff } from '../types'
import { BUILDING, commuteStop } from './world'

type Props = {
  lit: boolean
  minute: number
  openMinute: number
  staff: Staff[]
  now: number
}

export function City({ lit, minute, openMinute, staff, now }: Props) {
  const traffic = useRef<Group>(null)
  const windowMap = useMemo(() => windowTexture(), [])
  useFrame(({ clock }) => {
    const root = traffic.current
    if (!root) return
    root.children.forEach((child, index) => {
      const mesh = child as Mesh
      const span = 46
      const speed = index % 5 === 0 ? 1.6 : 2.4 + (index % 3) * 0.35
      const offset = (index * 7.5) % span
      mesh.position.x = ((clock.elapsedTime * speed + offset) % span) - 12
      mesh.position.z = index % 2 === 0 ? -4.15 : -5.55
    })
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[BUILDING.w / 2, -0.04, 2]} receiveShadow>
        <planeGeometry args={[78, 52]} />
        <meshStandardMaterial color={lit ? '#8ea0a4' : '#1a242c'} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[BUILDING.w / 2, -0.02, -4.9]}>
        <planeGeometry args={[70, 3.4]} />
        <meshStandardMaterial color="#2a3138" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3.7, -0.025, 8.2]} receiveShadow>
        <planeGeometry args={[6.4, 14.5]} />
        <meshStandardMaterial color={lit ? '#3a4248' : '#161c22'} />
      </mesh>
      {[2.2, 4.4, 6.6, 8.8, 11, 13.2].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[-3.7, -0.01, z]}>
          <planeGeometry args={[5.6, 0.08]} />
          <meshStandardMaterial color="#d7dde2" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[BUILDING.w / 2, -0.01, -1.15]}>
        <planeGeometry args={[BUILDING.w + 2, 2.1]} />
        <meshStandardMaterial color={lit ? '#c5ccc6' : '#2c3534'} />
      </mesh>
      {[-8, 4, 16, 28].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.005, -4.9]}>
          <planeGeometry args={[1.6, 0.12]} />
          <meshStandardMaterial color="#d7dde2" />
        </mesh>
      ))}
      <Tower x={-8} z={-12} h={7} w={4.2} d={3.2} map={windowMap} lit={lit} />
      <Tower x={-2} z={-14.5} h={10} w={3.4} d={3} map={windowMap} lit={lit} />
      <Tower x={8} z={-13} h={6} w={5} d={3.2} map={windowMap} lit={lit} />
      <Tower x={18} z={-14} h={9} w={3.6} d={3} map={windowMap} lit={lit} />
      <Tower x={28} z={-12.5} h={7.5} w={4} d={3.4} map={windowMap} lit={lit} />
      <Tower x={34} z={-9} h={5} w={3} d={3} map={windowMap} lit={lit} />
      {[2, 10, 22, 30].map((x) => (
        <group key={x} position={[x, 0, -2.35]}>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 0.7, 8]} />
            <meshStandardMaterial color="#6d5a45" />
          </mesh>
          <mesh position={[0, 1.05, 0]}>
            <sphereGeometry args={[0.42, 12, 12]} />
            <meshStandardMaterial color="#2f6b45" />
          </mesh>
        </group>
      ))}
      <group ref={traffic}>
        {['#d4524a', '#3a6ea5', '#e6e2d8', '#1f1f1f', '#c9a227', '#4caf88'].map((color, index) => (
          <Car key={color} color={color} long={index === 0} />
        ))}
      </group>
      <Walkers lit={lit} />
      {staff.map((person, index) => (
        <Commute
          key={person.id}
          person={person}
          index={index}
          minute={minute}
          openMinute={openMinute}
          now={now}
        />
      ))}
    </group>
  )
}

function showVehicle(person: Staff, minute: number, openMinute: number, now: number): 'parked' | 'curb' | null {
  const due = openMinute + person.life.commute
  const soon = person.presence.pose === 'away' && minute >= due - 4 && minute <= due + 2
  const arriving = person.presence.lifeIntent === 'arrive' && person.presence.movingUntil > now
  const onSite = person.presence.pose !== 'away'
  if (person.life.ride === 'drive' && (soon || arriving || onSite)) return 'parked'
  if ((person.life.ride === 'drop' || person.life.ride === 'bus') && (soon || arriving)) return 'curb'
  return null
}

function Commute({
  person,
  index,
  minute,
  openMinute,
  now,
}: {
  person: Staff
  index: number
  minute: number
  openMinute: number
  now: number
}) {
  const mode = showVehicle(person, minute, openMinute, now)
  if (!mode) return null
  const stop = commuteStop(index, person.life.ride)
  if (person.life.ride === 'bus') {
    return (
      <group position={[stop.x, 0, stop.y]}>
        <Car color="#d8a31a" long />
      </group>
    )
  }
  const color = person.life.ride === 'drive' ? '#1f4d6e' : '#c4554a'
  return (
    <group position={[stop.x, 0, stop.y]}>
      <Car color={color} />
    </group>
  )
}

function Car({ color, long = false }: { color: string; long?: boolean }) {
  const length = long ? 2.4 : 1.35
  return (
    <group>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[length, 0.38, 0.72]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[long ? 0.1 : 0.05, 0.58, 0]}>
        <boxGeometry args={[length * 0.48, 0.32, 0.64]} />
        <meshStandardMaterial color="#d5e7ef" />
      </mesh>
      <mesh position={[length * 0.32, 0.16, 0.32]}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 10]} />
        <meshStandardMaterial color="#1b1b1b" />
      </mesh>
      <mesh position={[-length * 0.32, 0.16, 0.32]}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 10]} />
        <meshStandardMaterial color="#1b1b1b" />
      </mesh>
    </group>
  )
}

function Walkers({ lit }: { lit: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const root = ref.current
    if (!root) return
    root.children.forEach((child, index) => {
      const span = 28
      const dir = index % 2 === 0 ? 1 : -1
      const x = ((clock.elapsedTime * 0.55 * dir + index * 6) % span + span) % span - 2
      child.position.x = x
      child.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2
    })
  })
  return (
    <group ref={ref}>
      {['#355c7d', '#c47b4a', '#3d6b4f', '#8a4b78'].map((color, index) => (
        <group key={color} position={[index, 0, -2.15]}>
          <mesh position={[0, 0.85, 0]}>
            <capsuleGeometry args={[0.12, 0.32, 4, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 1.22, 0]}>
            <sphereGeometry args={[0.11, 10, 10]} />
            <meshStandardMaterial color={lit ? '#e6c2a2' : '#8d6b52'} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Tower({
  x,
  z,
  h,
  w,
  d,
  map,
  lit,
}: {
  x: number
  z: number
  h: number
  w: number
  d: number
  map: ReturnType<typeof windowTexture>
  lit: boolean
}) {
  return (
    <mesh position={[x, h / 2, z]} castShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={lit ? '#243246' : '#121820'} map={map} emissive="#132033" emissiveIntensity={lit ? 0.35 : 0.7} />
    </mesh>
  )
}

function windowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the skyline')
  ctx.fillStyle = '#1a2433'
  ctx.fillRect(0, 0, 64, 128)
  for (let y = 8; y < 128; y += 16) {
    for (let x = 6; x < 64; x += 14) {
      ctx.fillStyle = (x + y) % 28 === 0 ? '#f2d48a' : '#8fd0e8'
      ctx.fillRect(x, y, 7, 9)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}
