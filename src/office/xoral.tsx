import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Group, type Mesh } from 'three'
import {
  BLOCKS,
  BRIDGES,
  CANAL,
  DOWNTOWN,
  ESTATES,
  HIGHWAY,
  HOUSES,
  LAMPS,
  LANDING,
  LOTS,
  RING,
  ROADS,
  RUNWAY,
  TOLLS,
  WALK,
  loopLength,
  nextProgress,
  nightAmount,
  pointOnLoop,
  pointOnWalk,
  signalRed,
  type Lot,
  type Road,
} from './xoral-layout'

type Props = {
  hour: number
  /** Office sky is down. Exterior lights come on with the sky, without changing the office. */
  skyNight: boolean
  reduced: boolean
  owned: string[]
}

export function XoralCity({ hour, skyNight, reduced, owned }: Props) {
  const night = Math.max(nightAmount(hour), skyNight ? 1 : 0)
  const sheets = useMemo(() => windowSheets(), [])
  const welcome = useMemo(() => signTexture('Welcome to Xoral City', 'The city of AI agents', '#1f6f6a'), [])
  const boards = useMemo(
    () => ({
      Xoral: signTexture('Xoral', 'City of AI agents', '#1f6f6a'),
      'Dock Pro': signTexture('Dock Pro', 'The desk dock for the classroom bundle', '#c2512a'),
      Northline: signTexture('Northline', 'Hardware, devices, and software', '#243447'),
    }),
    [],
  )
  const ads = useMemo(
    () => [
      signTexture('Dock Pro', 'The desk dock for the classroom bundle', '#c2512a'),
      signTexture('Classroom OS', 'Offline quiz sync for schools', '#1e4d6b'),
      signTexture('Northline', 'Hardware, devices, and software', '#243447'),
    ],
    [],
  )
  return (
    <group name="xoral-city">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, -0.08, 8]} receiveShadow>
        <planeGeometry args={[680, 620]} />
        <meshStandardMaterial color={night > 0.55 ? '#1a221c' : '#7f8f72'} />
      </mesh>
      <Roads night={night} />
      <Promenade />
      <Canal night={night} />
      {BRIDGES.map((bridge) => (
        <Bridge key={`${bridge.x}-${bridge.z}-${bridge.kind}`} bridge={bridge} night={night} />
      ))}
      {TOLLS.map((toll) => (
        <TollPlaza key={`${toll.x}-${toll.z}`} toll={toll} night={night} />
      ))}
      {ESTATES.map((estate) => (
        <Estate key={estate.name} estate={estate} night={night} />
      ))}
      <Grass />
      {BLOCKS.map((block, index) => (
        <Tower
          key={`${block.x}-${block.z}`}
          block={block}
          glass={index % 2 === 0 ? sheets.glass : sheets.glassB}
          glow={index % 2 === 0 ? sheets.glow : sheets.glowB}
          night={night}
          board={block.board ? boards[block.board as keyof typeof boards] : null}
        />
      ))}
      {HOUSES.map((house) => (
        <HousePlot key={`${house.x}-${house.z}`} house={house} night={night} />
      ))}
      <Trees />
      <StreetLights night={night} />
      <Signals reduced={reduced} />
      <Gate reduced={reduced} />
      <Cars night={night} reduced={reduced} />
      <Emergency night={night} reduced={reduced} />
      <Pedestrians night={night} reduced={reduced} />
      <Wildlife reduced={reduced} />
      <Birds reduced={reduced} />
      <Airport night={night} reduced={reduced} />
      <Billboard position={[12, 0, -28]} texture={welcome} w={10} h={4.2} night={night} />
      <RotatingBoard position={[56, 0, -28]} textures={ads} reduced={reduced} night={night} />
      <RotatingBoard position={[-40, 0, 28]} textures={ads} reduced={reduced} night={night} />
      {LOTS.map((lot) => (
        <LotPad key={lot.id} lot={lot} owned={owned.includes(lot.id)} />
      ))}
    </group>
  )
}

function crossesCanal(road: Road): boolean {
  if (Math.abs(road.a[0] - road.b[0]) > 1) return false
  const x = road.a[0]
  const z0 = Math.min(road.a[1], road.b[1])
  const z1 = Math.max(road.a[1], road.b[1])
  return x > CANAL.x0 && x < CANAL.x1 && z0 < CANAL.z - 6 && z1 > CANAL.z + 6
}

function roadPieces(road: Road): Road[] {
  if (!crossesCanal(road)) return [road]
  const x = road.a[0]
  const rising = road.a[1] < road.b[1]
  const near = CANAL.z - 8
  const far = CANAL.z + 8
  return [
    { ...road, b: [x, rising ? near : far] },
    { ...road, a: [x, rising ? far : near] },
  ]
}

