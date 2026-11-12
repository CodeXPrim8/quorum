import { useEffect, useRef } from 'react'
import { speakAs } from '../agents/speak'
import type { AttentionCue } from '../types'

const PLAYED = 'qsi.attention.played'

function alreadyPlayed(id: string): boolean {
  try {
    return sessionStorage.getItem(PLAYED) === id
  } catch {
    return false
  }
}

function markPlayed(id: string) {
  try {
    sessionStorage.setItem(PLAYED, id)
  } catch {
    /* Private mode can block storage. The chime still plays this once. */
  }
}

function chime() {
  const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
  ;[880, 1174, 1568].forEach((freq, index) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + index * 0.16
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.3)
  })
  window.setTimeout(() => void ctx.close().catch(() => undefined), 1400)
}

/** Alarm and spoken call when a staff member needs the chairman. */
export function AttentionBell({ cue }: { cue?: AttentionCue }) {
  const played = useRef('')

  useEffect(() => {
    if (!cue || played.current === cue.id || alreadyPlayed(cue.id)) return
    played.current = cue.id
    markPlayed(cue.id)
    chime()
    const timer = window.setTimeout(() => {
      void speakAs(cue.spoken, { id: cue.staffId, name: cue.staffName })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [cue])

  if (!cue) return null
  return (
    <div className="attention-bar" role="status">
      <p>
        <strong>{cue.staffName}</strong> is calling you. {cue.spoken}
      </p>
      <a href={`#/history/${cue.threadId}`}>Quorum chat</a>
      <a href={`#/whatsapp/${cue.phone}`}>Set the price</a>
    </div>
  )
}
