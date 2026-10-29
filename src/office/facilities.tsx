import { tvTexture } from './screens'
import { barSeats, cafeSeats, loungeSeats, type Spot } from './world'

/** Lounge, cafeteria, toilets, server racks, and the operations screen wall. */
export function Facilities({ lit }: { lit: boolean }) {
  const wall = tvTexture('operations')
  const west = loungeSeats.filter((seat) => seat.facing > 0)
  const east = loungeSeats.filter((seat) => seat.facing < 0)
  return (
    <group>
      <Lounge west={west} east={east} lit={lit} />
      <Cafeteria lit={lit} />
      {[20.6, 22.4, 24.2].map((z) => (
        <group key={z} position={[16.5, 0, z]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.7, 0.7, 1]} />
            <meshStandardMaterial color="#e7eef2" />
          </mesh>
          <mesh position={[0, 0.95, -0.2]}>
            <boxGeometry args={[0.55, 0.4, 0.12]} />
            <meshStandardMaterial color="#d5dee6" />
          </mesh>
        </group>
      ))}
      {[17.4, 19.7].map((x) => (
        <group key={x} position={[x, 0, 22.9]}>
          <mesh position={[0, 1.05, 0]} castShadow>
            <boxGeometry args={[0.5, 2, 4.8]} />
            <meshStandardMaterial color="#1a2430" />
          </mesh>
          {[-1.6, -0.6, 0.4, 1.4].map((z) => (
            <mesh key={z} position={[0.27, 1.35, z]}>
              <boxGeometry args={[0.04, 0.1, 0.55]} />
              <meshStandardMaterial color="#39e6c5" emissive="#39e6c5" emissiveIntensity={lit ? 1.5 : 0.15} />
            </mesh>
          ))}
        </group>
      ))}
      <group position={[22.2, 1.45, 25.7]}>
        {[-1.15, 0, 1.15].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh>
              <boxGeometry args={[1.05, 0.7, 0.06]} />
              <meshStandardMaterial color="#101820" />
            </mesh>
            <mesh position={[0, 0, 0.04]}>
              <planeGeometry args={[0.92, 0.56]} />
              <meshBasicMaterial map={wall} color={lit ? '#ffffff' : '#141414'} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function Lounge({ west, east, lit }: { west: Spot[]; east: Spot[]; lit: boolean }) {
  return (
    <group>
      <mesh position={[5.55, 0.04, 21.8]} receiveShadow>
        <boxGeometry args={[4.35, 0.02, 2.55]} />
        <meshStandardMaterial color="#c4a484" roughness={0.9} />
      </mesh>
      <mesh position={[5.55, 0.055, 21.8]}>
        <boxGeometry args={[4.05, 0.016, 2.25]} />
        <meshStandardMaterial color="#efe4d4" roughness={0.92} />
      </mesh>
      <Sofa position={sofaAnchor(west)} rotation={Math.PI / 2} />
      <Sofa position={sofaAnchor(east)} rotation={-Math.PI / 2} />
      <CoffeeTable />
      <Pendant x={5.55} z={21.8} lit={lit} />
      <LoungeBar lit={lit} />
      {barSeats.map((seat) => (
        <group key={`${seat.x}-${seat.y}`} position={[seat.x, 0, seat.y]} rotation={[0, seat.facing, 0]}>
          <BarStool />
        </group>
      ))}
      <mesh position={[3.34, 1.45, 21.8]}>
        <boxGeometry args={[0.04, 0.7, 1.15]} />
        <meshStandardMaterial color="#1f4d4a" />
      </mesh>
      <mesh position={[3.38, 1.45, 21.8]}>
        <boxGeometry args={[0.02, 0.52, 0.95]} />
        <meshStandardMaterial color="#e7d3b0" />
      </mesh>
    </group>
  )
}

function sofaAnchor(seats: Spot[]): [number, number, number] {
  const x = seats.reduce((sum, seat) => sum + seat.x, 0) / seats.length
  const z = seats.reduce((sum, seat) => sum + seat.y, 0) / seats.length
  const facing = seats[0]?.facing ?? 0
  return [x - Math.sin(facing) * 0.22, 0, z - Math.cos(facing) * 0.22]
}

function Sofa({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[
        [-0.92, -0.28],
        [0.92, -0.28],
        [-0.92, 0.22],
        [0.92, 0.22],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.1, z]} castShadow>
          <cylinderGeometry args={[0.035, 0.04, 0.2, 8]} />
          <meshStandardMaterial color="#4a3428" />
        </mesh>
      ))}
      <mesh position={[0, 0.28, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[2.16, 0.14, 0.8]} />
        <meshStandardMaterial color="#f6f1ea" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.42, 0.06]} castShadow>
        <boxGeometry args={[2.02, 0.12, 0.62]} />
        <meshStandardMaterial color="#fbf7f2" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.66, -0.3]} castShadow>
        <boxGeometry args={[2.16, 0.46, 0.16]} />
        <meshStandardMaterial color="#f6f1ea" roughness={0.82} />
      </mesh>
      <mesh position={[-1.02, 0.5, 0.02]} castShadow>
        <boxGeometry args={[0.12, 0.32, 0.8]} />
        <meshStandardMaterial color="#efe8df" roughness={0.8} />
      </mesh>
      <mesh position={[1.02, 0.5, 0.02]} castShadow>
        <boxGeometry args={[0.12, 0.32, 0.8]} />
        <meshStandardMaterial color="#efe8df" roughness={0.8} />
      </mesh>
      <mesh position={[-0.42, 0.58, -0.08]} rotation={[0.2, 0, 0.12]} castShadow>
        <boxGeometry args={[0.38, 0.28, 0.1]} />
        <meshStandardMaterial color="#c4624a" roughness={0.75} />
      </mesh>
      <mesh position={[0.48, 0.58, -0.08]} rotation={[0.18, 0, -0.1]} castShadow>
        <boxGeometry args={[0.34, 0.26, 0.1]} />
        <meshStandardMaterial color="#1f4d4a" roughness={0.75} />
      </mesh>
    </group>
  )
}

