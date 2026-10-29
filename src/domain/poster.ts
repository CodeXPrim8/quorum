function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function wrap(value: string, maxChars: number, maxLines: number): string[] {
  const words = clip(value, maxChars * maxLines).split(' ').filter(Boolean)
  const rows: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      rows.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) rows.push(line)
  return rows.slice(0, maxLines)
}

export type PosterShape = 'square' | 'portrait' | 'landscape'

/** A campaign graphic drawn in the app. It is not a file from an outside design tool. */
export function campaignPoster(
  title: string,
  line: string,
  revision: number,
  brand = 'Quorum',
  shape: PosterShape = 'square',
): string {
  const frame =
    shape === 'portrait'
      ? { w: 360, h: 640, title: 28, body: 16, chars: 16, lines: 4, pad: 28 }
      : shape === 'landscape'
        ? { w: 640, h: 360, title: 32, body: 16, chars: 24, lines: 2, pad: 36 }
        : { w: 640, h: 640, title: 42, body: 22, chars: 16, lines: 3, pad: 36 }
  const heading = wrap(title || 'Campaign', frame.chars, frame.lines)
  const detail = wrap(line || 'Draft for review', shape === 'portrait' ? 22 : 34, 2)
  const ink = revision % 2 === 0 ? '#1f6f6a' : '#c2512a'
  const wash = revision % 2 === 0 ? '#e7f3f1' : '#f8ebe4'
  const label = escapeXml(heading.join(' '))
  const x = 48
  const head = heading
    .map((row, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : Math.round(frame.title * 1.15)}">${escapeXml(row)}</tspan>`)
    .join('')
  const body = detail
    .map((row, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : Math.round(frame.body * 1.35)}">${escapeXml(row)}</tspan>`)
    .join('')
  const headY = shape === 'landscape' ? 150 : Math.round(frame.h * 0.34)
  const bodyY = headY + heading.length * Math.round(frame.title * 1.15) + 16
  const footY = frame.h - 36
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.w} ${frame.h}" role="img" aria-label="${label}">
  <rect width="${frame.w}" height="${frame.h}" fill="#f7f1e8"/>
  <rect x="${frame.pad}" y="${frame.pad}" width="${frame.w - frame.pad * 2}" height="${frame.h - frame.pad * 2}" rx="28" fill="${wash}"/>
  <rect x="${frame.pad}" y="${frame.pad}" width="18" height="${frame.h - frame.pad * 2}" fill="${ink}"/>
  <circle cx="${frame.w - 120}" cy="${shape === 'landscape' ? 78 : 128}" r="${shape === 'portrait' ? 36 : 48}" fill="${ink}" opacity="0.9"/>
  <text x="${x}" y="${headY}" fill="${ink}" font-family="Georgia, serif" font-size="${frame.title}">${head}</text>
  <text x="${x}" y="${bodyY}" fill="#1c1915" font-family="Outfit, Segoe UI, sans-serif" font-size="${frame.body}">${body}</text>
  <text x="${x}" y="${footY}" fill="#5e584e" font-family="Outfit, Segoe UI, sans-serif" font-size="14" letter-spacing="2">${escapeXml(clip(brand, 22).toUpperCase())} · FOR REVIEW</text>
</svg>`
}