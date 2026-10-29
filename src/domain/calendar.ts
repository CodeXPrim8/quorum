import type { CalendarPost, PostFormat, Product, ProductKind, SocialPlatform } from '../types'

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

type Slot = { offset: number; platform: SocialPlatform; format: PostFormat; title: (name: string) => string; angle: string }

const SLOTS: Record<ProductKind, Slot[]> = {
  hardware: [
    { offset: 0, platform: 'instagram', format: 'flyer', title: (name) => name, angle: 'One still frame of the product on a desk.' },
    { offset: 1, platform: 'tiktok', format: 'cover', title: (name) => `Set up ${name}`, angle: 'A short vertical demo, one idea only.' },
    { offset: 2, platform: 'youtube', format: 'thumbnail', title: (name) => `${name}, step by step`, angle: 'A longer setup lesson.' },
  ],
  software: [
    { offset: 0, platform: 'youtube', format: 'thumbnail', title: (name) => `How ${name} works`, angle: 'A walkthrough thumbnail.' },
    { offset: 1, platform: 'instagram', format: 'carousel', title: (name) => name, angle: 'One feature on a card.' },
    { offset: 2, platform: 'tiktok', format: 'cover', title: (name) => `${name} in one moment`, angle: 'One short moment, vertical.' },
  ],
  service: [
    { offset: 0, platform: 'instagram', format: 'flyer', title: (name) => name, angle: 'The offer on a single flyer.' },
    { offset: 1, platform: 'youtube', format: 'thumbnail', title: (name) => `Inside ${name}`, angle: 'An explainer thumbnail.' },
    { offset: 2, platform: 'tiktok', format: 'cover', title: (name) => `${name} at work`, angle: 'A person showing the work, vertical.' },
  ],
}

export function platformLabel(platform: SocialPlatform): string {
  if (platform === 'instagram') return 'Instagram'
  if (platform === 'tiktok') return 'TikTok'
  return 'YouTube'
}

export function formatLabel(format: PostFormat): string {
  if (format === 'flyer') return 'flyer'
  if (format === 'carousel') return 'carousel'
  if (format === 'cover') return 'cover'
  return 'thumbnail'
}

/** Three posts for one product: the right shape for Instagram, TikTok, and YouTube. */
export function planProduct(product: Product, startDay: number): Omit<CalendarPost, 'id' | 'status' | 'designId'>[] {
  return SLOTS[product.kind].map((slot) => ({
    productId: product.id,
    day: startDay + slot.offset,
    title: clip(slot.title(product.name), 42),
    brief: `${slot.angle} ${product.fact}`,
    platform: slot.platform,
    format: slot.format,
  }))
}

export function planMissing(products: Product[], calendar: CalendarPost[], startDay: number): Omit<CalendarPost, 'id' | 'status' | 'designId'>[] {
  return products
    .filter((product) => !calendar.some((post) => post.productId === product.id))
    .flatMap((product) => planProduct(product, startDay))
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function calendarSummary(products: Product[], posts: CalendarPost[], startDay: number): string {
  const blocks = products
    .filter((product) => posts.some((post) => post.productId === product.id))
    .map((product) => {
      const lines = posts
        .filter((post) => post.productId === product.id)
        .map((post) => {
          const when = post.day === startDay ? 'today' : post.day === startDay + 1 ? 'tomorrow' : 'the day after'
          return `${platformLabel(post.platform)} ${when} (${formatLabel(post.format)}): ${post.title}`
        })
      return `${product.name} (${product.kind}). ${product.fact}\n${lines.join('\n')}`
    })
  return `Content calendar, one for each product. The graphic designer takes whatever is scheduled for today. Nothing is posted.\n\n${blocks.join('\n\n')}`
}