function CoffeeTable() {
  return (
    <group position={[5.55, 0, 21.8]}>
      {[
        [-0.48, -0.24],
        [0.48, -0.24],
        [-0.48, 0.24],
        [0.48, 0.24],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.2, z]}>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
          <meshStandardMaterial color="#2a2a2a" metalness={0.45} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.045, 0.62]} />
        <meshStandardMaterial color="#e4c79a" roughness={0.38} />
      </mesh>
      <mesh position={[-0.22, 0.44, 0.04]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.22, 0.03, 0.16]} />
        <meshStandardMaterial color="#6d3b32" />
      </mesh>
      <mesh position={[0.28, 0.44, -0.06]}>
        <cylinderGeometry args={[0.06, 0.05, 0.05, 12]} />
        <meshStandardMaterial color="#f4f1ea" />
      </mesh>
      <mesh position={[0.28, 0.48, -0.06]}>
        <cylinderGeometry args={[0.045, 0.05, 0.04, 12]} />
        <meshStandardMaterial color="#6b3a2a" />
      </mesh>
    </group>
  )
}

function LoungeBar({ lit }: { lit: boolean }) {
  return (
    <group position={[5.55, 0, 25.72]}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[4.15, 0.78, 0.48]} />
        <meshStandardMaterial color="#2a2420" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.8, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[4.32, 0.05, 0.62]} />
        <meshStandardMaterial color="#ece7df" roughness={0.28} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.28, 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 3.5, 8]} />
        <meshStandardMaterial color="#c6a15b" metalness={0.75} roughness={0.28} />
      </mesh>
      {[
        [-1.55, '#1f4d4a', 0.22],
        [-1.28, '#8a3a32', 0.16],
        [-1.05, '#e8d5a3', 0.18],
        [-0.82, '#2a628a', 0.14],
        [1.15, '#1f4d4a', 0.2],
        [1.4, '#c4a484', 0.15],
      ].map(([x, color, height]) => (
        <mesh key={`${x}`} position={[Number(x), 0.84 + Number(height) / 2, -0.08]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, Number(height), 10]} />
          <meshStandardMaterial color={String(color)} roughness={0.35} />
        </mesh>
      ))}
      {[-0.35, -0.12, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.88, 0.08]}>
          <cylinderGeometry args={[0.035, 0.03, 0.09, 10]} />
          <meshStandardMaterial color="#f7f4ef" transparent opacity={0.85} roughness={0.05} />
        </mesh>
      ))}
      <mesh position={[0.55, 0.95, -0.05]}>
        <boxGeometry args={[0.28, 0.22, 0.16]} />
        <meshStandardMaterial color="#1c1c1c" />
      </mesh>
      <mesh position={[0.55, 1.12, -0.05]}>
        <boxGeometry args={[0.08, 0.16, 0.08]} />
        <meshStandardMaterial color="#c6a15b" metalness={0.6} roughness={0.3} emissive={lit ? '#5a3a16' : '#000000'} emissiveIntensity={lit ? 0.4 : 0} />
      </mesh>
      <Pendant x={0} z={-0.15} lit={lit} />
    </group>
  )
}

function BarStool() {
  return (
    <group>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 0.48, 8]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.012, 8, 16]} />
        <meshStandardMaterial color="#c6a15b" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.48, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.06, 16]} />
        <meshStandardMaterial color="#1f4d4a" roughness={0.65} />
      </mesh>
    </group>
  )
}

