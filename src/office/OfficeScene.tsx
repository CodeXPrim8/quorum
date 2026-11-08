import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, MapControls } from '@react-three/drei'
import { BackSide, CanvasTexture, Plane, Raycaster, SRGBColorSpace, Vector2, Vector3, type Group } from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { isStaffActive } from '../domain/active'
import { assignmentFor } from '../domain/selectors'
import type { AppState, Staff } from '../types'
import { City } from './city'
import { XoralCity } from './xoral'
import { Facilities } from './facilities'
import { StaffFigure } from './staff-figure'
import { tvTexture, workTexture } from './screens'
import { wallSolids, waterSpot, rooms, deskSlots, meetingChairs, BUILDING, type Spot } from './world'

type Props = {
  state: AppState
  now: number
  departmentId: string
  staffId: string
  onSelect: (id: string) => void
  cityHour: number
  ownedLots: string[]
  focus: { x: number; z: number; token: number } | null
}

export function OfficeScene(props: Props) {
  const minute = props.state.clock.minute
  const officeOn = minute >= 7 * 60 && minute < props.state.clock.closeMinute
  const sunUp = minute >= 6 * 60 + 10 && minute < 18 * 60 + 40
  const people = props.state.staff.filter((person) => isStaffActive(props.state, person))
  const drinking = people.some((person) => person.presence.pose === 'drink' && person.presence.movingUntil <= props.now)
  return (
    <Canvas
      className="stage-canvas"
      shadows
      camera={{ position: [10, 24, 40], fov: 38, near: 0.1, far: 800 }}
      gl={{ antialias: true }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <color attach="background" args={[skyColor(minute)]} />
      <hemisphereLight args={[sunUp ? '#f4fbff' : '#8aa0c8', '#c9b79a', sunUp ? 0.72 : 0.16]} />
      <Sky minute={minute} sunUp={sunUp} />
      <City lit={sunUp} minute={minute} openMinute={props.state.clock.openMinute} staff={people} now={props.now} />
      <XoralCity hour={props.cityHour} skyNight={!sunUp} reduced={props.state.settings.reducedMotion} owned={props.ownedLots} />
      <Building state={props.state} lit={officeOn} drinking={drinking} now={props.now} people={people} />
      {people.map((person) => (
        <StaffFigure
          key={person.id}
          state={props.state}
          person={person}
          now={props.now}
          dim={
            (props.departmentId !== 'all' && person.departmentId !== props.departmentId) ||
            (props.staffId !== 'all' && person.id !== props.staffId)
          }
          onOpen={() => props.onSelect(person.id)}
        />
      ))}
      <ContactShadows position={[BUILDING.w / 2, 0.01, BUILDING.d / 2]} opacity={sunUp ? 0.28 : 0.12} scale={34} blur={2.2} far={8} />
      <OfficeNavigation focus={props.focus} />
    </Canvas>
  )
}

const floorPlane = new Plane(new Vector3(0, 1, 0), 0)
const floorRay = new Raycaster()
const floorPointer = new Vector2()
const floorHit = new Vector3()

/** Click a spot to travel there. Drag slides across the floor. Scroll zooms toward the pointer. */
function OfficeNavigation({ focus }: { focus: { x: number; z: number; token: number } | null }) {
  const controls = useRef<MapControlsImpl>(null)
  const { camera, gl } = useThree()
  const goal = useRef<Vector3 | null>(null)
  const pointerDown = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      goal.current = null
      pointerDown.current = { x: event.clientX, y: event.clientY, moved: false }
    }
    const onMove = (event: PointerEvent) => {
      const start = pointerDown.current
      if (!start) return
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) start.moved = true
    }
    const onUp = (event: PointerEvent) => {
      const start = pointerDown.current
      pointerDown.current = null
      if (!start || start.moved || event.button !== 0) return
      const rect = el.getBoundingClientRect()
      floorPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      floorPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      floorRay.setFromCamera(floorPointer, camera)
      if (!floorRay.ray.intersectPlane(floorPlane, floorHit)) return
      if (floorHit.x < -180 || floorHit.x > 170 || floorHit.z < -260 || floorHit.z > 130) return
      goal.current = floorHit.clone()
    }
    el.addEventListener('pointerdown', onDown)
    el.ownerDocument.addEventListener('pointermove', onMove)
    el.ownerDocument.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.ownerDocument.removeEventListener('pointermove', onMove)
      el.ownerDocument.removeEventListener('pointerup', onUp)
    }
  }, [camera, gl])

  useEffect(() => {
    if (!focus) return
    goal.current = new Vector3(focus.x, 0, focus.z)
  }, [focus])

  useFrame((_, delta) => {
    const controlsNow = controls.current
    const dest = goal.current
    if (!controlsNow || !dest) return
    const target = controlsNow.target
    const step = 1 - Math.exp(-delta * 8)
    const dx = (dest.x - target.x) * step
    const dz = (dest.z - target.z) * step
    target.x += dx
    target.z += dz
    controlsNow.object.position.x += dx
    controlsNow.object.position.z += dz
    if (Math.hypot(dest.x - target.x, dest.z - target.z) < 0.08) {
      const restX = dest.x - target.x
      const restZ = dest.z - target.z
      target.x = dest.x
      target.z = dest.z
      controlsNow.object.position.x += restX
      controlsNow.object.position.z += restZ
      goal.current = null
    }
  })

  return (
    <MapControls
      ref={controls}
      target={[12, 0.4, 12]}
      zoomToCursor
      zoomSpeed={1.2}
      panSpeed={1.4}
      rotateSpeed={0.65}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 2 - 0.06}
      minDistance={3}
      maxDistance={280}
    />
  )
}

