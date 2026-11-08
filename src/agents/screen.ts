export type ScreenView =
  | {
      kind: 'desktop'
      image: string
      note?: string
      width?: number
      height?: number
      cursor?: { x: number; y: number }
      click?: boolean
    }
  | { kind: 'page'; url: string; title?: string; image?: string; summary?: string }
  | { kind: 'image'; src: string; caption?: string; made?: boolean }
  | { kind: 'idle' }

type Listener = (view: ScreenView) => void

const listeners = new Set<Listener>()
let current: ScreenView = { kind: 'idle' }

export function currentScreen(): ScreenView {
  return current
}

export function subscribeScreen(fn: Listener): () => void {
  listeners.add(fn)
  fn(current)
  return () => {
    listeners.delete(fn)
  }
}

export function setScreen(view: ScreenView): void {
  current = view
  for (const fn of listeners) fn(view)
}

export function clearScreen(): void {
  setScreen({ kind: 'idle' })
}