function Cafeteria({ lit }: { lit: boolean }) {
  const tables = [cafeSeats.slice(0, 4), cafeSeats.slice(4)]
  return (
    <group>
      <mesh position={[11, 0.04, 21.7]} receiveShadow>
        <boxGeometry args={[5.15, 0.02, 3.3]} />
        <meshStandardMaterial color="#f3efe6" roughness={0.9} />
      </mesh>
      {tables.map((seats) => {
        const x = seats.reduce((sum, seat) => sum + seat.x, 0) / seats.length
        const z = seats.reduce((sum, seat) => sum + seat.y, 0) / seats.length
        return (
          <group key={`${x}`}>
            <DiningTable x={x} z={z} />
            {seats.map((seat) => (
              <group key={`${seat.x}-${seat.y}`} position={[seat.x, 0, seat.y]} rotation={[0, seat.facing, 0]}>
                <DiningChair />
              </group>
            ))}
          </group>
        )
      })}
      <FoodCounter lit={lit} />
      <Pendant x={10} z={21.62} lit={lit} />
      <Pendant x={12.2} z={21.62} lit={lit} />
    </group>
  )
}

function DiningTable({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.7, 12]} />
        <meshStandardMaterial color="#2c2c2c" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.04, 16]} />
        <meshStandardMaterial color="#2c2c2c" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.45, 0.045, 0.72]} />
        <meshStandardMaterial color="#f7f1e6" roughness={0.32} />
      </mesh>
      {[-0.32, 0.32].map((place) => (
        <group key={place} position={[place, 0.78, 0]}>
          <mesh>
            <cylinderGeometry args={[0.11, 0.11, 0.015, 16]} />
            <meshStandardMaterial color="#f4f1ea" />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color={place < 0 ? '#6b8f71' : '#c4624a'} />
          </mesh>
          <mesh position={[0.16, 0.03, 0.08]}>
            <cylinderGeometry args={[0.028, 0.03, 0.06, 10]} />
            <meshStandardMaterial color="#dceef5" transparent opacity={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function DiningChair() {
  return (
    <group>
      {[
        [-0.16, -0.14],
        [0.16, -0.14],
        [-0.16, 0.14],
        [0.16, 0.14],
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.24, z]}>
          <cylinderGeometry args={[0.018, 0.02, 0.48, 6]} />
          <meshStandardMaterial color="#2a2a2a" metalness={0.45} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 0.48, 0.02]} castShadow>
        <boxGeometry args={[0.42, 0.05, 0.4]} />
        <meshStandardMaterial color="#c4624a" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.78, -0.16]} castShadow>
        <boxGeometry args={[0.42, 0.42, 0.045]} />
        <meshStandardMaterial color="#f4efe8" roughness={0.7} />
      </mesh>
    </group>
  )
}

function FoodCounter({ lit }: { lit: boolean }) {
  return (
    <group position={[11, 0, 25.7]}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[4.7, 0.92, 0.55]} />
        <meshStandardMaterial color="#f7f4ef" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.48, 0.22]}>
        <boxGeometry args={[4.55, 0.55, 0.04]} />
        <meshStandardMaterial color="#d9e8ee" transparent opacity={0.35} roughness={0.05} />
      </mesh>
      <mesh position={[0, 0.96, 0]} receiveShadow>
        <boxGeometry args={[4.85, 0.04, 0.68]} />
        <meshStandardMaterial color="#e7e2d8" roughness={0.3} />
      </mesh>
      {[
        [-1.7, '#6b8f71'],
        [-1.15, '#c4624a'],
        [-0.65, '#e4c79a'],
        [0.55, '#d98a3a'],
      ].map(([x, color]) => (
        <group key={String(x)} position={[Number(x), 1.02, 0]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.14, 0.08, 14]} />
            <meshStandardMaterial color="#f4f1ea" />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <sphereGeometry args={[0.09, 12, 8]} />
            <meshStandardMaterial color={String(color)} />
          </mesh>
        </group>
      ))}
      <mesh position={[1.45, 1.18, 0]} castShadow>
        <boxGeometry args={[0.42, 0.36, 0.32]} />
        <meshStandardMaterial color="#2a2420" />
      </mesh>
      <mesh position={[1.45, 1.42, 0.08]}>
        <boxGeometry args={[0.16, 0.12, 0.08]} />
        <meshStandardMaterial color="#c6a15b" metalness={0.6} roughness={0.3} emissive={lit ? '#5a3a16' : '#000000'} emissiveIntensity={lit ? 0.35 : 0} />
      </mesh>
      <mesh position={[1.95, 1.1, -0.04]}>
        <cylinderGeometry args={[0.1, 0.1, 0.22, 12]} />
        <meshStandardMaterial color="#f7f4ef" />
      </mesh>
    </group>
  )
}

function Pendant({ x, z, lit }: { x: number; z: number; lit: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.15, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.7, 6]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[0, 1.78, 0]}>
        <sphereGeometry args={[0.1, 14, 12]} />
        <meshStandardMaterial
          color={lit ? '#ffe1b0' : '#2a241c'}
          emissive={lit ? '#ffb45a' : '#000000'}
          emissiveIntensity={lit ? 0.8 : 0}
          roughness={0.25}
        />
      </mesh>
    </group>
  )
}