function Building({
  state,
  lit,
  drinking,
  now,
  people,
}: {
  state: AppState
  lit: boolean
  drinking: boolean
  now: number
  people: Staff[]
}) {
  const walls = useMemo(() => wallSolids(), [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[BUILDING.w / 2, 0, BUILDING.d / 2]} receiveShadow>
        <planeGeometry args={[BUILDING.w, BUILDING.d]} />
        <meshStandardMaterial color={lit ? '#1c2430' : '#121820'} roughness={0.86} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[13.7, 0.012, 6.55]} receiveShadow>
        <planeGeometry args={[21, 2.15]} />
        <meshStandardMaterial color="#2a3340" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[13.7, 0.012, 12.35]} receiveShadow>
        <planeGeometry args={[21, 2]} />
        <meshStandardMaterial color="#2a3340" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.6, 0.012, BUILDING.d / 2]} receiveShadow>
        <planeGeometry args={[3.2, BUILDING.d]} />
        <meshStandardMaterial color="#24303c" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[13.7, 0.014, 17.75]} receiveShadow>
        <planeGeometry args={[21, 1.5]} />
        <meshStandardMaterial color="#2a3340" />
      </mesh>
      {walls.map((wall, index) => (
        <mesh key={index} position={[wall.x + wall.w / 2, 1.28, wall.z + wall.d / 2]} castShadow receiveShadow>
          <boxGeometry args={[wall.w, 2.56, wall.d]} />
          <meshStandardMaterial color={lit ? '#d7e0ea' : '#2a3340'} roughness={0.8} />
        </mesh>
      ))}
      {rooms.map((room) => {
        const department = state.departments.find((item) => item.roomId === room.id)
        return (
          <group key={room.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.x + room.w / 2, 0.02, room.z + room.d / 2]} receiveShadow>
              <planeGeometry args={[Math.max(0.4, room.w - 0.28), Math.max(0.4, room.d - 0.28)]} />
              <meshStandardMaterial color={techFloor(department?.color ?? room.color)} />
            </mesh>
            <DoorSign name={signName(room.id, department?.name ?? room.name)} x={room.doorX} z={room.doorSide === 's' ? room.z + room.d : room.z} side={room.doorSide} />
            {room.id === 'owner' && <ExecutiveOffice />}
            {room.id === 'meeting' && (
              <MeetingRoom lit={lit} chairs={meetingChairs(state.staff.filter((person) => isStaffActive(state, person)).length)} />
            )}
            {room.id !== 'owner' && room.id !== 'meeting' && (deskSlots[room.id] ?? []).map((spot, index) => (
              <Desk
                key={`${spot.x}-${spot.y}`}
                spot={spot}
                kind={deviceKind(room.id, index)}
                book={room.id === 'finance' || room.id === 'people'}
                screen={screenFor(people, state, spot, room.id, now)}
              />
            ))}
            <Furnish roomId={room.id} x={room.x} z={room.z} w={room.w} d={room.d} doorSide={room.doorSide} doorX={room.doorX} lit={lit} />
          </group>
        )
      })}
      <Facilities lit={lit} />
      <Cooler active={drinking} />
      <OfficeLights lit={lit} />
      <Door x={1.6} z={0} rot={0} />
    </group>
  )
}

