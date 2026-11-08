import type {
  CalendarDraft,
  CalendarPost,
  CreativeSize,
  PostFormat,
  Product,
  ProductKind,
  SocialPlatform,
} from '../types'

export function northlineProducts(): Product[] {
  return [
    {
      id: 'prod_dock',
      name: 'Dock Pro',
      kind: 'hardware',
      fact: 'A desk dock sold with the Classroom laptop bundle.',
    },
    {
      id: 'prod_laptops',
      name: 'Classroom laptop bundle',
      kind: 'hardware',
      fact: 'Laptops for schools, quoted with docks from the same offer.',
    },
    {
      id: 'prod_os',
      name: 'Classroom OS',
      kind: 'software',
      fact: 'Classroom OS 2.1 adds offline quiz sync for the education bundle.',
    },
  ]
}

const POLICY = /approve|publish nothing|nothing externally|until you approve/i

/** A product for each owner goal that names real work. Approval rules are not products. */
export function offeringsFromGoals(
  company: { businessType: string; goals: { id: string; text: string }[] },
): Product[] {
  return company.goals.flatMap((goal) => {
    const fact = goal.text.replace(/\s+/g, ' ').trim()
    if (!fact || POLICY.test(fact)) return []
    const name = productName(fact)
    if (!name) return []
    return [{ id: `prod_${goal.id}`, name, kind: kindFor(company.businessType, fact), fact }]
  })
}

function productName(fact: string): string {
  const stripped = fact
    .replace(/^(launch|keep|prepare|build|sell|offer|deliver)\s+(the\s+)?/i, '')
    .replace(/\s+this quarter\.?$/i, '')
    .replace(/\.$/, '')
  const name = stripped.length > 48 ? `${stripped.slice(0, 47)}…` : stripped
  return name.trim()
}

