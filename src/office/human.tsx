import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { isTyping } from '../domain/selectors'
import { personGivenName } from '../domain/staff-names'
import type { AppState, Staff } from '../types'
import { NameBadge } from './name-badge'
import { barSeats, cafeSeats, deskSlots, loungeSeats, meetingRing, positionAt, waterSpot } from './world'

type Props = {
  state: AppState
  person: Staff
  now: number
  dim: boolean
  onOpen: () => void
}

export function Human({ state, person, now, dim, onOpen }: Props) {
  const ref = useRef<Group>(null)
  const leftArm = useRef<Group>(null)
  const rightArm = useRef<Group>(null)
  const leftLeg = useRef<Group>(null)
  const rightLeg = useRef<Group>(null)
  const cup = useRef<Group>(null)
  const phase = useRef(0)
  const typing = isTyping(state, person, now)
  const walkingNow = now < person.presence.movingUntil && person.presence.path.length > 1

  useFrame((_, delta) => {
    const root = ref.current
    if (!root) return
    const walking = Date.now() < person.presence.movingUntil && person.presence.path.length > 1
    const here = positionAt(person.presence, Date.now())
    const away = !walking && person.presence.pose === 'away'
    root.visible = !away
    root.position.x = here.x
    root.position.z = here.y
    const onCall = person.presence.pose === 'call'
    const sit = !walking && (person.presence.pose === 'sit' || onCall)
    const drink = !walking && person.presence.pose === 'drink'
    const attention = !walking && person.presence.pose === 'attention'
    root.position.y = sit ? -0.22 : 0
    if (walking && person.presence.path.length > 1) {
      const ahead = positionAt(person.presence, Date.now() + 180)
      root.rotation.y = Math.atan2(ahead.x - here.x, ahead.y - here.y)
      phase.current += delta * 8
      const swing = Math.sin(phase.current) * 0.7
      if (leftLeg.current && rightLeg.current) {
        leftLeg.current.rotation.x = swing
        rightLeg.current.rotation.x = -swing
      }
      if (leftArm.current && rightArm.current) {
        leftArm.current.position.set(-0.2, 1.12, 0)
        rightArm.current.position.set(0.2, 1.12, 0)
        leftArm.current.rotation.x = -swing * 0.7
        rightArm.current.rotation.x = swing * 0.7
      }
    } else {
      if (leftLeg.current && rightLeg.current) {
        leftLeg.current.rotation.x = sit ? 1.45 : 0
        rightLeg.current.rotation.x = sit ? 1.45 : 0
      }
      const typeWave = typing ? Math.sin(Date.now() / 140) * 0.1 : 0
      const breakSeat = [...loungeSeats, ...barSeats, ...cafeSeats].find((item) => item.x === person.presence.x && item.y === person.presence.y)
      const eating = sit && cafeSeats.some((item) => item.x === person.presence.x && item.y === person.presence.y)
      const lounging = sit && breakSeat && !eating
      if (leftArm.current && rightArm.current) {
        leftArm.current.rotation.z = 0
        rightArm.current.rotation.z = 0
        if (attention) {
          const wave = Math.sin(Date.now() / 160) * 0.28
          leftArm.current.position.set(-0.16, 1.46, 0.02)
          rightArm.current.position.set(0.16, 1.46, 0.02)
          leftArm.current.rotation.x = -2.65 + wave
          rightArm.current.rotation.x = -2.65 - wave
          leftArm.current.rotation.z = 0.35
          rightArm.current.rotation.z = -0.35
        } else if (eating) {
          const bite = Math.sin(Date.now() / 420) * 0.28
          leftArm.current.position.set(-0.13, 1.1, 0.14)
          rightArm.current.position.set(0.13, 1.12, 0.16)
          leftArm.current.rotation.x = -0.95
          rightArm.current.rotation.x = -1.15 + bite
        } else if (lounging) {
          leftArm.current.position.set(-0.18, 1.02, 0.06)
          rightArm.current.position.set(0.18, 1.02, 0.06)
          leftArm.current.rotation.x = -0.48
          rightArm.current.rotation.x = -0.48
        } else if (sit) {
          leftArm.current.position.set(-0.13, 1.14, 0.16)
          rightArm.current.position.set(0.13, 1.14, 0.16)
          leftArm.current.rotation.x = -1.08 + typeWave
          rightArm.current.rotation.x = -1.08 - typeWave
        } else if (drink) {
          leftArm.current.position.set(-0.2, 1.12, 0)
          rightArm.current.position.set(0.2, 1.12, 0)
          leftArm.current.rotation.x = 0.2
          rightArm.current.rotation.x = -1.25
        } else {
          leftArm.current.position.set(-0.2, 1.12, 0)
          rightArm.current.position.set(0.2, 1.12, 0)
          leftArm.current.rotation.x = 0
          rightArm.current.rotation.x = 0
        }
      }
      const slot = (deskSlots[person.roomId] ?? []).find((item) => item.x === person.deskX && item.y === person.deskY)
      if (sit && breakSeat) root.rotation.y = breakSeat.facing
      else if (sit && slot) root.rotation.y = slot.facing
      if (person.presence.mode === 'meeting') {
        const seat = meetingRing.find((item) => item.x === person.presence.x && item.y === person.presence.y)
        if (seat) root.rotation.y = seat.facing
      }
      if (drink) root.rotation.y = Math.atan2(waterSpot.x - here.x, waterSpot.y - here.y)
      if (!walking && person.presence.lifeIntent === 'chat') {
        const partner = state.staff.find(
          (item) => item.id !== person.id && item.presence.lifeIntent === 'chat' && item.presence.movingUntil <= Date.now(),
        )
        if (partner) {
          const there = positionAt(partner.presence, Date.now())
          root.rotation.y = Math.atan2(there.x - here.x, there.y - here.y)
        }
      }
    }
    if (cup.current) {
      const dropping = drink && Date.now() > person.presence.dwellUntil - 900
      cup.current.visible = drink
      cup.current.position.y = dropping ? 0.15 : 0.72
      cup.current.position.z = dropping ? 0.35 : 0.16
    }
    root.scale.setScalar(dim ? 0.92 : 1)
    const materialOpacity = dim ? 0.28 : 1
    root.traverse((child) => {
      const mesh = child as { material?: { opacity?: number; transparent?: boolean } }
      if (mesh.material && 'opacity' in mesh.material) {
        mesh.material.transparent = materialOpacity < 1
        mesh.material.opacity = materialOpacity
      }
    })
  })

  const skin = person.appearance.skin
  const shirt = person.appearance.shirt
  const legs = person.appearance.legs
  const first = personGivenName(person)
  return (
    <group ref={ref} onClick={(event) => { event.stopPropagation(); onOpen() }}>
      <mesh position={[0, 0.98, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.36, 6, 10]} />
        <meshStandardMaterial color={shirt} roughness={0.65} />
      </mesh>
      <mesh position={[0, 1.28, 0.02]}>
        <sphereGeometry args={[0.145, 18, 18]} />
        <meshStandardMaterial color={skin} roughness={0.55} />
      </mesh>
      <mesh position={[-0.05, 1.31, 0.12]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#1c1a18" />
      </mesh>
      <mesh position={[0.05, 1.31, 0.12]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#1c1a18" />
      </mesh>
      <mesh position={[0, 1.26, 0.14]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.22, 0.13]}>
        <boxGeometry args={[0.06, 0.012, 0.01]} />
        <meshStandardMaterial color="#8d5a4a" />
      </mesh>
      <Hair person={person} />
      <group ref={leftArm} position={[-0.2, 1.12, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow>
          <capsuleGeometry args={[0.045, 0.22, 4, 8]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color={skin} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.2, 1.12, 0]}>
        <mesh position={[0, -0.16, 0]} castShadow>
          <capsuleGeometry args={[0.045, 0.22, 4, 8]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[0, -0.36, 0.04]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <group ref={cup} position={[0, -0.36, 0.16]}>
          <mesh>
            <cylinderGeometry args={[0.035, 0.028, 0.07, 10]} />
            <meshStandardMaterial color="#f4f7f8" />
          </mesh>
        </group>
      </group>
      <group ref={leftLeg} position={[-0.07, 0.72, 0]}>
        <mesh position={[0, -0.24, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.28, 4, 8]} />
          <meshStandardMaterial color={legs} />
        </mesh>
        <mesh position={[0, -0.46, 0.04]}>
          <boxGeometry args={[0.08, 0.04, 0.14]} />
          <meshStandardMaterial color="#1c1c1c" />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.07, 0.72, 0]}>
        <mesh position={[0, -0.24, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.28, 4, 8]} />
          <meshStandardMaterial color={legs} />
        </mesh>
        <mesh position={[0, -0.46, 0.04]}>
          <boxGeometry args={[0.08, 0.04, 0.14]} />
          <meshStandardMaterial color="#1c1c1c" />
        </mesh>
      </group>
      {person.presence.pose === 'call' && <CallHeadset />}
      {person.presence.pose === 'call' && !walkingNow && <CallLaptop />}
      <NameBadge name={first} dim={dim} />
    </group>
  )
}

export function CallHeadset() {
  return (
    <group>
      <mesh position={[-0.14, 1.29, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.042, 0.042, 0.028, 12]} />
        <meshStandardMaterial color="#141414" roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0.14, 1.29, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.042, 0.042, 0.028, 12]} />
        <meshStandardMaterial color="#141414" roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.4, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.145, 0.012, 8, 20, Math.PI]} />
        <meshStandardMaterial color="#1b1b1b" roughness={0.4} />
      </mesh>
      <mesh position={[0.16, 1.18, 0.02]}>
        <boxGeometry args={[0.02, 0.08, 0.02]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
    </group>
  )
}

export function CallLaptop() {
  return (
    <group position={[0, 0.58, 0.28]}>
      <mesh rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[0.34, 0.012, 0.22]} />
        <meshStandardMaterial color="#2c3136" roughness={0.4} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.11, -0.1]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.32, 0.2, 0.012]} />
        <meshStandardMaterial color="#1a1f24" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.11, -0.093]} rotation={[-0.35, 0, 0]}>
        <planeGeometry args={[0.28, 0.16]} />
        <meshStandardMaterial color="#7ecbff" emissive="#3d7eaa" emissiveIntensity={0.55} />
      </mesh>
    </group>
  )
}

function Hair({ person }: { person: Staff }) {
  if (person.appearance.hairStyle === 'none') return null
  const bun = person.appearance.hairStyle === 'bun'
  const bob = person.appearance.hairStyle === 'bob'
  return (
    <mesh position={[0, bun ? 1.4 : 1.36, bob ? 0 : 0.01]}>
      <sphereGeometry args={[bun ? 0.08 : bob ? 0.15 : 0.13, 12, 12]} />
      <meshStandardMaterial color={person.appearance.hair} />
    </mesh>
  )
}