function Roads({ night }: { night: number }) {
  const streets = [
    ...RING.map((point, index) => ({ a: point, b: RING[(index + 1) % RING.length], width: 7.2, kind: 'street' as const })),
    ...ROADS,
  ]
  return (
    <group>
      {streets.flatMap((road, index) =>
        roadPieces(road).map((piece, pieceIndex) => (
          <RoadSegment key={`road-${index}-${pieceIndex}`} road={piece} night={night} />
        )),
      )}
      {RING.map((point) => (
        <group key={`${point[0]}-${point[1]}`} position={[point[0], -0.02, point[1]]}>
          {[-2.2, -0.6, 0.6, 2.2].map((offset) => (
            <mesh key={offset} position={[offset, 0.03, 0]}>
              <boxGeometry args={[0.35, 0.02, 2.4]} />
              <meshStandardMaterial color="#f4f1e8" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function RoadSegment({ road, night }: { road: Road; night: number }) {
  const dx = road.b[0] - road.a[0]
  const dz = road.b[1] - road.a[1]
  const len = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  const asphalt = road.kind === 'highway' ? (night > 0.5 ? '#23282e' : '#343a40') : night > 0.5 ? '#2a3138' : '#3a4046'
  const walk = night > 0.5 ? '#3a4440' : '#c5cbb8'
  return (
    <group position={[(road.a[0] + road.b[0]) / 2, -0.03, (road.a[1] + road.b[1]) / 2]} rotation={[0, yaw, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[road.width, 0.05, len]} />
        <meshStandardMaterial color={asphalt} roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[road.kind === 'highway' ? 0.28 : 0.12, 0.02, len * 0.9]} />
        <meshStandardMaterial color={road.kind === 'highway' ? '#e6c15a' : '#d5d2c6'} />
      </mesh>
      {[-road.width / 2 - (road.kind === 'highway' ? 1.1 : 0.7), road.width / 2 + (road.kind === 'highway' ? 1.1 : 0.7)].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]}>
          <boxGeometry args={[road.kind === 'highway' ? 1.8 : 1.5, 0.03, len]} />
          <meshStandardMaterial color={walk} />
        </mesh>
      ))}
    </group>
  )
}

function Grass() {
  const patches: [number, number][] = [
    [-44, -34],
    [30, -34],
    [56, -8],
    [-46, 22],
    [30, 48],
    [-8, 46],
  ]
  return (
    <group>
      {patches.map(([x, z]) => (
        <mesh key={`${x}-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.05, z]}>
          <circleGeometry args={[4.5, 18]} />
          <meshStandardMaterial color="#4f7a48" />
        </mesh>
      ))}
    </group>
  )
}

function Canal({ night }: { night: number }) {
  const length = CANAL.x1 - CANAL.x0
  return (
    <group position={[(CANAL.x0 + CANAL.x1) / 2, 0, CANAL.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]}>
        <planeGeometry args={[length, CANAL.half * 2 + 2.4]} />
        <meshStandardMaterial color="#6d6248" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[length, CANAL.half * 2]} />
        <meshStandardMaterial color={night > 0.5 ? '#16324a' : '#2f7f9a'} roughness={0.18} metalness={0.35} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.08, side * (CANAL.half + 0.35)]}>
          <boxGeometry args={[length, 0.16, 0.5]} />
          <meshStandardMaterial color="#d9d3c6" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Bridge({ bridge, night }: { bridge: (typeof BRIDGES)[number]; night: number }) {
  const foot = bridge.kind === 'foot'
  const deck = foot ? 3.3 : 0.28
  const asphalt = night > 0.5 ? '#2a3138' : '#3a4046'
  return (
    <group position={[bridge.x, 0, bridge.z]}>
      <mesh position={[0, deck, 0]}>
        <boxGeometry args={[bridge.width, foot ? 0.16 : 0.22, bridge.span]} />
        <meshStandardMaterial color={foot ? '#c8b49a' : asphalt} roughness={0.8} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (bridge.width / 2), deck + 0.55, 0]}>
          <boxGeometry args={[0.1, foot ? 0.9 : 0.7, bridge.span]} />
          <meshStandardMaterial color={foot ? '#8a6232' : '#d5dde4'} metalness={foot ? 0.1 : 0.45} />
        </mesh>
      ))}
      {foot
        ? null
        : [-bridge.span / 5, bridge.span / 5].map((z) => (
            <mesh key={z} position={[0, 0.08, z]}>
              <boxGeometry args={[bridge.width * 0.45, 0.7, 0.45]} />
              <meshStandardMaterial color="#9aa3ab" />
            </mesh>
          ))}
    </group>
  )
}

function TollPlaza({ toll, night }: { toll: (typeof TOLLS)[number]; night: number }) {
  return (
    <group position={[toll.x, 0, toll.z]} rotation={[0, toll.alongX ? Math.PI / 2 : 0, 0]}>
      <mesh position={[0, 4.1, 0]}>
        <boxGeometry args={[15, 0.22, 2.6]} />
        <meshStandardMaterial color="#1f6f6a" />
      </mesh>
      {[-4.6, 0, 4.6].map((x) => (
        <mesh key={x} position={[x, 2.05, 0]}>
          <boxGeometry args={[0.18, 4.1, 0.18]} />
          <meshStandardMaterial color="#d5dde4" metalness={0.4} />
        </mesh>
      ))}
      {[-3.2, 3.2].map((x) => (
        <group key={x} position={[x, 0, 1.15]}>
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[1.7, 2.3, 1.5]} />
            <meshStandardMaterial color="#efe6d4" />
          </mesh>
          <mesh position={[0, 1.35, 0.78]}>
            <boxGeometry args={[0.9, 0.7, 0.06]} />
            <meshStandardMaterial color="#9fd0ea" emissive="#fff4d2" emissiveIntensity={0.15 + night * 1.1} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.15, -0.2]}>
        <boxGeometry args={[9.2, 0.1, 0.12]} />
        <meshStandardMaterial color="#f0b429" emissive="#f0b429" emissiveIntensity={0.2 + night * 0.8} />
      </mesh>
    </group>
  )
}

function Estate({ estate, night }: { estate: (typeof ESTATES)[number]; night: number }) {
  const lawnW = 32
  const lawnD = 24
  return (
    <group position={[estate.x, 0, estate.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[lawnW, lawnD]} />
        <meshStandardMaterial color="#4f8a45" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4, 0.02, 2]}>
        <circleGeometry args={[7.5, 20]} />
        <meshStandardMaterial color="#3f7a3c" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, 0.55, side * (lawnD / 2)]}>
          <boxGeometry args={[lawnW, 1.1, 0.35]} />
          <meshStandardMaterial color="#d7d0c4" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[-lawnW / 2, 0.55, 0]}>
        <boxGeometry args={[0.35, 1.1, lawnD]} />
        <meshStandardMaterial color="#d7d0c4" roughness={0.85} />
      </mesh>
      <mesh position={[estate.gate * (lawnW / 2), 0.7, -6]}>
        <boxGeometry args={[0.35, 1.4, 8]} />
        <meshStandardMaterial color="#d7d0c4" />
      </mesh>
      <mesh position={[estate.gate * (lawnW / 2), 0.7, 6]}>
        <boxGeometry args={[0.35, 1.4, 8]} />
        <meshStandardMaterial color="#d7d0c4" />
      </mesh>
      {[-1.2, 1.2].map((z) => (
        <mesh key={z} position={[estate.gate * (lawnW / 2), 1.5, z]}>
          <boxGeometry args={[0.55, 2.4, 0.55]} />
          <meshStandardMaterial color={estate.trim} />
        </mesh>
      ))}
      <mesh position={[estate.gate * (lawnW / 2 - 0.1), 2.55, 0]}>
        <boxGeometry args={[0.4, 0.28, 2.6]} />
        <meshStandardMaterial color={estate.trim} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[estate.gate * 8, 0.03, 0]}>
        <planeGeometry args={[14, 3.2]} />
        <meshStandardMaterial color="#9a9286" />
      </mesh>
      <mesh position={[-2, 1.7, -1]}>
        <boxGeometry args={[12, 3.4, 7.2]} />
        <meshStandardMaterial color={estate.wall} roughness={0.72} />
      </mesh>
      <mesh position={[-2, 4.05, -1]}>
        <boxGeometry args={[8.4, 1.5, 5.4]} />
        <meshStandardMaterial color={estate.wall} roughness={0.72} />
      </mesh>
      <mesh position={[-2, 5.15, -1]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[6.4, 1.8, 4]} />
        <meshStandardMaterial color={estate.roof} roughness={0.68} />
      </mesh>
      {[-4.2, -1.4, 1.4].map((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, z > 0 ? 2.3 : 1.3, -1 + z * 3.65]}>
            <boxGeometry args={[1.1, 0.9, 0.08]} />
            <meshStandardMaterial color="#9fd0ea" emissive="#fff1c9" emissiveIntensity={0.05 + night * 1.3} />
          </mesh>
        )),
      )}
      <mesh position={[2.2, 0.85, 2.7]}>
        <boxGeometry args={[1.4, 1.7, 0.12]} />
        <meshStandardMaterial color="#6a3d2c" />
      </mesh>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[2.2 + x, 1.15, 3.5]}>
          <cylinderGeometry args={[0.12, 0.14, 2.3, 6]} />
          <meshStandardMaterial color="#f4efe4" />
        </mesh>
      ))}
      <mesh position={[6.5, 0.2, 4]}>
        <boxGeometry args={[5.2, 0.28, 3.2]} />
        <meshStandardMaterial color={night > 0.5 ? '#1a4a62' : '#3aa0c4'} roughness={0.15} metalness={0.3} />
      </mesh>
      <mesh position={[8.2, 1.15, -4]}>
        <boxGeometry args={[4.2, 2.3, 3.4]} />
        <meshStandardMaterial color={estate.wall} />
      </mesh>
      <mesh position={[8.2, 2.55, -4]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[2.8, 1.1, 4]} />
        <meshStandardMaterial color={estate.roof} />
      </mesh>
      {[
        [-10, 6],
        [10, -8],
        [-12, -6],
      ].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 1.6, 6]} />
            <meshStandardMaterial color="#6a4a32" />
          </mesh>
          <mesh position={[0, 1.9, 0]}>
            <sphereGeometry args={[0.9, 8, 8]} />
            <meshStandardMaterial color="#2f6b3a" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Tower({
  block,
  glass,
  glow,
  night,
  board,
}: {
  block: (typeof BLOCKS)[number]
  glass: CanvasTexture
  glow: CanvasTexture
  night: number
  board: CanvasTexture | null
}) {
  const across = Math.max(2, block.w * 0.42)
  const up = Math.max(4, block.h * 0.34)
  const glassMap = useMemo(() => repeated(glass, across, up), [glass, across, up])
  const glowMap = useMemo(() => repeated(glow, across, up), [glow, across, up])
  const podium = 2.6
  const facade = () => (
    <meshStandardMaterial
      color={block.color}
      map={glassMap}
      emissive="#ffd7a1"
      emissiveMap={glowMap}
      emissiveIntensity={night * 2.4}
      roughness={0.38}
      metalness={0.08}
    />
  )
  return (
    <group position={[block.x, 0, block.z]}>
      <mesh position={[0, podium / 2, 0]}>
        <boxGeometry args={[block.w + 1.6, podium, block.d + 1.6]} />
        <meshStandardMaterial color="#c4b49a" roughness={0.78} />
      </mesh>
      <mesh position={[0, podium + block.h / 2, 0]}>
        <boxGeometry args={[block.w, block.h, block.d]} />
        {facade()}
      </mesh>
      {block.roof !== 'flat' &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * (block.w / 2 + 0.08), podium + block.h * 0.48, 0]}>
            <boxGeometry args={[0.1, block.h * 0.62, block.d * 0.18]} />
            <meshStandardMaterial color="#e7eef3" metalness={0.65} roughness={0.22} />
          </mesh>
        ))}
      {block.roof === 'setback' && (
        <mesh position={[0, podium + block.h + 1.3, 0]}>
          <boxGeometry args={[block.w * 0.62, 2.6, block.d * 0.62]} />
          {facade()}
        </mesh>
      )}
      {block.roof === 'antenna' && (
        <group position={[0, podium + block.h + 2.2, 0]}>
          <mesh>
            <cylinderGeometry args={[0.05, 0.08, 4.2, 6]} />
            <meshStandardMaterial color="#d5dde4" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 2.2, 0]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color="#ff5a4a" emissive="#ff3b30" emissiveIntensity={0.4 + night * 1.4} />
          </mesh>
        </group>
      )}
      <mesh position={[0, podium + block.h + 0.08, 0]}>
        <boxGeometry args={[block.w + 0.15, 0.16, block.d + 0.15]} />
        <meshStandardMaterial color="#2a333c" metalness={0.4} roughness={0.45} />
      </mesh>
      {(
        [
          [0, block.d / 2 + 0.04, 0],
          [0, -(block.d / 2 + 0.04), Math.PI],
          [block.w / 2 + 0.04, 0, Math.PI / 2],
          [-(block.w / 2 + 0.04), 0, -Math.PI / 2],
        ] as const
      ).map(([x, z, yaw], index) => (
        <mesh key={index} position={[x, podium + block.h - 0.55, z]} rotation={[0, yaw, 0]}>
          <planeGeometry args={[index < 2 ? block.w * 0.82 : block.d * 0.82, 0.16]} />
          <meshBasicMaterial color="#d7f1ff" transparent opacity={0.2 + night * 0.75} toneMapped={false} />
        </mesh>
      ))}
      {board && (
        <group position={[0, podium + block.h * 0.62, block.d / 2 + 0.2]}>
          <mesh>
            <boxGeometry args={[Math.min(6.2, block.w * 0.9), 2.4, 0.12]} />
            <meshStandardMaterial color="#1c242c" />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <planeGeometry args={[Math.min(5.6, block.w * 0.82), 1.9]} />
            <meshStandardMaterial map={board} emissive="#fff6e4" emissiveMap={board} emissiveIntensity={night * 0.45} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function Trees() {
  const spots: [number, number][] = [
    [-40, -44],
    [-48, -40],
    [26, -46],
    [34, -44],
    [54, -4],
    [-42, 18],
    [-48, 26],
    [26, 46],
    [4, 48],
    [-12, 44],
  ]
  for (let x = -56; x <= 70; x += 16) {
    spots.push([x, -64], [x, -102], [x, 62])
  }
  for (let z = -28; z <= 36; z += 16) {
    spots.push([-64, z], [74, z])
  }
  for (let z = 10; z <= 44; z += 10) spots.push([-110, z], [104, z])
  return (
    <group>
      {spots.map(([x, z], index) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.16, 0.22, 2.2, 6]} />
            <meshStandardMaterial color="#6a4a32" />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <sphereGeometry args={[1.15 + (index % 3) * 0.18, 10, 10]} />
            <meshStandardMaterial color={index % 2 === 0 ? '#2f6b3a' : '#3d7d48'} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function StreetLights({ night }: { night: number }) {
  return (
    <group>
      {LAMPS.map((lamp) => (
        <group key={`${lamp.x}-${lamp.z}`} position={[lamp.x, 0, lamp.z]}>
          <mesh position={[0, 2.4, 0]}>
            <cylinderGeometry args={[0.06, 0.09, 4.8, 6]} />
            <meshStandardMaterial color="#3e4650" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position={[0.7, 4.7, 0]}>
            <boxGeometry args={[1.5, 0.07, 0.07]} />
            <meshStandardMaterial color="#3e4650" />
          </mesh>
          <mesh position={[1.25, 4.5, 0]}>
            <boxGeometry args={[0.62, 0.16, 0.32]} />
            <meshBasicMaterial color={night > 0.25 ? '#fff6d2' : '#8d949c'} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.4, 0.04, 0]}>
            <circleGeometry args={[4.2, 18]} />
            <meshStandardMaterial
              color="#fff1c8"
              emissive="#ffe3a3"
              emissiveIntensity={night * 0.85}
              transparent
              opacity={0.15 + night * 0.55}
            />
          </mesh>
          <pointLight position={[0.6, 4.4, 0]} color="#ffd7a0" intensity={night * 18} distance={11} decay={2} />
        </group>
      ))}
    </group>
  )
}

function HousePlot({ house, night }: { house: (typeof HOUSES)[number]; night: number }) {
  return (
    <group position={[house.x, 0, house.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[6.4, 6.4]} />
        <meshStandardMaterial color="#6f935c" />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[4.2, 2.3, 3.5]} />
        <meshStandardMaterial color={house.wall} roughness={0.75} />
      </mesh>
      <mesh position={[0, 2.55, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.15, 1.35, 4]} />
        <meshStandardMaterial color={house.roof} roughness={0.7} />
      </mesh>
      <mesh position={[1.5, 1.7, 0]}>
        <boxGeometry args={[0.35, 0.7, 0.35]} />
        <meshStandardMaterial color="#6d5344" />
      </mesh>
      <mesh position={[0, 0.7, 1.78]}>
        <boxGeometry args={[0.7, 1.3, 0.06]} />
        <meshStandardMaterial color="#6a3d2c" />
      </mesh>
      {[-1.05, 1.05].map((x) => (
        <mesh key={x} position={[x, 1.35, 1.78]}>
          <planeGeometry args={[0.7, 0.7]} />
          <meshStandardMaterial color="#fff4d4" emissive="#ffe7b0" emissiveIntensity={night * 1.6} />
        </mesh>
      ))}
    </group>
  )
}

function Signals({ reduced }: { reduced: boolean }) {
  const refs = useRef<Mesh[]>([])
  useFrame(({ clock }) => {
    const redEW = signalRed(reduced ? 2 : clock.elapsedTime, true)
    refs.current.forEach((mesh, index) => {
      if (!mesh) return
      const east = index % 2 === 0
      const red = east ? redEW : signalRed(reduced ? 2 : clock.elapsedTime, false)
      const material = mesh.material
      if (!(material instanceof MeshStandardMaterial)) return
      material.color.set(red ? '#c62828' : '#2e7d32')
      material.emissive.set(red ? '#c62828' : '#2e7d32')
    })
  })
  return (
    <group>
      {RING.map((point, index) => (
        <group key={`${point[0]}`} position={[point[0] + 3.2, 0, point[1] + 3.2]}>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 3, 6]} />
            <meshStandardMaterial color="#4e555c" />
          </mesh>
          <mesh
            ref={(node) => {
              if (node) refs.current[index] = node
            }}
            position={[0, 3.05, 0]}
          >
            <boxGeometry args={[0.28, 0.7, 0.18]} />
            <meshStandardMaterial color="#2e7d32" emissive="#2e7d32" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Gate({ reduced }: { reduced: boolean }) {
  const arm = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const mesh = arm.current
    if (!mesh) return
    const open = reduced ? 0.4 : (Math.sin(clock.elapsedTime * 0.35) + 1) / 2
    mesh.rotation.z = -open * 1.15
  })
  return (
    <group position={[RUNWAY.x - RUNWAY.length / 2 - 4, 0, RUNWAY.z + 14]}>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.2, 1.2, 0.2]} />
        <meshStandardMaterial color="#5c656c" />
      </mesh>
      <mesh ref={arm} position={[1.3, 1.15, 0]}>
        <boxGeometry args={[2.6, 0.12, 0.12]} />
        <meshStandardMaterial color="#f0b429" />
      </mesh>
    </group>
  )
}

function Cars({ night, reduced }: { night: number; reduced: boolean }) {
  const street = ['#d4524a', '#3a6ea5', '#e6e2d8', '#1f1f1f', '#c9a227', '#4caf88', '#6b4c9a', '#d8d4cc']
  const downtown = ['#e07a3d', '#2f6f8f', '#f2efe4', '#6d4c7a', '#3d6b4f']
  const highway = ['#c9a227', '#1f4d6e', '#d8d4cc', '#8a3b3b', '#4caf88', '#243447']
  return (
    <group>
      <Traffic loop={RING} colors={street} lane={1.45} speed={6.5} night={night} reduced={reduced} />
      <Traffic loop={DOWNTOWN} colors={downtown} lane={1.5} speed={6.5} night={night} reduced={reduced} />
      <Traffic loop={HIGHWAY} colors={highway} lane={3.2} speed={12} night={night} reduced={reduced} />
    </group>
  )
}

function Traffic({
  loop,
  colors,
  lane,
  speed,
  night,
  reduced,
}: {
  loop: [number, number][]
  colors: string[]
  lane: number
  speed: number
  night: number
  reduced: boolean
}) {
  const ref = useRef<Group>(null)
  const progress = useRef<number[]>([])
  const length = loopLength(loop)
  useFrame(({ clock }, delta) => {
    const root = ref.current
    if (!root || reduced) return
    const count = root.children.length
    for (let index = 0; index < count; index += 1) {
      const current = progress.current[index] ?? (index * length) / count
      let gap = length
      for (let other = 0; other < count; other += 1) {
        if (other === index) continue
        const theirs = progress.current[other] ?? (other * length) / count
        let ahead = (theirs - current) % length
        if (ahead < 0) ahead += length
        if (ahead < gap) gap = ahead
      }
      const here = pointOnLoop(loop, current, lane)
      const soon = pointOnLoop(loop, current + 7, lane)
      const eastWest = Math.abs(soon.x - here.x) > Math.abs(soon.z - here.z)
      const nearCorner = loop.some((point) => Math.hypot(here.x - point[0], here.z - point[1]) < 7)
      const next = nextProgress(current, gap, nearCorner && signalRed(clock.elapsedTime, eastWest), speed, delta)
      progress.current[index] = next
      const pose = pointOnLoop(loop, next, lane)
      const child = root.children[index]
      child.position.set(pose.x, 0, pose.z)
      child.rotation.y = pose.yaw
    }
  })
  return (
    <group ref={ref}>
      {colors.map((color, index) => {
        const pose = pointOnLoop(loop, (index * length) / colors.length, lane)
        return (
          <group key={`${color}-${index}`} position={[pose.x, 0, pose.z]} rotation={[0, pose.yaw, 0]}>
            <Vehicle color={color} night={night} />
          </group>
        )
      })}
    </group>
  )
}

function Emergency({ night, reduced }: { night: number; reduced: boolean }) {
  const ref = useRef<Group>(null)
  const progress = useRef<number[]>([])
  const kinds = [
    { color: '#f4f4f4', lamp: '#1565c0', name: 'police' },
    { color: '#f7f7f7', lamp: '#c62828', name: 'ambulance' },
    { color: '#c62828', lamp: '#f9a825', name: 'fire' },
  ]
  useFrame(({ clock }, delta) => {
    const root = ref.current
    if (!root) return
    const responding = reduced ? true : Math.floor(clock.elapsedTime / 9) % 2 === 0
    const length = loopLength(RING)
    root.children.forEach((child, index) => {
      const current = progress.current[index] ?? 30 + index * 40
      let gap = length
      root.children.forEach((_, other) => {
        if (other === index) return
        const theirs = progress.current[other] ?? 30 + other * 40
        let ahead = (theirs - current) % length
        if (ahead < 0) ahead += length
        if (ahead < gap) gap = ahead
      })
      const here = pointOnLoop(RING, current, -1.7)
      const soon = pointOnLoop(RING, current + 7, -1.7)
      const eastWest = Math.abs(soon.x - here.x) > Math.abs(soon.z - here.z)
      const nearCorner = RING.some((point) => Math.hypot(here.x - point[0], here.z - point[1]) < 7)
      const next = reduced
        ? current
        : nextProgress(current, gap, nearCorner && signalRed(clock.elapsedTime, eastWest), responding ? 11 : 7, delta)
      progress.current[index] = next
      const pose = pointOnLoop(RING, next, -1.7)
      child.position.set(pose.x, 0, pose.z)
      child.rotation.y = pose.yaw
      const lamp = child.getObjectByName('lamp') as Mesh | undefined
      if (lamp) {
        if (!(lamp.material instanceof MeshStandardMaterial)) return
        const flash = responding && (reduced || Math.sin(clock.elapsedTime * 18 + index) > 0)
        lamp.material.emissiveIntensity = flash ? 2.4 : 0.15
        lamp.material.color.set(flash ? kinds[index].lamp : '#222')
      }
    })
  })
  return (
    <group ref={ref}>
      {kinds.map((kind, index) => {
        const pose = pointOnLoop(RING, 30 + index * 40, -1.7)
        return (
          <group key={kind.name} position={[pose.x, 0, pose.z]} rotation={[0, pose.yaw, 0]}>
            <Vehicle color={kind.color} night={night} lights lamp={kind.lamp} />
          </group>
        )
      })}
    </group>
  )
}

function Vehicle({ color, night, lamp }: { color: string; night: number; lights?: boolean; lamp?: string }) {
  const wheel = (x: number, z: number) => (
    <mesh key={`${x}-${z}`} position={[x, 0.16, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.16, 0.16, 0.1, 12]} />
      <meshStandardMaterial color="#1b1b1b" />
    </mesh>
  )
  return (
    <group>
      <mesh position={[0, 0.32, 0.05]}>
        <boxGeometry args={[0.78, 0.38, 1.7]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.34, 0.86]}>
        <boxGeometry args={[0.8, 0.12, 0.12]} />
        <meshStandardMaterial color="#2c3136" />
      </mesh>
      <mesh position={[0, 0.34, -0.82]}>
        <boxGeometry args={[0.8, 0.12, 0.1]} />
        <meshStandardMaterial color="#2c3136" />
      </mesh>
      <mesh position={[0, 0.62, -0.05]}>
        <boxGeometry args={[0.68, 0.32, 0.78]} />
        <meshStandardMaterial color="#d5e7ef" metalness={0.15} roughness={0.18} />
      </mesh>
      <mesh position={[0, 0.64, 0.36]}>
        <boxGeometry args={[0.6, 0.22, 0.04]} />
        <meshStandardMaterial color="#9fd0ea" metalness={0.4} roughness={0.08} />
      </mesh>
      {[-0.28, 0.28].map((x) => (
        <mesh key={x} position={[x, 0.36, 0.86]}>
          <boxGeometry args={[0.16, 0.1, 0.06]} />
          <meshBasicMaterial color={night > 0.35 ? '#fff6d0' : '#f4efe4'} toneMapped={false} />
        </mesh>
      ))}
      {[-0.26, 0.26].map((x) => (
        <mesh key={`tail-${x}`} position={[x, 0.36, -0.86]}>
          <boxGeometry args={[0.16, 0.08, 0.05]} />
          <meshStandardMaterial color="#ffb4a8" emissive="#e23b2f" emissiveIntensity={0.35 + night * 1.3} />
        </mesh>
      ))}
      {wheel(-0.38, 0.48)}
      {wheel(0.38, 0.48)}
      {wheel(-0.38, -0.48)}
      {wheel(0.38, -0.48)}
      {lamp && (
        <mesh name="lamp" position={[0, 0.86, 0]}>
          <boxGeometry args={[0.42, 0.1, 0.28]} />
          <meshStandardMaterial color={lamp} emissive={lamp} emissiveIntensity={0.2} />
        </mesh>
      )}
    </group>
  )
}

function Promenade() {
  return (
    <group>
      {WALK.map((point, index) => {
        const next = WALK[(index + 1) % WALK.length]
        if (point[2] > 1 && next[2] > 1) return null
        return <PathSegment key={`${point[0]}-${point[1]}-${index}`} a={point} b={next} />
      })}
      {[
        [-34, -36],
        [-34, 42],
        [54, -36],
        [54, 42],
      ].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0.06, z]}>
          {[-1.2, -0.4, 0.4, 1.2].map((offset) => (
            <mesh key={offset} position={[0, 0, offset]}>
              <boxGeometry args={[2.4, 0.02, 0.35]} />
              <meshStandardMaterial color="#f4f1e8" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function PathSegment({ a, b }: { a: [number, number, number]; b: [number, number, number] }) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const dy = b[2] - a[2]
  const horiz = Math.hypot(dx, dz)
  const len = Math.hypot(horiz, dy)
  const yaw = Math.atan2(dx, dz)
  const pitch = -Math.atan2(dy, Math.max(horiz, 0.001))
  return (
    <group position={[(a[0] + b[0]) / 2, (a[2] + b[2]) / 2 + 0.05, (a[1] + b[1]) / 2]} rotation={[pitch, yaw, 0]}>
      <mesh>
        <boxGeometry args={[2.4, 0.04, len]} />
        <meshStandardMaterial color="#e7dfd2" roughness={0.84} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.12, 0.02, len * 0.92]} />
        <meshStandardMaterial color="#c4b49a" />
      </mesh>
    </group>
  )
}

function Pedestrians({ night, reduced }: { night: number; reduced: boolean }) {
  const shirts = ['#355c7d', '#c47b4a', '#3d6b4f', '#8a4b78', '#2f4f6f', '#a15c38', '#d98a3a', '#1f6f6a', '#8a6232', '#c4554a', '#6b4c9a', '#e6d3a3', '#2a628a', '#d4655a', '#5ea88a', '#243447']
  return (
    <group>
      <Walkers loop={RING} colors={shirts} lane={3.2} night={night} reduced={reduced} />
      <Walkers loop={DOWNTOWN} colors={[...shirts, ...shirts.slice(0, 4)]} lane={4.2} night={night} reduced={reduced} />
      <Walkers loop={HIGHWAY} colors={shirts.slice(0, 12)} lane={9.2} night={night} reduced={reduced} />
      <PromenadeWalkers colors={shirts} night={night} reduced={reduced} />
    </group>
  )
}

function PromenadeWalkers({ colors, night, reduced }: { colors: string[]; night: number; reduced: boolean }) {
  const ref = useRef<Group>(null)
  const crowd = [...colors, ...colors.slice(0, 6)]
  useFrame(({ clock }) => {
    const root = ref.current
    if (!root || reduced) return
    root.children.forEach((child, index) => {
      const pose = pointOnWalk(WALK, clock.elapsedTime * 1.35 + index * 18)
      child.position.set(pose.x, pose.y, pose.z)
      child.rotation.y = pose.yaw
    })
  })
  return (
    <group ref={ref}>
      {crowd.map((color, index) => {
        const pose = pointOnWalk(WALK, index * 18)
        return (
          <group key={`${color}-${index}`} position={[pose.x, pose.y, pose.z]} rotation={[0, pose.yaw, 0]}>
            <Person color={color} night={night} dog={index % 4 === 0} />
          </group>
        )
      })}
    </group>
  )
}

function Walkers({
  loop,
  colors,
  lane,
  night,
  reduced,
}: {
  loop: [number, number][]
  colors: string[]
  lane: number
  night: number
  reduced: boolean
}) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const root = ref.current
    if (!root || reduced) return
    root.children.forEach((child, index) => {
      const side = index % 2 === 0 ? lane : -lane
      const along = clock.elapsedTime * 1.15 + index * 16
      const pose = pointOnLoop(loop, along, side)
      const near = loop.some((point) => Math.hypot(pose.x - point[0], pose.z - point[1]) < 3.2)
      const wait = near && signalRed(clock.elapsedTime, index % 2 === 0)
      if (!wait) {
        child.position.set(pose.x, 0, pose.z)
        child.rotation.y = pose.yaw
      }
    })
  })
  return (
    <group ref={ref}>
      {colors.map((color, index) => {
        const side = index % 2 === 0 ? lane : -lane
        const pose = pointOnLoop(loop, index * 16, side)
        return (
          <group key={`${color}-${index}`} position={[pose.x, 0, pose.z]} rotation={[0, pose.yaw, 0]}>
            <Person color={color} night={night} dog={index % 3 === 0} />
          </group>
        )
      })}
    </group>
  )
}

function Person({ color, night, dog = false }: { color: string; night: number; dog?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.82, 0]}>
        <capsuleGeometry args={[0.13, 0.34, 4, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color={night > 0.6 ? '#8d6b52' : '#e6c2a2'} />
      </mesh>
      {dog && (
        <group position={[0.42, 0, 0.15]}>
          <mesh position={[0, 0.16, 0]}>
            <capsuleGeometry args={[0.07, 0.16, 3, 6]} />
            <meshStandardMaterial color="#8a6232" />
          </mesh>
          <mesh position={[0.12, 0.24, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color="#6d4c32" />
          </mesh>
          <mesh position={[-0.16, 0.28, 0]} rotation={[0, 0, 0.7]}>
            <cylinderGeometry args={[0.012, 0.012, 0.34, 4]} />
            <meshStandardMaterial color="#c9b48a" />
          </mesh>
        </group>
      )}
    </group>
  )
}

function Wildlife({ reduced }: { reduced: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const root = ref.current
    if (!root || reduced) return
    root.children.forEach((child, index) => {
      child.position.y = Math.sin(clock.elapsedTime * 2 + index) * 0.04
    })
  })
  return (
    <group ref={ref}>
      {[
        [-42, -44],
        [28, 46],
        [-46, 20],
      ].map(([x, z]) => (
        <mesh key={`${x}`} position={[x + 1.2, 0.12, z + 0.8]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#6e6256" />
        </mesh>
      ))}
    </group>
  )
}

function Birds({ reduced }: { reduced: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const root = ref.current
    if (!root || reduced) return
    root.children.forEach((child, index) => {
      const t = clock.elapsedTime * 0.35 + index
      child.position.set(Math.cos(t) * (22 + index * 6), 18 + index * 2, Math.sin(t * 0.8) * 20 - 30)
      child.rotation.y = -t
      const flap = Math.sin(clock.elapsedTime * 9 + index) * 0.7
      const left = child.getObjectByName('wing-left')
      const right = child.getObjectByName('wing-right')
      if (left) left.rotation.z = flap
      if (right) right.rotation.z = -flap
    })
  })
  const colors = ['#2c3338', '#6d5344', '#f4f1e8', '#3a4a55', '#8a6232', '#1f3344']
  return (
    <group ref={ref}>
      {colors.map((color, index) => (
        <group key={color} position={[index * 4, 18, -20]}>
          <mesh scale={[1, 0.7, 1.5]}>
            <sphereGeometry args={[0.16, 8, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.05, 0.22]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.04, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.03, 0.08, 5]} />
            <meshStandardMaterial color="#e0a15a" />
          </mesh>
          <mesh name="wing-left" position={[-0.16, 0, 0]}>
            <boxGeometry args={[0.42, 0.03, 0.16]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh name="wing-right" position={[0.16, 0, 0]}>
            <boxGeometry args={[0.42, 0.03, 0.16]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, 0.02, -0.22]} rotation={[0.4, 0, 0]}>
            <boxGeometry args={[0.08, 0.02, 0.16]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const GATES = [-22, -2, 18, 38]

type FlightPoint = [number, number, number]

type FlightCourse = {
  points: FlightPoint[]
  times: number[]
}

/** Land on the far runway, taxi to a gate, board, taxi to the near runway, and climb back onto the approach. */
function course(gate: number, link: number): FlightCourse {
  const points: FlightPoint[] = [
    [420, 52, -230],
    [240, 18, -230],
    [150, 0.35, -230],
    [link, 0.35, -230],
    [link, 0.35, -196],
    [link, 0.35, -176],
    [gate, 0.35, -176],
    [gate, 0.35, -171],
    [gate, 0.35, -171],
    [gate, 0.35, -176],
    [link, 0.35, -176],
    [link, 0.35, -196],
    [-115, 0.35, -196],
    [45, 0.35, -196],
    [175, 20, -214],
    [320, 46, -230],
    [420, 52, -230],
  ]
  const durations = [8, 7, 6, 7, 5, 6, 5, 14, 5, 6, 5, 8, 7, 6, 7, 8]
  const times = [0]
  for (const span of durations) times.push(times[times.length - 1] + span)
  return { points, times }
}

const FLIGHT_WEST = course(-22, -36)
const FLIGHT_EAST = course(18, 52)

function timedCourse(points: FlightPoint[], durations: number[]): FlightCourse {
  const times = [0]
  for (const span of durations) times.push(times[times.length - 1] + span)
  return { points, times }
}

const HELI_NEAR = timedCourse(
  [
    [86, 1.4, -158],
    [86, 1.4, -158],
    [86, 14, -158],
    [114, 30, -118],
    [128, 32, -30],
    [136, 28, 40],
    [40, 28, 82],
    [-78, 28, 58],
    [-152, 26, 26],
    [-140, 32, -80],
    [-40, 34, -128],
    [70, 28, -150],
    [86, 12, -158],
    [86, 1.4, -158],
    [86, 1.4, -158],
  ],
  [8, 4, 7, 7, 7, 8, 8, 8, 8, 8, 7, 5, 4, 8],
)

const HELI_FAR = timedCourse(
  [
    [-168, 1.4, -252],
    [-168, 1.4, -252],
    [-168, 16, -252],
    [-150, 28, -160],
    [-158, 24, 20],
    [-40, 26, 100],
    [70, 28, 120],
    [168, 26, 68],
    [168, 24, -16],
    [90, 32, -140],
    [-80, 30, -200],
    [-168, 14, -252],
    [-168, 1.4, -252],
    [-168, 1.4, -252],
  ],
  [8, 4, 7, 8, 8, 8, 8, 7, 8, 8, 6, 4, 8],
)

function applyFlight(group: Group | null, route: FlightCourse, elapsed: number) {
  if (!group) return
  const pose = flightPose(route, elapsed)
  group.position.set(pose.x, pose.y, pose.z)
  group.rotation.order = 'YXZ'
  group.rotation.y = pose.yaw
  group.rotation.x = pose.pitch
  group.rotation.z = 0
}

function flightPose(route: FlightCourse, elapsed: number) {
  const { points, times } = route
  const total = times[times.length - 1]
  const time = ((elapsed % total) + total) % total
  let index = 0
  while (index < times.length - 2 && time > times[index + 1]) index += 1
  const span = times[index + 1] - times[index] || 1
  const u = Math.min(1, Math.max(0, (time - times[index]) / span))
  const from = points[index]
  const to = points[index + 1]
  const heading = segmentYaw(from, to, 0)
  const previous = index > 0 ? segmentYaw(points[index - 1], from, heading) : heading
  const horiz = Math.hypot(to[0] - from[0], to[2] - from[2])
  const pitch = -Math.atan2(to[1] - from[1], Math.max(horiz, 0.001))
  return {
    x: from[0] + (to[0] - from[0]) * u,
    y: from[1] + (to[1] - from[1]) * u,
    z: from[2] + (to[2] - from[2]) * u,
    yaw: lerpAngle(previous, heading, Math.min(1, u / 0.22)),
    pitch: Math.max(-0.4, Math.min(0.3, pitch)),
  }
}

function segmentYaw(from: FlightPoint, to: FlightPoint, fallback: number) {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  if (dx * dx + dz * dz < 0.04) return fallback
  return Math.atan2(dx, dz)
}

function lerpAngle(from: number, to: number, t: number) {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * t
}

function Airport({ night, reduced }: { night: number; reduced: boolean }) {
  const plane = useRef<Group>(null)
  const landing = useRef<Group>(null)
  const nearHeli = useRef<Group>(null)
  const farHeli = useRef<Group>(null)
  const boarding = useRef<Group>(null)
  const airSign = useMemo(() => signTexture('Xoral Air', 'Gates for boarding', '#1f6f6a'), [])
  useFrame(({ clock }) => {
    const period = FLIGHT_WEST.times[FLIGHT_WEST.times.length - 1]
    applyFlight(plane.current, FLIGHT_WEST, reduced ? period * 0.42 : clock.elapsedTime)
    applyFlight(landing.current, FLIGHT_EAST, reduced ? period * 0.05 : clock.elapsedTime + period * 0.5)
    const heliPeriod = HELI_NEAR.times[HELI_NEAR.times.length - 1]
    applyFlight(nearHeli.current, HELI_NEAR, reduced ? 0 : clock.elapsedTime)
    applyFlight(farHeli.current, HELI_FAR, reduced ? 0 : clock.elapsedTime + heliPeriod * 0.5)
    if (boarding.current && !reduced) {
      boarding.current.children.forEach((gate, index) => {
        gate.children.forEach((person, step) => {
          const t = (clock.elapsedTime * 0.12 + index * 0.2 + step * 0.18) % 1
          person.position.z = -161 - t * 8
        })
      })
    }
  })
  return (
    <group>
      <RunwayStrip runway={RUNWAY} night={night} />
      <RunwayStrip runway={LANDING} night={night} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8, -0.03, -176]}>
        <planeGeometry args={[120, 10]} />
        <meshStandardMaterial color="#4a545c" roughness={0.9} />
      </mesh>
      {[-36, 8, 52].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.025, -206]}>
          <planeGeometry args={[8, 62]} />
          <meshStandardMaterial color="#4a545c" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[8, 3.1, -156]}>
        <boxGeometry args={[78, 6.2, 12]} />
        <meshStandardMaterial color="#f4f7fb" roughness={0.35} metalness={0.08} />
      </mesh>
      <mesh position={[8, 6.4, -156]}>
        <boxGeometry args={[80, 0.45, 14]} />
        <meshStandardMaterial color="#1f6f6a" />
      </mesh>
      <mesh position={[8, 3.4, -149.9]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[70, 3.2]} />
        <meshStandardMaterial color="#d7e8f4" emissive="#fff4d4" emissiveIntensity={0.15 + night * 0.8} />
      </mesh>
      <mesh position={[8, 5.2, -149.95]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[16, 3.2]} />
        <meshStandardMaterial map={airSign} emissive="#fff6e4" emissiveMap={airSign} emissiveIntensity={0.2 + night * 0.7} />
      </mesh>
      <group position={[-52, 0, -156]}>
        <mesh position={[0, 8, 0]}>
          <cylinderGeometry args={[1.1, 1.5, 16, 8]} />
          <meshStandardMaterial color="#e7eef4" />
        </mesh>
        <mesh position={[0, 16.6, 0]}>
          <cylinderGeometry args={[2.4, 2.4, 2.2, 10]} />
          <meshStandardMaterial color="#9fd0ea" emissive="#d7e8f4" emissiveIntensity={0.1 + night * 0.7} />
        </mesh>
        <mesh position={[0, 18.2, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 2.2, 6]} />
          <meshStandardMaterial color="#d5dde4" />
        </mesh>
      </group>
      {GATES.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 2.2, -166]}>
            <boxGeometry args={[1.4, 2.4, 8]} />
            <meshStandardMaterial color="#d9e2ea" />
          </mesh>
        </group>
      ))}
      <group ref={boarding}>
        {GATES.map((x) => (
          <group key={x} position={[x + 1.6, 0, 0]}>
            {['#355c7d', '#c47b4a', '#3d6b4f'].map((color, index) => (
              <group key={color} position={[0, 0, -161 - index]}>
                <Person color={color} night={night} />
              </group>
            ))}
          </group>
        ))}
      </group>
      <Helipad x={86} z={-158} night={night} />
      <Helipad x={-168} z={-252} night={night} />
      <group ref={nearHeli} position={[86, 1.2, -158]}>
        <Helicopter color="#e07a3d" />
      </group>
      <group ref={farHeli} position={[-168, 1.2, -252]}>
        <Helicopter color="#1f6f6a" />
      </group>
      <group ref={plane}>
        <Aircraft color="#f4f7fb" />
      </group>
      <group ref={landing}>
        <Aircraft color="#d5dee8" />
      </group>
    </group>
  )
}

function RunwayStrip({ runway, night }: { runway: { x: number; z: number; length: number; width: number }; night: number }) {
  const west = runway.x - runway.length / 2
  const east = runway.x + runway.length / 2
  const lights: number[] = []
  for (let x = west; x <= east; x += 14) lights.push(x)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[runway.x, -0.045, runway.z]}>
        <planeGeometry args={[runway.length + 6, runway.width + 4]} />
        <meshStandardMaterial color="#3a4248" roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[runway.x, -0.02, runway.z]}>
        <planeGeometry args={[runway.length, 0.35]} />
        <meshStandardMaterial color="#f4f1e8" />
      </mesh>
      {lights.map((x) => (
        <group key={x}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[x, 0.1, runway.z + side * (runway.width / 2 + 0.7)]}>
              <boxGeometry args={[0.7, 0.08, 0.7]} />
              <meshStandardMaterial color="#fff6d8" emissive="#fff1c2" emissiveIntensity={0.5 + night * 2.4} />
            </mesh>
          ))}
        </group>
      ))}
      {[west + 3, east - 3].map((x) => (
        <mesh key={x} position={[x, 0.12, runway.z]}>
          <boxGeometry args={[2.2, 0.08, 2.2]} />
          <meshStandardMaterial color="#7dffb0" emissive="#3ddc78" emissiveIntensity={0.45 + night * 1.8} />
        </mesh>
      ))}
    </group>
  )
}

function Helipad({ x, z, night }: { x: number; z: number; night: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[8, 28]} />
        <meshStandardMaterial color="#2e3842" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[6.1, 6.6, 28]} />
        <meshStandardMaterial color="#f4f1e8" emissive="#fff6d8" emissiveIntensity={night * 0.4} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.1, 2.4]} />
        <meshStandardMaterial color="#f0b429" emissive="#f0b429" emissiveIntensity={night * 0.5} />
      </mesh>
      <mesh position={[0, 0.06, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.8, 0.35]} />
        <meshStandardMaterial color="#f0b429" emissive="#f0b429" emissiveIntensity={night * 0.5} />
      </mesh>
    </group>
  )
}

function Helicopter({ color }: { color: string }) {
  const mainRotor = useRef<Mesh>(null)
  const tailRotor = useRef<Mesh>(null)
  useFrame((_, delta) => {
    if (mainRotor.current) mainRotor.current.rotation.y += delta * 22
    if (tailRotor.current) tailRotor.current.rotation.x += delta * 28
  })
  return (
    <group>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[2.4, 0.7, 0.95]} />
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.88, 1.15]}>
        <boxGeometry args={[0.72, 0.48, 0.85]} />
        <meshStandardMaterial color="#b7d4e4" metalness={0.35} roughness={0.12} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[1.5, 0.06, 0.08]} />
        <meshStandardMaterial color="#2a3036" />
      </mesh>
      <mesh ref={mainRotor} position={[0, 1.2, 0]}>
        <boxGeometry args={[5.4, 0.04, 0.18]} />
        <meshStandardMaterial color="#2a3036" />
      </mesh>
      <mesh position={[0, 0.85, -1.45]}>
        <boxGeometry args={[0.1, 0.45, 0.7]} />
        <meshStandardMaterial color="#2a3036" />
      </mesh>
      <mesh ref={tailRotor} position={[0.2, 0.95, -1.7]}>
        <boxGeometry args={[0.04, 0.9, 0.08]} />
        <meshStandardMaterial color="#2a3036" />
      </mesh>
    </group>
  )
}

function Aircraft({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.5, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.46, 6.4, 16]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.5, 3.55]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.42, 1.35, 16]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.72, 1.7]}>
        <boxGeometry args={[0.62, 0.22, 1.15]} />
        <meshStandardMaterial color="#b9dff2" metalness={0.45} roughness={0.08} />
      </mesh>
      <mesh position={[0, 0.52, 0.15]}>
        <boxGeometry args={[9.2, 0.08, 1.7]} />
        <meshStandardMaterial color="#d5dee6" metalness={0.25} roughness={0.42} />
      </mesh>
      {[-4.35, 4.35].map((x) => (
        <mesh key={x} position={[x, 0.62, -0.55]}>
          <boxGeometry args={[0.08, 0.28, 0.42]} />
          <meshStandardMaterial color="#8ea0ae" />
        </mesh>
      ))}
      {[-2.15, 2.15].map((x) => (
        <mesh key={x} position={[x, 0.28, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.22, 1.35, 12]} />
          <meshStandardMaterial color="#4d5963" metalness={0.45} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 1.15, -3.15]}>
        <boxGeometry args={[0.08, 1.2, 0.85]} />
        <meshStandardMaterial color="#8ea0ae" />
      </mesh>
      <mesh position={[0, 0.72, -3.4]}>
        <boxGeometry args={[2.8, 0.07, 0.62]} />
        <meshStandardMaterial color="#8ea0ae" />
      </mesh>
    </group>
  )
}

function Billboard({
  position,
  texture,
  w,
  h,
  night = 0,
}: {
  position: [number, number, number]
  texture: CanvasTexture
  w: number
  h: number
  night?: number
}) {
  return (
    <group position={position}>
      <mesh position={[-w / 2 + 0.2, h / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.14, h, 6]} />
        <meshStandardMaterial color="#5c656c" />
      </mesh>
      <mesh position={[w / 2 - 0.2, h / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.14, h, 6]} />
        <meshStandardMaterial color="#5c656c" />
      </mesh>
      <mesh position={[0, h * 0.72, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={texture} emissive="#fff6e4" emissiveMap={texture} emissiveIntensity={0.2 + night * 0.85} />
      </mesh>
    </group>
  )
}

function RotatingBoard({
  position,
  textures,
  reduced,
  night,
}: {
  position: [number, number, number]
  textures: CanvasTexture[]
  reduced: boolean
  night: number
}) {
  const face = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const mesh = face.current
    if (!mesh) return
    const index = reduced ? 0 : Math.floor(clock.elapsedTime / 6) % textures.length
    if (!(mesh.material instanceof MeshStandardMaterial)) return
    if (mesh.material.map !== textures[index]) {
      mesh.material.map = textures[index]
      mesh.material.emissiveMap = textures[index]
    }
  })
  return (
    <group position={position}>
      <mesh position={[0, 2.4, 0]} ref={face}>
        <planeGeometry args={[7.2, 3.2]} />
        <meshStandardMaterial map={textures[0]} emissive="#fff6e4" emissiveMap={textures[0]} emissiveIntensity={0.2 + night * 0.9} />
      </mesh>
    </group>
  )
}

function LotPad({ lot, owned }: { lot: Lot; owned: boolean }) {
  const label = useMemo(() => signTexture(owned ? lot.name : 'Land for sale', owned ? 'Your lot' : lot.use, owned ? '#1f6f6a' : '#8a6a32'), [lot, owned])
  return (
    <group position={[lot.x, 0, lot.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[8, 6]} />
        <meshStandardMaterial color={owned ? '#6e8f62' : '#c2b48a'} />
      </mesh>
      <Billboard position={[0, 0, 2.2]} texture={label} w={3.4} h={1.6} />
    </group>
  )
}

function windowSheets(): { glass: CanvasTexture; glow: CanvasTexture; glassB: CanvasTexture; glowB: CanvasTexture } {
  const glass = paneTexture(0, false)
  const glow = paneTexture(0, true)
  const glassB = paneTexture(5, false)
  const glowB = paneTexture(5, true)
  return { glass, glow, glassB, glowB }
}

function paneTexture(shift: number, glow: boolean): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw tower windows')
  const paints = ['#d7e8f6', '#f4efe4', '#d5efe4', '#f6e4ea']
  ctx.fillStyle = glow ? '#000000' : paints[shift % paints.length]
  ctx.fillRect(0, 0, 128, 256)
  ctx.fillStyle = glow ? '#000000' : '#6d7c8a'
  for (let y = 0; y < 256; y += 18) ctx.fillRect(0, y, 128, 3)
  for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 3, 256)
  for (let y = 4; y < 250; y += 18) {
    for (let x = 4; x < 124; x += 16) {
      const cell = (x + shift + y * 3) % 11
      const on = cell > 2
      if (!glow || !on) continue
      ctx.fillStyle = cell % 4 === 0 ? '#d6ecff' : '#ffe7b0'
      ctx.fillRect(x, y, 10, 12)
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
  return texture
}

function repeated(source: CanvasTexture, across: number, up: number): CanvasTexture {
  const tex = source.clone()
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.repeat.set(across, up)
  tex.needsUpdate = true
  return tex
}

function signTexture(title: string, line: string, accent: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a billboard')
  ctx.fillStyle = '#1b242c'
  ctx.fillRect(0, 0, 512, 256)
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, 18, 256)
  ctx.fillStyle = '#f4efe4'
  let size = 54
  ctx.font = `700 ${size}px Georgia, serif`
  while (size > 28 && ctx.measureText(title).width > 450) {
    size -= 2
    ctx.font = `700 ${size}px Georgia, serif`
  }
  ctx.fillText(title, 42, 110)
  ctx.fillStyle = '#d5d0c4'
  ctx.font = '28px Segoe UI, sans-serif'
  wrap(ctx, line, 42, 160, 430)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  const words = text.split(' ')
  let line = ''
  let top = y
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > max) {
      ctx.fillText(line, x, top)
      line = word
      top += 34
    } else {
      line = next
    }
  }
  ctx.fillText(line, x, top)
}
