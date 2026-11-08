import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

export function NameBadge({ name, dim }: { name: string; dim?: boolean }) {
  const texture = useMemo(() => paint(name), [name])
  return (
    <group position={[0.07, 1.14, 0.12]}>
      <mesh>
        <boxGeometry args={[0.16, 0.05, 0.008]} />
        <meshStandardMaterial color="#f4eee4" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <planeGeometry args={[0.15, 0.04]} />
        <meshBasicMaterial map={texture} transparent opacity={dim ? 0.4 : 1} toneMapped={false} />
      </mesh>
    </group>
  )
}

function paint(name: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not paint a name tag')
  ctx.fillStyle = '#f4eee4'
  ctx.fillRect(0, 0, 128, 32)
  ctx.fillStyle = '#1a1e22'
  ctx.font = '700 16px Outfit, Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name.slice(0, 10), 64, 17)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}