function Furnish({
  roomId,
  x,
  z,
  w,
  d,
  doorSide,
  doorX,
  lit,
}: {
  roomId: string
  x: number
  z: number
  w: number
  d: number
  doorSide: 'n' | 's'
  doorX: number
  lit: boolean
}) {
  const doorZ = doorSide === 's' ? z + d : z
  const artZ = doorSide === 's' ? z + 0.2 : z + d - 0.2
  const quiet = roomId === 'toilets' || roomId === 'servers' || roomId === 'operations' || roomId === 'lounge' || roomId === 'cafeteria'
  const showTv = roomId === 'executive' || roomId === 'sales' || roomId === 'comms'
  return (
    <group>
      <Door x={doorX} z={doorZ} rot={doorSide === 'n' ? Math.PI : 0} />
      {showTv && (
        <WallTv x={doorX > x + w * 0.5 ? x + w * 0.28 : x + w * 0.72} z={z + 0.18} rot={0} lit={lit} roomId={roomId} />
      )}
      {!quiet && roomId !== 'meeting' && (
        <mesh position={[x + w * 0.72, 1.55, artZ]} castShadow>
          <boxGeometry args={[0.7, 0.48, 0.04]} />
          <meshStandardMaterial color={artColor(roomId)} />
        </mesh>
      )}
      {!quiet && (
      <mesh position={[x + 0.45, 2.15, z + d * 0.5]}>
        <boxGeometry args={[0.7, 0.22, 0.28]} />
        <meshStandardMaterial color="#e7eef2" />
      </mesh>
      )}
      {!quiet && (
        <group>
          <mesh position={[x + w - 0.45, 0, z + (doorSide === 's' ? 0.45 : d - 0.45)]}>
            <cylinderGeometry args={[0.16, 0.2, 0.28, 8]} />
            <meshStandardMaterial color="#b4532a" />
          </mesh>
          <mesh position={[x + w - 0.45, 0.42, z + (doorSide === 's' ? 0.45 : d - 0.45)]}>
            <sphereGeometry args={[0.28, 12, 12]} />
            <meshStandardMaterial color="#3f7d4e" />
          </mesh>
        </group>
      )}
      {doorSide === 's' && (
        <mesh position={[x + w * 0.5, 1.45, z + 0.06]}>
          <boxGeometry args={[1.8, 1.15, 0.04]} />
          <meshStandardMaterial color="#b9dff0" transparent opacity={0.45} />
        </mesh>
      )}
    </group>
  )
}

function Door({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[-0.64, 1.15, 0]} castShadow>
        <boxGeometry args={[0.08, 2.3, 0.1]} />
        <meshStandardMaterial color="#f3eadf" />
      </mesh>
      <mesh position={[0.64, 1.15, 0]} castShadow>
        <boxGeometry args={[0.08, 2.3, 0.1]} />
        <meshStandardMaterial color="#f3eadf" />
      </mesh>
      <mesh position={[0, 2.32, 0]}>
        <boxGeometry args={[1.36, 0.1, 0.1]} />
        <meshStandardMaterial color="#f3eadf" />
      </mesh>
      <mesh position={[-1.08, 1.05, -0.05]} castShadow>
        <boxGeometry args={[0.84, 2.05, 0.05]} />
        <meshStandardMaterial color="#c9854a" />
      </mesh>
    </group>
  )
}