function kindFor(businessType: string, fact: string): ProductKind {
  if (/\b(software|os|app|platform)\b/i.test(fact) && !/\b(hardware|laptop|device|dock)\b/i.test(fact)) return 'software'
  if (/\b(service|consulting|retainer)\b/i.test(fact) || (/\bservice/i.test(businessType) && !/\bhardware\b/i.test(fact))) return 'service'
  if (/\b(hardware|laptop|device|dock)\b/i.test(fact) || /\bhardware\b/i.test(businessType)) return 'hardware'
  if (/\bsoftware\b/i.test(businessType)) return 'software'
  return 'service'
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Office day 1 is Monday of office month 1. */
export function weekdayName(day: number): string {
  return WEEKDAYS[((Math.max(1, day) - 1) % 7 + 7) % 7]
}

export function monthNameForDay(day: number): string {
  return MONTHS[Math.floor((Math.max(1, day) - 1) / 28) % 12]
}

export function dayOfMonth(day: number): number {
  return ((Math.max(1, day) - 1) % 28) + 1
}

export function weekOfMonth(day: number): number {
  return Math.floor((dayOfMonth(day) - 1) / 7) + 1
}

export function dateLabelFor(day: number): string {
  return `Week ${weekOfMonth(day)} · ${weekdayName(day)} ${dayOfMonth(day)}`
}

export function sizeLabel(size: CreativeSize, platform: SocialPlatform): string {
  if (size === 'feed_square') return `${platformLabel(platform)} Feed · 1080×1080 (square)`
  if (size === 'reel') return platform === 'youtube' ? 'YouTube Short · 1080×1920 (portrait)' : `${platformLabel(platform)} Reels · 1080×1920 (portrait)`
  if (size === 'story') return `${platformLabel(platform)} Story · 1080×1920 (portrait)`
  if (size === 'carousel') return `${platformLabel(platform)} Carousel · 1080×1080 (square slides)`
  return 'YouTube Thumbnail · 1280×720 (landscape)'
}

export function platformLabel(platform: SocialPlatform): string {
  if (platform === 'instagram') return 'Instagram'
  if (platform === 'tiktok') return 'TikTok'
  return 'YouTube'
}

export function formatLabel(format: PostFormat): string {
  if (format === 'flyer') return 'feed still'
  if (format === 'carousel') return 'carousel'
  if (format === 'cover') return 'reel / cover'
  return 'thumbnail'
}

type Rhythm = {
  weekday: number
  platform: SocialPlatform
  format: PostFormat
  size: CreativeSize
  slides?: number
  title: (name: string, week: number) => string
  angle: (product: Product, week: number) => string
  caption: (product: Product, week: number) => string
  objective: string
}

const RHYTHM: Rhythm[] = [
  {
    weekday: 0,
    platform: 'instagram',
    format: 'flyer',
    size: 'feed_square',
    title: (name) => name,
    angle: (product) => `Feed still of ${product.name} on a clean desk. ${product.fact}`,
    caption: (product) => `${product.name} — ${product.fact}`,
    objective: 'Brand awareness on Instagram Feed',
  },
  {
    weekday: 1,
    platform: 'instagram',
    format: 'carousel',
    size: 'carousel',
    slides: 4,
    title: (name) => `${name} in 4 frames`,
    angle: (product) => `Four-slide carousel: problem, product, how it fits, proof. Stay on this fact: ${product.fact}`,
    caption: (product) => `Swipe through how ${product.name} works. ${product.fact}`,
    objective: 'Explain the offer in a carousel',
  },
  {
    weekday: 2,
    platform: 'instagram',
    format: 'cover',
    size: 'reel',
    title: (name) => `${name} in 15 seconds`,
    angle: (product) => `Portrait Reels cover and hook for a short clip of ${product.name}. ${product.fact}`,
    caption: (product) => `Watch ${product.name} in under 15 seconds. ${product.fact}`,
    objective: 'Reach on Instagram Reels',
  },
  {
    weekday: 3,
    platform: 'tiktok',
    format: 'cover',
    size: 'reel',
    title: (name, week) => (week % 2 === 0 ? `Set up ${name}` : `${name}, one tip`),
    angle: (product) => `Vertical TikTok cover for one clear tip about ${product.name}. ${product.fact}`,
    caption: (product) => `One tip for ${product.name}. ${product.fact}`,
    objective: 'Short demo on TikTok',
  },
  {
    weekday: 4,
    platform: 'youtube',
    format: 'thumbnail',
    size: 'thumbnail',
    title: (name) => `${name}, step by step`,
    angle: (product) => `Landscape thumbnail for a longer ${product.name} lesson. ${product.fact}`,
    caption: (product) => `Full walkthrough: ${product.name}. ${product.fact}`,
    objective: 'Drive views to a YouTube explainer',
  },
]

function stamp(day: number, product: Product, rhythm: Rhythm, week: number): CalendarDraft {
  const size = rhythm.size
  return {
    productId: product.id,
    day,
    title: clip(rhythm.title(product.name, week), 48),
    brief: clip(rhythm.angle(product, week), 180),
    platform: rhythm.platform,
    format: rhythm.format,
    size,
    sizeLabel: sizeLabel(size, rhythm.platform),
    weekday: weekdayName(day),
    monthName: monthNameForDay(day),
    dateLabel: dateLabelFor(day),
    caption: clip(rhythm.caption(product, week), 160),
    objective: rhythm.objective,
    slides: rhythm.slides,
  }
}

/** One product’s first three posts (compat / smoke). Prefer planProductMonth for the live calendar. */
export function planProduct(product: Product, startDay: number): CalendarDraft[] {
  return RHYTHM.slice(0, 3).map((rhythm, index) => stamp(startDay + index, product, rhythm, 1))
}

/**
 * A full office month (28 days) for one product: Mon–Fri posts each week,
 * with Feed, Carousel, Reels, TikTok, and YouTube sizes spelled out.
 */
export function planProductMonth(product: Product, monthStartDay: number): CalendarDraft[] {
  const start = monthStartDay - ((monthStartDay - 1) % 28)
  const posts: CalendarDraft[] = []
  for (let week = 0; week < 4; week += 1) {
    for (const rhythm of RHYTHM) {
      const day = start + week * 7 + rhythm.weekday
      posts.push(stamp(day, product, rhythm, week + 1))
    }
  }
  return posts
}

export function monthStart(day: number): number {
  return day - ((Math.max(1, day) - 1) % 28)
}

/** Products with no posts yet in the current office month get a full month plan. */
export function planMissing(products: Product[], calendar: CalendarPost[], startDay: number): CalendarDraft[] {
  const start = monthStart(startDay)
  const end = start + 27
  return products
    .filter((product) => !calendar.some((post) => post.productId === product.id && post.day >= start && post.day <= end))
    .flatMap((product) => planProductMonth(product, start))
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function calendarSummary(products: Product[], posts: CalendarPost[], startDay: number): string {
  const month = monthNameForDay(startDay)
  const counts = new Map<string, number>()
  for (const post of posts) counts.set(post.platform, (counts.get(post.platform) ?? 0) + 1)
  const mix = ['instagram', 'tiktok', 'youtube']
    .map((platform) => `${platformLabel(platform as SocialPlatform)} ${counts.get(platform) ?? 0}`)
    .join(' · ')
  const today = posts
    .filter((post) => post.day === startDay)
    .map((post) => {
      const product = products.find((item) => item.id === post.productId)
      return `• ${post.dateLabel ?? weekdayName(post.day)} — ${product?.name ?? 'Product'}: ${post.title} (${post.sizeLabel ?? formatLabel(post.format)})`
    })
  return [
    `Content calendar for ${month} (office month). ${posts.length} posts planned. ${mix}.`,
    'The graphic designer takes whatever is scheduled for today. Nothing is posted until a social account is connected.',
    '',
    today.length > 0 ? `Today:\n${today.join('\n')}` : 'No post is scheduled for today.',
    '',
    'Full month with sizes, weekdays, captions, and objectives is in the PDF attached to this message.',
  ].join('\n')
}

export function calendarDocument(input: {
  company: string
  businessType: string
  planner: string
  month: string
  products: Product[]
  posts: CalendarPost[]
  startDay: number
}): string {
  const header = [
    'CONTENT CALENDAR',
    input.company,
    input.businessType,
    `Month: ${input.month}`,
    `Prepared by: ${input.planner}`,
    `Posts: ${input.posts.length}`,
    'Status: Draft inside Quorum — nothing published',
    '',
  ]
  const legend = [
    'SIZES',
    'Instagram Feed · 1080×1080 square',
    'Instagram / TikTok Reels · 1080×1920 portrait',
    'Instagram Carousel · 1080×1080 square slides',
    'YouTube Thumbnail · 1280×720 landscape',
    '',
  ]
  const byDay = [...input.posts].sort((a, b) => a.day - b.day || a.platform.localeCompare(b.platform))
  const blocks: string[] = []
  let lastKey = ''
  for (const post of byDay) {
    const key = `${post.monthName ?? monthNameForDay(post.day)}|${post.day}|${post.weekday ?? weekdayName(post.day)}`
    if (key !== lastKey) {
      if (blocks.length) blocks.push('')
      blocks.push(`${post.weekday ?? weekdayName(post.day)} ${dayOfMonth(post.day)} · ${post.monthName ?? monthNameForDay(post.day)} · Week ${weekOfMonth(post.day)}`)
      lastKey = key
    }
    const product = input.products.find((item) => item.id === post.productId)
    blocks.push(
      [
        `  ${platformLabel(post.platform)} · ${formatLabel(post.format)}${post.slides ? ` (${post.slides} slides)` : ''}`,
        `  Size: ${post.sizeLabel ?? sizeLabel(post.size ?? 'feed_square', post.platform)}`,
        `  Product: ${product?.name ?? 'Product'} (${product?.kind ?? 'offer'})`,
        `  Title: ${post.title}`,
        `  Objective: ${post.objective ?? 'Support the product fact'}`,
        `  Creative brief: ${post.brief}`,
        `  Caption draft: ${post.caption ?? post.brief}`,
        `  Fact lock: ${product?.fact ?? 'Use only approved claims'}`,
      ].join('\n'),
    )
  }
  return [
    ...header,
    ...legend,
    'SCHEDULE',
    '',
    ...blocks,
    '',
    'Notes',
    'Maya designs the creative for today’s posts.',
    'Promotional pieces go to marketing / owner review before social.',
    'In-house meeting flyers never go on this calendar.',
    'No Instagram, TikTok, or YouTube account is connected in this build.',
  ].join('\n')
}
