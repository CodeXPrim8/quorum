import { useEffect, useRef, useState } from 'react'
import { planAllowsPublish } from '../domain/social'
import type { AppState, Command, Design } from '../types'

/** Publish approved Instagram graphics when the Graph API line is connected on this server. */
export function InstagramDesk({ state, dispatch }: { state: AppState; dispatch: (command: Command) => void }) {
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const sending = useRef(new Set<string>())
  const [linked, setLinked] = useState(false)

  const companyId = state.company?.id

  useEffect(() => {
    let stop = false
    const probe = async () => {
      try {
        const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
        const response = await fetch(`/api/instagram/status${query}`)
        if (!response.ok || stop) return
        const data = (await response.json()) as { linked?: boolean }
        if (!stop) setLinked(data.linked === true)
      } catch {
        if (!stop) setLinked(false)
      }
    }
    void probe()
    const timer = window.setInterval(() => void probe(), 8000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [companyId])

  useEffect(() => {
    if (!linked || !planAllowsPublish(state.company?.planId)) return
    const pending = (state.designs ?? []).filter(
      (design) =>
        design.status === 'held' &&
        design.platform === 'instagram' &&
        design.audience !== 'internal' &&
        Boolean(design.art || design.svg) &&
        design.artStatus !== 'pending',
    )
    for (const design of pending) {
      if (sending.current.has(design.id)) continue
      sending.current.add(design.id)
      void publish(design, companyId)
        .then((result) => {
          dispatchRef.current({
            type: 'INSTAGRAM_RESULT',
            designId: design.id,
            status: result.ok ? 'published' : 'failed',
            error: result.error,
            mediaId: result.mediaId,
          })
        })
        .catch((error: unknown) => {
          dispatchRef.current({
            type: 'INSTAGRAM_RESULT',
            designId: design.id,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Instagram could not be reached.',
          })
        })
        .finally(() => {
          window.setTimeout(() => sending.current.delete(design.id), 60_000)
        })
    }
  }, [state.designs, state.company?.planId, companyId, linked])

  return null
}

async function publish(
  design: Design,
  companyId: string | undefined,
): Promise<{ ok: boolean; error?: string; mediaId?: string }> {
  const image = await imageFor(design)
  if (!image) return { ok: false, error: 'The graphic has no image Instagram can post.' }
  const caption = (design.brief || design.caption || design.title).trim().slice(0, 2200)
  const response = await fetch('/api/instagram/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption, image, companyId }),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string; mediaId?: string }
  if (!response.ok) return { ok: false, error: data.error || 'Instagram could not take that post.' }
  return { ok: true, mediaId: data.mediaId }
}

async function imageFor(design: Design): Promise<string | null> {
  if (design.art?.startsWith('data:image/')) return toJpegDataUrl(design.art)
  if (design.art && /^https:\/\//i.test(design.art)) return design.art
  if (design.svg?.includes('<svg')) return svgToJpeg(design.svg)
  return null
}

async function toJpegDataUrl(src: string): Promise<string> {
  if (/^data:image\/jpeg/i.test(src)) return src
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || 1080
  canvas.height = image.naturalHeight || 1080
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function svgToJpeg(svg: string): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    return await toJpegDataUrl(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The graphic image could not be read.'))
    image.src = src
  })
}