function Desk({
  spot,
  kind,
  book,
  screen,
}: {
  spot: Spot
  kind: 'laptop' | 'desktop'
  book: boolean
  screen: ReturnType<typeof workTexture> | null
}) {
  return (
    <group position={[spot.x, 0, spot.y]} rotation={[0, spot.facing, 0]}>
      <mesh position={[0, 0.74, 0.55]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.05, 0.62]} />
        <meshStandardMaterial color="#f4f1ea" />
      </mesh>
      <mesh position={[-0.42, 0.37, 0.55]}>
        <boxGeometry args={[0.06, 0.7, 0.5]} />
        <meshStandardMaterial color="#8d6848" />
      </mesh>
      <mesh position={[0.42, 0.37, 0.55]}>
        <boxGeometry args={[0.06, 0.7, 0.5]} />
        <meshStandardMaterial color="#8d6848" />
      </mesh>
      {kind === 'laptop' ? <Laptop screen={screen} /> : <Desktop screen={screen} />}
      {book && (
        <mesh position={[0.38, 0.79, 0.7]} rotation={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[0.16, 0.035, 0.22]} />
          <meshStandardMaterial color="#6d3b32" />
        </mesh>
      )}
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.42]} />
        <meshStandardMaterial color="#2a3136" />
      </mesh>
      <mesh position={[0, 0.74, -0.18]} castShadow>
        <boxGeometry args={[0.42, 0.48, 0.06]} />
        <meshStandardMaterial color="#2a3136" />
      </mesh>
    </group>
  )
}

function Laptop({ screen }: { screen: ReturnType<typeof workTexture> | null }) {
  return (
    <group position={[0, 0.785, 0.55]}>
      <mesh castShadow>
        <boxGeometry args={[0.46, 0.018, 0.3]} />
        <meshStandardMaterial color="#2c333a" metalness={0.4} roughness={0.35} />
      </mesh>
      <group position={[0, 0.012, 0.14]} rotation={[0.62, Math.PI, 0]}>
        <mesh>
          <boxGeometry args={[0.46, 0.28, 0.012]} />
          <meshStandardMaterial color="#1a1e22" />
        </mesh>
        <mesh position={[0, 0, 0.008]}>
          <planeGeometry args={[0.4, 0.22]} />
          <meshBasicMaterial map={screen ?? undefined} color={screen ? '#ffffff' : '#16343a'} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Desktop({ screen }: { screen: ReturnType<typeof workTexture> | null }) {
  return (
    <group position={[0, 0.78, 0.52]}>
      <mesh position={[0, 0.01, 0.12]}>
        <boxGeometry args={[0.32, 0.012, 0.11]} />
        <meshStandardMaterial color="#22282e" />
      </mesh>
      <mesh position={[0, 0.14, -0.06]}>
        <boxGeometry args={[0.06, 0.22, 0.04]} />
        <meshStandardMaterial color="#2a3138" />
      </mesh>
      <mesh position={[0, 0.32, -0.06]}>
        <boxGeometry args={[0.5, 0.3, 0.02]} />
        <meshStandardMaterial color="#1a1e22" />
      </mesh>
      <mesh position={[0, 0.32, -0.072]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.44, 0.24]} />
        <meshBasicMaterial map={screen ?? undefined} color={screen ? '#ffffff' : '#16343a'} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Cooler({ active }: { active: boolean }) {
  return (
    <group position={[waterSpot.x, 0, waterSpot.y]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.42, 1.05, 0.4]} />
        <meshStandardMaterial color="#d5dee6" />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.42, 12]} />
        <meshStandardMaterial color="#8fd0e8" transparent opacity={0.8} />
      </mesh>
      <mesh position={[0.22, 0.92, 0]} rotation={[0, 0, active ? -0.8 : -0.2]}>
        <boxGeometry args={[0.16, 0.04, 0.04]} />
        <meshStandardMaterial color="#2a3138" />
      </mesh>
      <mesh position={[0.28, 0.78, 0]}>
        <cylinderGeometry args={[0.03, 0.03, active ? 0.16 : 0.04, 8]} />
        <meshStandardMaterial color="#d7f3ff" transparent opacity={0.85} />
      </mesh>
    </group>
  )
}

