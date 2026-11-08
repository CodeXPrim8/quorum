import type { AppState, Design, Staff } from '../types'
import { askModel, readModelLink } from './model'

export type GraphicVerdict = {
  decision: 'approved' | 'changes' | 'declined'
  note: string
}

/** What the marketing manager decides from the brief, the product fact, and the platform. */
export function judgeGraphic(state: AppState, design: Design): GraphicVerdict {
  if (design.audience === 'internal') {
    return { decision: 'approved', note: '' }
  }
  const post = state.calendar.find((item) => item.id === design.calendarId || item.designId === design.id)
  const product = state.products.find((item) => item.id === post?.productId)
  const brief = design.brief.replace(/\s+/g, ' ').trim()
  if (!brief || /\b(hack|exploit|post it live|publish now)\b/i.test(brief)) {
    return { decision: 'declined', note: 'This is not an approved product claim, so I am declining it.' }
  }
  if (product && !brief.toLowerCase().includes(product.name.toLowerCase()) && !brief.includes(product.fact)) {
    return { decision: 'changes', note: `Keep the claim to this fact: ${product.fact}` }
  }
  if (!design.platform) {
    return { decision: 'changes', note: 'Name the platform: Instagram, TikTok, or YouTube.' }
  }
  return { decision: 'approved', note: '' }
}

export async function reviewGraphic(state: AppState, person: Staff, design: Design): Promise<GraphicVerdict> {
  const local = judgeGraphic(state, design)
  const link = readModelLink()
  if (!link) return local
  const product = state.products.find((item) => state.calendar.some((post) => post.designId === design.id && post.productId === item.id))
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${person.name}, ${person.title}. You review graphics before the owner sees the final version.`,
          'Reply with exactly one line: APPROVE, or DECLINE: short reason, or CORRECT: what to change.',
          'Approve when the graphic matches the product fact and the named platform.',
          'Ask for a correction when the claim drifts from the fact or the platform is missing.',
          'Decline when it is not about the product or it asks to publish.',
          'Nothing is posted. No social account is connected.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Title: ${design.title}\nPlatform: ${design.platform ?? 'none'}\nFormat: ${design.format ?? 'graphic'}\nProduct: ${product?.name ?? 'unknown'} (${product?.kind ?? ''})\nFact: ${product?.fact ?? 'none'}\nBrief: ${design.brief}`,
      },
    ])
    return parseVerdict(raw) ?? local
  } catch {
    return local
  }
}

function parseVerdict(raw: string): GraphicVerdict | null {
  const line = raw.replace(/\s+/g, ' ').trim()
  const decline = line.match(/^DECLINE:\s*(.+)$/i)
  if (decline) return { decision: 'declined', note: decline[1].slice(0, 180) }
  const correct = line.match(/^CORRECT:\s*(.+)$/i)
  if (correct) return { decision: 'changes', note: correct[1].slice(0, 180) }
  if (/^APPROVE\b/i.test(line)) return { decision: 'approved', note: '' }
  return null
}
