import type { PostFormat, SocialPlatform } from '../types'

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

function hash(value: string): number {
  let n = 0
  for (let i = 0; i < value.length; i += 1) n = (n * 31 + value.charCodeAt(i)) >>> 0
  return n
}

export type PosterShape = 'square' | 'portrait' | 'landscape'

export type PosterSpec = {
  title: string
  kicker: string
  brand: string
  product?: string
  fact?: string
  shape: PosterShape
  revision: number
  art?: string
  note?: string
}

type Palette = {
  ink: string
  paper: string
  accent: string
  wash: string
  type: string
  gold: string
}

const PALETTES: Palette[] = [
  { ink: '#102826', paper: '#f4efe6', accent: '#1f6f6a', wash: '#d5ebe7', type: '#f7f1e8', gold: '#d4b46a' },
  { ink: '#1c140e', paper: '#f7efe4', accent: '#c2512a', wash: '#f3ddd2', type: '#fff6ee', gold: '#e0b56a' },
  { ink: '#121a2a', paper: '#eef1f6', accent: '#2a628a', wash: '#d4e2ee', type: '#f4f7fb', gold: '#c9a15b' },
  { ink: '#162018', paper: '#f3efe4', accent: '#3d6b4f', wash: '#dce8dc', type: '#f6f3ea', gold: '#c4a35a' },
  { ink: '#24141c', paper: '#f6eef1', accent: '#8a4b78', wash: '#ead7e4', type: '#fdf6fa', gold: '#d4b46a' },
  { ink: '#161412', paper: '#f3eee6', accent: '#8a6232', wash: '#efe3c4', type: '#fff8ea', gold: '#e0c07a' },
]

export function posterShape(format: PostFormat | undefined): PosterShape {
  if (format === 'cover') return 'portrait'
  if (format === 'thumbnail') return 'landscape'
  return 'square'
}

export function posterKicker(platform?: SocialPlatform, format?: PostFormat): string {
  const channel = platform === 'tiktok' ? 'TikTok' : platform === 'youtube' ? 'YouTube' : platform === 'instagram' ? 'Instagram' : ''
  const kind = format === 'cover' ? 'Cover' : format === 'thumbnail' ? 'Thumbnail' : format === 'carousel' ? 'Carousel' : format === 'flyer' ? 'Flyer' : ''
  if (channel && kind) return `${channel} · ${kind}`
  return kind || channel || 'Campaign'
}

function paletteFor(spec: PosterSpec): Palette {
  return PALETTES[(hash(spec.brand) + spec.revision) % PALETTES.length]
}

function frameOf(shape: PosterShape): { w: number; h: number } {
  if (shape === 'portrait') return { w: 1080, h: 1920 }
  if (shape === 'landscape') return { w: 1280, h: 720 }
  return { w: 1080, h: 1080 }
}