function signName(roomId: string, department: string): string {
  if (roomId === 'owner') return 'Chairman'
  if (roomId === 'meeting') return 'Meeting'
  if (roomId === 'operations') return 'Operations'
  return department
}

function DoorSign({ name, x, z, side }: { name: string; x: number; z: number; side: 'n' | 's' }) {
  const nudge = side === 's' ? 0.12 : -0.12
  return (
    <group position={[x, 2.2, z + nudge]}>
      <mesh>
        <boxGeometry args={[1.35, 0.28, 0.04]} />
        <meshStandardMaterial color="#101820" emissive="#123832" emissiveIntensity={0.6} />
      </mesh>
      <Html position={[0, 0, 0.04]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <div className="door-sign">{name}</div>
      </Html>
    </group>
  )
}

function ExecutiveOffice() {
  return (
    <group position={[6.4, 0, 2.15]}>
      <mesh position={[0, 0.76, 0.7]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.08, 1.15]} />
        <meshStandardMaterial color="#d7c4a4" />
      </mesh>
      <mesh position={[0, 0.4, 0.7]}>
        <boxGeometry args={[2.2, 0.64, 1]} />
        <meshStandardMaterial color="#4a4036" />
      </mesh>
      <group position={[0, 0.05, 0.18]}>
        <Laptop screen={null} />
      </group>
      <mesh position={[0.85, 0.82, 0.85]} rotation={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.22, 0.04, 0.3]} />
        <meshStandardMaterial color="#6d3b32" />
      </mesh>
      <mesh position={[0, 0.48, -0.15]} castShadow>
        <boxGeometry args={[0.62, 0.1, 0.62]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 1.05, -0.42]} castShadow>
        <boxGeometry args={[0.62, 1.05, 0.1]} />
        <meshStandardMaterial color="#141414" />
      </mesh>
      <VisitorChair x={-0.55} z={1.85} />
      <VisitorChair x={0.55} z={1.85} />
      <Html position={[0, 1.35, -0.2]} center style={{ pointerEvents: 'none' }}>
        <div className="you-pill">You</div>
      </Html>
    </group>
  )
}

function VisitorChair({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.42]} />
        <meshStandardMaterial color="#c4b49a" />
      </mesh>
      <mesh position={[0, 0.74, -0.18]} castShadow>
        <boxGeometry args={[0.42, 0.48, 0.08]} />
        <meshStandardMaterial color="#3d4a44" />
      </mesh>
    </group>
  )
}

