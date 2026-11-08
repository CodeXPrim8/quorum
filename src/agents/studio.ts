import { posterShape } from '../domain/poster'
import type { AppState, Command, Design, Product } from '../types'

export async function designStudioReady(): Promise<boolean> {
  try {
    const response = await fetch('/api/design/status')
    const payload = (await response.json()) as { ready?: boolean }
    return Boolean(payload.ready)
  } catch {
    return false
  }
}

export async function requestQuorumPicture(prompt: string, brand: string): Promise<string> {
  const response = await fetch('/api/design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: prompt.slice(0, 40),
      brand,
      kind: 'service',
      note: prompt.slice(0, 80),
    }),
  })
  if (!response.ok) throw new Error('picture-failed')
  const payload = (await response.json()) as { image?: string }
  if (!payload.image?.startsWith('data:image/')) throw new Error('picture-failed')
  return compressArt(payload.image)
}

export async function requestDesignArt(design: Design, brand: string, product?: Product): Promise<string> {
  const response = await fetch('/api/design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: design.title,
      product: design.productName || product?.name || '',
      fact: design.fact || product?.fact || design.brief,
      kind: product?.kind || '',
      brand,
      shape: posterShape(design.format),
      note: design.direction || '',
    }),
  })
  if (response.status === 503) throw new Error('studio-offline')
  if (!response.ok) throw new Error('studio-failed')
  const payload = (await response.json()) as { image?: string }
  if (!payload.image?.startsWith('data:image/')) throw new Error('studio-failed')
  return compressArt(payload.image)
}

export async function compressArt(dataUrl: string): Promise<string> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const bitmap = await createImageBitmap(blob)
    const max = 720
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return dataUrl
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return dataUrl
  }
}

export function pendingArt(state: AppState): Design | undefined {
  return (state.designs ?? []).find((design) => design.artStatus === 'pending' && !design.art)
}

export function artCommand(designId: string, image?: string): Command {
  return { type: 'SET_DESIGN_ART', designId, image }
}