function tspans(rows: string[], x: number, size: number, leading = 1.12): string {
  return rows
    .map((row, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : Math.round(size * leading)}">${escapeXml(row)}</tspan>`)
    .join('')
}

function artHref(art: string): string {
  return art.replace(/"/g, '').replace(/</g, '').replace(/>/g, '')
}

function photo(id: string, art: string, x: number, y: number, w: number, h: number, rx = 0): string {
  const href = artHref(art)
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath></defs>
  <image href="${href}" xlink:href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
}

function marks(w: number, h: number, ink: string, accent: string, seed: number): string {
  const a = 80 + (seed % 40)
  const b = 40 + ((seed >> 3) % 30)
  return `
  <circle cx="${w - a}" cy="${b + 40}" r="${70 + (seed % 50)}" fill="${accent}" opacity="0.22"/>
  <circle cx="${w - a + 36}" cy="${b + 86}" r="${28 + (seed % 18)}" fill="${ink}" opacity="0.18"/>
  <rect x="${Math.round(w * 0.62)}" y="${h - 160}" width="${Math.round(w * 0.28)}" height="8" rx="4" fill="${accent}" opacity="0.7"/>`
}

/** Campaign graphic drawn in Quorum’s studio. Optional photograph is a background only; type stays in this file. */
export function campaignPoster(spec: PosterSpec): string {
  const frame = frameOf(spec.shape)
  const palette = paletteFor(spec)
  const title = wrap(spec.title || spec.product || 'Campaign', spec.shape === 'landscape' ? 16 : 13, spec.shape === 'portrait' ? 5 : 3)
  const fact = wrap(spec.fact || spec.kicker || 'Draft for review', spec.shape === 'portrait' ? 22 : spec.shape === 'landscape' ? 28 : 24, 3)
  const product = clip(spec.product || spec.brand, 28)
  const kicker = clip(spec.kicker, 32).toUpperCase()
  const brand = clip(spec.brand, 22).toUpperCase()
  const layout = spec.revision % 3
  const artId = `art${spec.revision}${spec.shape[0]}${hash(spec.title) % 9999}`
  const body =
    spec.shape === 'portrait'
      ? portraitPoster(spec, frame, palette, title, fact, product, kicker, brand, layout, artId)
      : spec.shape === 'landscape'
        ? landscapePoster(spec, frame, palette, title, fact, product, kicker, brand, layout, artId)
        : squarePoster(spec, frame, palette, title, fact, product, kicker, brand, layout, artId)
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${frame.w} ${frame.h}" role="img" aria-label="${escapeXml(title.join(' '))}">
${body}
</svg>`
}

export function composePoster(input: {
  title: string
  brief: string
  brand: string
  productName?: string
  fact?: string
  platform?: SocialPlatform
  format?: PostFormat
  revision: number
  art?: string
  note?: string
  kicker?: string
}): string {
  return campaignPoster({
    title: input.title,
    kicker: input.kicker || posterKicker(input.platform, input.format),
    brand: input.brand,
    product: input.productName,
    fact: input.fact || input.brief,
    shape: posterShape(input.format),
    revision: input.revision,
    art: input.art,
    note: input.note,
  })
}

function squarePoster(
  spec: PosterSpec,
  frame: { w: number; h: number },
  pal: Palette,
  title: string[],
  fact: string[],
  product: string,
  kicker: string,
  brand: string,
  layout: number,
  artId: string,
): string {
  const { w, h } = frame
  const titleSize = title.some((row) => row.length > 10) ? 72 : 92
  if (spec.art && layout !== 1) {
    return `
  ${photo(artId, spec.art, 0, 0, w, h)}
  <rect width="${w}" height="${h}" fill="${pal.ink}" opacity="0.46"/>
  <rect x="0" y="${h - 430}" width="${w}" height="430" fill="${pal.ink}" opacity="0.72"/>
  <text x="72" y="86" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="22" letter-spacing="6">${escapeXml(kicker)}</text>
  <text x="72" y="620" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="${titleSize}" font-weight="650">${tspans(title, 72, titleSize)}</text>
  <text x="72" y="880" fill="${pal.wash}" font-family="Outfit, Segoe UI, sans-serif" font-size="28">${tspans(fact, 72, 28, 1.35)}</text>
  <text x="72" y="1024" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="22" letter-spacing="4">${escapeXml(brand)}</text>`
  }
  if (spec.art && layout === 1) {
    return `
  <rect width="${w}" height="${h}" fill="${pal.ink}"/>
  ${photo(artId, spec.art, 470, 0, 610, h)}
  <rect x="430" y="0" width="80" height="${h}" fill="${pal.ink}"/>
  <text x="56" y="90" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="20" letter-spacing="5">${escapeXml(kicker)}</text>
  <text x="56" y="280" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="64" font-weight="650">${tspans(title, 56, 64)}</text>
  <rect x="56" y="620" width="48" height="8" fill="${pal.accent}"/>
  <text x="56" y="680" fill="${pal.wash}" font-family="Outfit, Segoe UI, sans-serif" font-size="24">${tspans(fact, 56, 24, 1.35)}</text>
  <text x="56" y="1008" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="20" letter-spacing="4">${escapeXml(brand)}</text>`
  }
  if (layout === 1) {
    return `
  <rect width="${w}" height="${h}" fill="${pal.ink}"/>
  <rect x="520" y="0" width="560" height="${h}" fill="${pal.accent}"/>
  ${marks(w, h, pal.paper, pal.gold, spec.revision)}
  <text x="56" y="96" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="20" letter-spacing="5">${escapeXml(kicker)}</text>
  <text x="56" y="280" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="68" font-weight="650">${tspans(title, 56, 68)}</text>
  <text x="56" y="720" fill="${pal.wash}" font-family="Outfit, Segoe UI, sans-serif" font-size="26">${tspans(fact, 56, 26, 1.35)}</text>
  <text x="56" y="1008" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="20" letter-spacing="4">${escapeXml(brand)}</text>
  <text x="560" y="980" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="36">${escapeXml(product)}</text>`
  }
  if (layout === 2) {
    return `
  <rect width="${w}" height="${h}" fill="${pal.paper}"/>
  <rect x="48" y="48" width="${w - 96}" height="${h - 96}" rx="36" fill="${pal.wash}"/>
  <rect x="48" y="48" width="28" height="${h - 96}" fill="${pal.accent}"/>
  ${marks(w, h, pal.ink, pal.accent, spec.revision + 4)}
  <text x="120" y="160" fill="${pal.accent}" font-family="Outfit, Segoe UI, sans-serif" font-size="22" letter-spacing="6">${escapeXml(kicker)}</text>
  <text x="120" y="360" fill="${pal.ink}" font-family="Fraunces, Georgia, serif" font-size="${titleSize}" font-weight="650">${tspans(title, 120, titleSize)}</text>
  <text x="120" y="760" fill="${pal.ink}" font-family="Outfit, Segoe UI, sans-serif" font-size="28">${tspans(fact, 120, 28, 1.35)}</text>
  <text x="120" y="980" fill="${pal.accent}" font-family="Outfit, Segoe UI, sans-serif" font-size="22" letter-spacing="4">${escapeXml(brand)} · ${escapeXml(product)}</text>`
  }
  return `
  <rect width="${w}" height="${h}" fill="${pal.accent}"/>
  <rect x="40" y="40" width="${w - 80}" height="${h - 80}" rx="28" fill="${pal.paper}"/>
  ${marks(w, h, pal.ink, pal.accent, spec.revision)}
  <text x="96" y="140" fill="${pal.accent}" font-family="Outfit, Segoe UI, sans-serif" font-size="22" letter-spacing="6">${escapeXml(kicker)}</text>
  <text x="96" y="340" fill="${pal.ink}" font-family="Fraunces, Georgia, serif" font-size="${titleSize}" font-weight="650">${tspans(title, 96, titleSize)}</text>
  <rect x="96" y="700" width="72" height="10" rx="5" fill="${pal.accent}"/>
  <text x="96" y="760" fill="${pal.ink}" font-family="Outfit, Segoe UI, sans-serif" font-size="28">${tspans(fact, 96, 28, 1.35)}</text>
  <text x="96" y="990" fill="${pal.accent}" font-family="Outfit, Segoe UI, sans-serif" font-size="22" letter-spacing="4">${escapeXml(brand)}</text>`
}

function portraitPoster(
  spec: PosterSpec,
  frame: { w: number; h: number },
  pal: Palette,
  title: string[],
  fact: string[],
  product: string,
  kicker: string,
  brand: string,
  layout: number,
  artId: string,
): string {
  const { w, h } = frame
  const titleSize = 86
  if (spec.art) {
    return `
  ${photo(artId, spec.art, 0, 0, w, 1180)}
  <rect y="980" width="${w}" height="940" fill="${pal.ink}"/>
  <text x="72" y="1120" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="24" letter-spacing="6">${escapeXml(kicker)}</text>
  <text x="72" y="1260" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="${titleSize}" font-weight="650">${tspans(title, 72, titleSize, 1.1)}</text>
  <text x="72" y="1720" fill="${pal.wash}" font-family="Outfit, Segoe UI, sans-serif" font-size="30">${tspans(fact, 72, 30, 1.3)}</text>
  <text x="72" y="1860" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="22" letter-spacing="4">${escapeXml(brand)}</text>`
  }
  if (layout === 1) {
    return `
  <rect width="${w}" height="${h}" fill="${pal.ink}"/>
  <rect x="0" y="0" width="${w}" height="420" fill="${pal.accent}"/>
  ${marks(w, h, pal.type, pal.gold, spec.revision)}
  <text x="72" y="160" fill="${pal.type}" font-family="Outfit, Segoe UI, sans-serif" font-size="24" letter-spacing="6">${escapeXml(kicker)}</text>
  <text x="72" y="620" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="${titleSize}" font-weight="650">${tspans(title, 72, titleSize, 1.1)}</text>
  <text x="72" y="1280" fill="${pal.wash}" font-family="Outfit, Segoe UI, sans-serif" font-size="32">${tspans(fact, 72, 32, 1.3)}</text>
  <text x="72" y="1840" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="24" letter-spacing="4">${escapeXml(brand)} · ${escapeXml(product)}</text>`
  }
  return `
  <rect width="${w}" height="${h}" fill="${pal.paper}"/>
  <rect x="0" y="0" width="${w}" height="1100" fill="${pal.accent}"/>
  ${marks(w, 1100, pal.ink, pal.gold, spec.revision + 2)}
  <text x="72" y="140" fill="${pal.type}" font-family="Outfit, Segoe UI, sans-serif" font-size="24" letter-spacing="6">${escapeXml(kicker)}</text>
  <text x="72" y="420" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="${titleSize}" font-weight="650">${tspans(title, 72, titleSize, 1.1)}</text>
  <text x="72" y="1280" fill="${pal.ink}" font-family="Outfit, Segoe UI, sans-serif" font-size="32">${tspans(fact, 72, 32, 1.3)}</text>
  <text x="72" y="1840" fill="${pal.accent}" font-family="Outfit, Segoe UI, sans-serif" font-size="24" letter-spacing="4">${escapeXml(brand)}</text>`
}

function landscapePoster(
  spec: PosterSpec,
  frame: { w: number; h: number },
  pal: Palette,
  title: string[],
  fact: string[],
  product: string,
  kicker: string,
  brand: string,
  layout: number,
  artId: string,
): string {
  const { w, h } = frame
  if (spec.art) {
    return `
  ${photo(artId, spec.art, 0, 0, w, h)}
  <rect width="620" height="${h}" fill="${pal.ink}" opacity="0.82"/>
  <text x="48" y="70" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="18" letter-spacing="5">${escapeXml(kicker)}</text>
  <text x="48" y="220" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="58" font-weight="650">${tspans(title, 48, 58)}</text>
  <text x="48" y="500" fill="${pal.wash}" font-family="Outfit, Segoe UI, sans-serif" font-size="22">${tspans(fact, 48, 22, 1.3)}</text>
  <text x="48" y="680" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="18" letter-spacing="4">${escapeXml(brand)}</text>`
  }
  if (layout === 1) {
    return `
  <rect width="${w}" height="${h}" fill="${pal.ink}"/>
  <rect x="${w - 420}" y="0" width="420" height="${h}" fill="${pal.accent}"/>
  ${marks(w, h, pal.type, pal.gold, spec.revision)}
  <text x="48" y="80" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="18" letter-spacing="5">${escapeXml(kicker)}</text>
  <text x="48" y="240" fill="${pal.type}" font-family="Fraunces, Georgia, serif" font-size="56" font-weight="650">${tspans(title, 48, 56)}</text>
  <text x="48" y="520" fill="${pal.wash}" font-family="Outfit, Segoe UI, sans-serif" font-size="22">${tspans(fact, 48, 22, 1.3)}</text>
  <text x="48" y="670" fill="${pal.gold}" font-family="Outfit, Segoe UI, sans-serif" font-size="18" letter-spacing="4">${escapeXml(brand)} · ${escapeXml(product)}</text>`
  }
  return `
  <rect width="${w}" height="${h}" fill="${pal.paper}"/>
  <rect x="0" y="0" width="18" height="${h}" fill="${pal.accent}"/>
  ${marks(w, h, pal.ink, pal.accent, spec.revision)}
  <text x="56" y="80" fill="${pal.accent}" font-family="Outfit, Segoe UI, sans-serif" font-size="18" letter-spacing="5">${escapeXml(kicker)}</text>
  <text x="56" y="240" fill="${pal.ink}" font-family="Fraunces, Georgia, serif" font-size="58" font-weight="650">${tspans(title, 56, 58)}</text>
  <text x="56" y="500" fill="${pal.ink}" font-family="Outfit, Segoe UI, sans-serif" font-size="22">${tspans(fact, 56, 22, 1.3)}</text>
  <text x="56" y="670" fill="${pal.accent}" font-family="Outfit, Segoe UI, sans-serif" font-size="18" letter-spacing="4">${escapeXml(brand)}</text>`
}
