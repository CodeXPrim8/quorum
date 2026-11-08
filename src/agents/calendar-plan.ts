import { calendarDocument, monthNameForDay, planMissing } from '../domain/calendar'
import type { AppState, CalendarDraft, Product, Staff } from '../types'
import { askModel, readModelLink } from './model'

export function draftMonth(state: AppState): { products: Product[]; drafts: CalendarDraft[] } {
  const products = state.products.length > 0 ? state.products : []
  const drafts = planMissing(products, state.calendar, state.clock.day)
  return { products, drafts }
}

/** Polish titles and captions with the linked chat model (DeepSeek). Falls back to the local month plan. */
export async function polishCalendar(
  state: AppState,
  planner: Staff,
  drafts: CalendarDraft[],
  products: Product[],
): Promise<CalendarDraft[]> {
  const link = readModelLink()
  if (!link || drafts.length === 0) return drafts
  const sample = drafts.slice(0, 12)
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${planner.name}, ${planner.title} at ${state.company?.name ?? 'the company'}.`,
          'You write a detailed monthly content calendar for products and services.',
          'Reply with one improved line per post, in the same order, exactly like:',
          'N|TITLE|CAPTION',
          'Keep every claim inside the product fact. No hashtag spam. Nothing is published.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: sample
          .map((post, index) => {
            const product = products.find((item) => item.id === post.productId)
            return [
              `#${index + 1}`,
              `Product: ${product?.name ?? 'Product'}`,
              `Fact: ${product?.fact ?? ''}`,
              `Day: ${post.dateLabel}`,
              `Platform: ${post.platform}`,
              `Size: ${post.sizeLabel}`,
              `Title: ${post.title}`,
              `Caption: ${post.caption ?? ''}`,
            ].join('\n')
          })
          .join('\n\n'),
      },
    ])
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return drafts.map((post, index) => {
      if (index >= sample.length) return post
      const match = lines
        .map((line) => line.match(new RegExp(`^${index + 1}\\s*\\|\\s*(.+?)\\s*\\|\\s*(.+)$`)))
        .find(Boolean)
      if (!match) return post
      return {
        ...post,
        title: match[1].trim().slice(0, 48),
        caption: match[2].trim().slice(0, 160),
      }
    })
  } catch {
    return drafts
  }
}

export function calendarPdfPayload(state: AppState, planner: Staff, posts: AppState['calendar'], products: Product[]) {
  const month = monthNameForDay(state.clock.day)
  const body = calendarDocument({
    company: state.company?.name ?? 'Company',
    businessType: state.company?.businessType ?? '',
    planner: planner.name,
    month,
    products,
    posts,
    startDay: state.clock.day,
  })
  return {
    title: `${state.company?.name ?? 'Company'} — ${month} content calendar`,
    brand: state.company?.name ?? 'Quorum',
    body,
    fileName: `${(state.company?.name ?? 'company').replace(/\s+/g, '-').toLowerCase()}-${month.toLowerCase()}-content-calendar.pdf`,
  }
}
