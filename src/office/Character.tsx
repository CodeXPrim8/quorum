import { useLayoutEffect, useState } from 'react'
import { cx } from '../lib/format'
import type { HairStyle, Staff } from '../types'

type Props = {
  person: Staff
  label: string
  typing: boolean
  moving: boolean
  waiting: boolean
  selected: boolean
  reduced: boolean
  dimmed: boolean
  onSelect: () => void
}

export function Character({ person, label, typing, moving, waiting, selected, reduced, dimmed, onSelect }: Props) {
  const { appearance: look, presence } = person
  const [atOrigin, setAtOrigin] = useState(moving)
  useLayoutEffect(() => {
    if (!moving) {
      setAtOrigin(false)
      return
    }
    setAtOrigin(true)
    const frame = requestAnimationFrame(() => setAtOrigin(false))
    return () => cancelAnimationFrame(frame)
  }, [moving, presence.movingUntil, presence.x, presence.y])
  const left = moving && atOrigin ? presence.originX : presence.x
  const top = moving && atOrigin ? presence.originY : presence.y
  return (
    <button
      type="button"
      className={cx('character', selected && 'is-selected', dimmed && 'is-dim')}
      style={{ left: `${left}%`, top: `${top}%` }}
      data-working={typing && !reduced ? 'true' : 'false'}
      data-moving={moving ? 'true' : 'false'}
      data-mode={moving ? 'moving' : person.presence.mode}
      tabIndex={-1}
      title={`${person.name} — ${label}`}
      onClick={onSelect}
    >
      <svg viewBox="0 0 64 78" className="avatar" aria-hidden="true">
        <ellipse className="shadow" cx="32" cy="72" rx="14" ry="4" />
        <g className="legs">
          <rect x="22" y="50" width="8" height="16" rx="3" fill={look.legs} />
          <rect x="34" y="50" width="8" height="16" rx="3" fill={look.legs} />
        </g>
        <rect x="16" y="34" width="32" height="22" rx="8" fill={look.shirt} />
        <g className="arm">
          <rect x="12" y="36" width="7" height="14" rx="3" fill={look.shirt} />
          <rect x="45" y="36" width="7" height="14" rx="3" fill={look.shirt} />
        </g>
        <circle cx="32" cy="22" r="12" fill={look.skin} />
        <Hair style={look.hairStyle} color={look.hair} />
      </svg>
      <span className="character-name">{person.name.split(' ')[0]}</span>
      {waiting && <span className="mini-badge">Needs you</span>}
      {person.presence.mode === 'reporting' && !moving && <span className="mini-badge result">Result</span>}
    </button>
  )
}

function Hair({ style, color }: { style: HairStyle; color: string }) {
  if (style === 'none') return null
  if (style === 'bun') return <circle cx="32" cy="10" r="5" fill={color} />
  if (style === 'bob') return <path d="M20 20c0-10 24-10 24 2v8c-2 4-20 4-24-2z" fill={color} />
  if (style === 'crop') return <path d="M20 16c2-8 22-8 24 2 0 4-24 4-24-2z" fill={color} />
  return <path d="M21 18c1-9 22-9 23 1-2 3-20 4-23-1z" fill={color} />
}
