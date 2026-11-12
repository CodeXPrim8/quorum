import { Component, Suspense, useMemo, useRef, type ErrorInfo, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { personGivenName } from '../domain/staff-names'
import type { AppState, Staff } from '../types'
import { CallHeadset, CallLaptop, Human } from './human'
import { NameBadge } from './name-badge'
import { staffModelUrl } from './model-catalog'
import { barSeats, cafeSeats, deskSlots, loungeSeats, meetingRing, positionAt, waterSpot } from './world'

type Props = {
  state: AppState
  person: Staff
  now: number
  dim: boolean
  onOpen: () => void
}

export function StaffFigure(props: Props) {
  const url = staffModelUrl(props.person.id)
  if (!url) return <Human {...props} />
  return (
    <Suspense fallback={<Human {...props} />}>
      <MeshGuard fallback={<Human {...props} />}>
        <GltfHuman {...props} url={url} />
      </MeshGuard>
    </Suspense>
  )
}

class MeshGuard extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* keep the built-in person if a glTF file is missing or broken */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function GltfHuman({ state, person, now, dim, onOpen, url }: Props & { url: string }) {
  const root = useRef<Group>(null)
  const { scene } = useGLTF(url)
  const first = personGivenName(person)
  const walkingNow = now < person.presence.movingUntil && person.presence.path.length > 1
  const clone = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((child) => {
      const mesh = child as { castShadow?: boolean; receiveShadow?: boolean }
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return copy
  }, [scene])

  useFrame(() => {
    const group = root.current
    if (!group) return
    const walking = Date.now() < person.presence.movingUntil && person.presence.path.length > 1
    const here = positionAt(person.presence, Date.now())
    const away = !walking && person.presence.pose === 'away'
    group.visible = !away
    group.position.x = here.x
    group.position.z = here.y
    const sit = !walking && (person.presence.pose === 'sit' || person.presence.pose === 'call')
    group.position.y = sit ? -0.22 : 0
    if (walking && person.presence.path.length > 1) {
      const ahead = positionAt(person.presence, Date.now() + 180)
      group.rotation.y = Math.atan2(ahead.x - here.x, ahead.y - here.y)
    } else {
      const slot = (deskSlots[person.roomId] ?? []).find((item) => item.x === person.deskX && item.y === person.deskY)
      const breakSeat = [...loungeSeats, ...cafeSeats, ...barSeats].find((item) => item.x === person.presence.x && item.y === person.presence.y)
      if (sit && breakSeat) group.rotation.y = breakSeat.facing
      else if (sit && slot) group.rotation.y = slot.facing
      if (person.presence.mode === 'meeting') {
        const seat = meetingRing.find((item) => item.x === person.presence.x && item.y === person.presence.y)
        if (seat) group.rotation.y = seat.facing
      }
      if (person.presence.pose === 'drink') {
        group.rotation.y = Math.atan2(waterSpot.x - here.x, waterSpot.y - here.y)
      }
      if (person.presence.lifeIntent === 'chat') {
        const partner = state.staff.find(
          (item) => item.id !== person.id && item.presence.lifeIntent === 'chat' && item.presence.movingUntil <= Date.now(),
        )
        if (partner) {
          const there = positionAt(partner.presence, Date.now())
          group.rotation.y = Math.atan2(there.x - here.x, there.y - here.y)
        }
      }
    }
    const materialOpacity = dim ? 0.28 : 1
    group.traverse((child) => {
      const mesh = child as { material?: { opacity?: number; transparent?: boolean } }
      if (mesh.material && 'opacity' in mesh.material) {
        mesh.material.transparent = materialOpacity < 1
        mesh.material.opacity = materialOpacity
      }
    })
  })

  return (
    <group ref={root} onClick={(event) => { event.stopPropagation(); onOpen() }}>
      <primitive object={clone} />
      {person.presence.pose === 'call' && <CallHeadset />}
      {person.presence.pose === 'call' && !walkingNow && <CallLaptop />}
      {person.presence.pose === 'attention' && (
        <group position={[0, 1.55, 0]}>
          <mesh position={[-0.22, 0.42, 0]}>
            <boxGeometry args={[0.05, 0.32, 0.05]} />
            <meshStandardMaterial color="#f0c9a0" />
          </mesh>
          <mesh position={[0.22, 0.42, 0]}>
            <boxGeometry args={[0.05, 0.32, 0.05]} />
            <meshStandardMaterial color="#f0c9a0" />
          </mesh>
        </group>
      )}
      <NameBadge name={first} dim={dim} />
    </group>
  )
}
