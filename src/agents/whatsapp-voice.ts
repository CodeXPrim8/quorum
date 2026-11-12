import { askModel, readModelLink } from './model'

/** Rewrite a WhatsApp reply in a natural voice. Amounts in the draft are kept. */
export async function polishWhatsApp(company: string, staffName: string, draft: string): Promise<string> {
  const link = readModelLink()
  const text = draft.trim()
  if (!link || !text) return text
  try {
    const raw = await askModel(link, [
      {
        role: 'system',
        content: [
          `You are ${staffName} at ${company}, writing one WhatsApp reply to a customer.`,
          'Sound like a person in a sales chat. Two to four short sentences.',
          'Keep every amount and invoice number exactly as written.',
          'Do not add a price, a discount, or a number that is not already in the message.',
          'Do not mention that you are an AI.',
        ].join('\n'),
      },
      { role: 'user', content: text },
    ])
    const next = raw.replace(/\s+/g, ' ').trim().slice(0, 700)
    return sameAmounts(text, next) ? next : text
  } catch {
    return text
  }
}

function sameAmounts(original: string, next: string): boolean {
  const before = amounts(original)
  const after = amounts(next)
  return before.every((value) => after.includes(value)) && after.every((value) => before.includes(value))
}

function amounts(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*/g)].map((match) => match[0].replace(/,/g, ''))
}