function MeetingRoom({ lit, chairs }: { lit: boolean; chairs: Spot[] }) {
  const screen = tvTexture('meeting')
  return (
    <group position={[20.1, 0, 2.5]}>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 0.07, 1.35]} />
        <meshStandardMaterial color="#e7d3b0" roughness={0.42} />
      </mesh>
      {[
        [-2.25, -0.52],
        [2.25, -0.52],
        [-2.25, 0.52],
        [2.25, 0.52],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.36, z]} castShadow>
          <boxGeometry args={[0.08, 0.68, 0.08]} />
          <meshStandardMaterial color="#4a4036" />
        </mesh>
      ))}
      <group position={[0, 1.55, -2.28]}>
        <mesh>
          <boxGeometry args={[2.4, 1.35, 0.06]} />
          <meshStandardMaterial color="#14181c" />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[2.2, 1.18]} />
          <meshBasicMaterial map={screen} color={lit ? '#ffffff' : '#141414'} toneMapped={false} />
        </mesh>
      </group>
      {chairs.map((spot) => (
        <group key={`${spot.x}-${spot.y}`} position={[spot.x - 20.1, 0, spot.y - 2.5]} rotation={[0, spot.facing, 0]}>
          <mesh position={[0, 0.46, 0]} castShadow>
            <boxGeometry args={[0.46, 0.08, 0.46]} />
            <meshStandardMaterial color="#d7c4a4" />
          </mesh>
          <mesh position={[0, 0.82, -0.2]} castShadow>
            <boxGeometry args={[0.46, 0.62, 0.08]} />
            <meshStandardMaterial color="#2c3338" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function deviceKind(roomId: string, index: number): 'laptop' | 'desktop' {
  if (roomId === 'technology' || roomId === 'sales' || roomId === 'comms' || roomId === 'operations') return 'laptop'
  if (roomId === 'finance' || roomId === 'procurement' || roomId === 'executive') return 'desktop'
  return index % 2 === 0 ? 'laptop' : 'desktop'
}

function screenFor(people: Staff[], state: AppState, spot: Spot, roomId: string, now: number) {
  const person = people.find((item) => item.roomId === roomId && item.deskX === spot.x && item.deskY === spot.y)
  if (!person || now < person.presence.movingUntil || person.presence.pose !== 'sit') return null
  const task = assignmentFor(state, person.id)
  return workTexture(person.roomId, task?.title ?? person.title)
}

function OfficeLights({ lit }: { lit: boolean }) {
  return (
    <group>
      {rooms.map((room) => {
        const heights = room.w > 7 ? [0.32, 0.68] : [0.55]
        return heights.map((along) => {
          const z = room.z + room.d * along
          return (
            <group key={`${room.id}-${along}`}>
              <WallSconce x={room.x + 0.1} z={z} rot={0} on={lit} />
              <WallSconce x={room.x + room.w - 0.1} z={z} rot={Math.PI} on={lit} />
            </group>
          )
        })
      })}
      <WallSconce x={0.16} z={3.4} rot={0} on={!lit} cool />
      <WallSconce x={0.16} z={8.6} rot={0} on={!lit} cool />
      <WallSconce x={0.16} z={14.4} rot={0} on={!lit} cool />
      <WallSconce x={12.2} z={5.68} rot={-Math.PI / 2} on={!lit} cool />
    </group>
  )
}

function WallSconce({ x, z, rot, on, cool }: { x: number; z: number; rot: number; on: boolean; cool?: boolean }) {
  const glow = cool ? '#c5d8ff' : '#ffe1a8'
  return (
    <group position={[x, 1.72, z]} rotation={[0, rot, 0]}>
      <mesh>
        <boxGeometry args={[0.06, 0.22, 0.16]} />
        <meshStandardMaterial color="#c8b48a" />
      </mesh>
      <mesh position={[0.08, -0.02, 0]}>
        <boxGeometry args={[0.1, 0.06, 0.18]} />
        <meshStandardMaterial color="#f7f1e4" emissive={glow} emissiveIntensity={on ? 1.8 : 0.05} />
      </mesh>
      <pointLight position={[0.2, -0.04, 0]} intensity={on ? (cool ? 2.4 : 1.8) : 0} distance={6.2} decay={2} color={cool ? '#d5e4ff' : '#fff1d0'} />
    </group>
  )
}

function WallTv({ x, z, rot, lit, roomId }: { x: number; z: number; rot: number; lit: boolean; roomId: string }) {
  const screen = tvTexture(roomId)
  return (
    <group position={[x, 1.45, z]} rotation={[0, rot, 0]}>
      <mesh>
        <boxGeometry args={[1.15, 0.68, 0.05]} />
        <meshStandardMaterial color="#14181c" />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[1.02, 0.56]} />
        <meshBasicMaterial map={screen} color={lit ? '#ffffff' : '#141414'} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Sky({ minute, sunUp }: { minute: number; sunUp: boolean }) {
  const dayT = Math.min(1, Math.max(0, (minute - 6 * 60) / (12.5 * 60)))
  const angle = Math.PI * dayT
  const sunPos: [number, number, number] = [-4 + Math.cos(angle) * 14, 14, -30]
  const nightT = minute >= 18 * 60 ? (minute - 18 * 60) / (12 * 60) : (minute + 6 * 60) / (12 * 60)
  const moonPos: [number, number, number] = [-2 + nightT * 14, 12.4, -30]
  const moonMap = useMemo(() => moonTexture(), [])
  const band = skyBand(minute, sunUp)
  const domeMap = useMemo(() => skyGradient(band[0], band[1]), [band[0], band[1]])
  const dome = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (dome.current) dome.current.position.copy(camera.position)
  })
  return (
    <group>
      <directionalLight
        position={sunPos}
        intensity={sunUp ? 1.45 : 0}
        color="#fff1d2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
      />
      <directionalLight position={moonPos} intensity={sunUp ? 0.04 : 0.55} color="#c9d6ff" />
      <group ref={dome}>
        <mesh raycast={() => undefined}>
          <sphereGeometry args={[520, 28, 20]} />
          <meshBasicMaterial map={domeMap} side={BackSide} depthWrite={false} toneMapped={false} />
        </mesh>
        {sunUp &&
          [
            [90, 150, -30],
            [-130, 170, 40],
            [20, 190, 110],
            [-40, 160, -120],
          ].map(([x, y, z]) => (
            <mesh key={`${x}-${z}`} position={[x, y, z]} scale={[1.7, 0.42, 1.1]} raycast={() => undefined}>
              <sphereGeometry args={[26, 12, 10]} />
              <meshBasicMaterial color="#f7fbff" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
        <mesh position={skyDisc(sunUp ? sunPos : moonPos)} raycast={() => undefined}>
          <sphereGeometry args={[sunUp ? 11 : 9, 24, 24]} />
          <meshBasicMaterial map={sunUp ? null : moonMap} color={sunUp ? '#ffe7a0' : '#f4f1ea'} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Compass of the office light, lifted so the disc sits in the sky rather than among the roofs. */
function skyDisc(pos: [number, number, number]): [number, number, number] {
  const horizontal = Math.hypot(pos[0], pos[2]) || 1
  const rise = 0.72
  const len = Math.hypot(1, rise)
  const distance = 340
  return [(pos[0] / horizontal / len) * distance, (rise / len) * distance, (pos[2] / horizontal / len) * distance]
}

function skyBand(minute: number, sunUp: boolean): [string, string] {
  const dawn = (minute >= 5 * 60 && minute < 7 * 60) || (minute >= 17 * 60 && minute < 19 * 60 + 20)
  if (!sunUp) return ['#07101e', '#1a3358']
  if (dawn) return ['#3f78b0', '#f0c9a2']
  return ['#3b86c6', '#d7f0fb']
}

function skyGradient(top: string, horizon: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the sky')
  const paint = ctx.createLinearGradient(0, 0, 0, 256)
  paint.addColorStop(0, top)
  paint.addColorStop(0.58, top)
  paint.addColorStop(1, horizon)
  ctx.fillStyle = paint
  ctx.fillRect(0, 0, 8, 256)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function moonTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the moon')
  ctx.fillStyle = '#f4f1ea'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#d5d0c6'
  for (const [x, y, r] of [
    [40, 46, 18],
    [78, 36, 11],
    [70, 78, 16],
    [28, 86, 8],
    [96, 64, 6],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function skyColor(minute: number): string {
  const sunUp = minute >= 6 * 60 + 10 && minute < 18 * 60 + 40
  if (!sunUp) return '#07101e'
  if (minute < 7 * 60 || minute >= 17 * 60) return '#3f78b0'
  return '#3b86c6'
}

function techFloor(hex: string): string {
  const value = hex.replace('#', '')
  if (value.length !== 6) return '#243044'
  const mix = (index: number) => Math.round(parseInt(value.slice(index, index + 2), 16) * 0.45 + 22 * 0.55)
  return `rgb(${mix(0)}, ${mix(2)}, ${mix(4)})`
}

function artColor(roomId: string): string {
  const colors: Record<string, string> = {
    owner: '#1f4d4a',
    executive: '#c47b4a',
    sales: '#2a628a',
    marketing: '#d98a3a',
    comms: '#8a4b78',
    procurement: '#3d6b4f',
    finance: '#8a6232',
    people: '#6b4c7a',
    technology: '#2f4f6f',
  }
  return colors[roomId] ?? '#c47b4a'
}
