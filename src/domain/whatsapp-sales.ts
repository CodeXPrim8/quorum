import type { PriceEntry, Product, WaMessage, WaSale, WaSaleStage } from '../types'

/** A confirmed price may be sent for two days. After that, staff ask the owner again. */
export const PRICE_FRESH_MS = 2 * 24 * 60 * 60 * 1000

export type SaleStaff = { id: string; name: string; title: string }

export type SaleNote = { staffId: string; staffName: string; text: string }

export type PlannedCustomer = {
  name: string
  email?: string
  address?: string
  company?: string
  item?: string
}

export type PlannedInvoice = {
  number: string
  item: string
  detail?: string
  amount: string
  customerName: string
  email?: string
  address?: string
  company?: string
}

export type PlannedTurn = {
  reply: string
  sale: WaSale
  notes: SaleNote[]
  customer?: PlannedCustomer
  invoice?: PlannedInvoice
}

type TurnInput = {
  company: string
  handler: SaleStaff | null
  sales: SaleStaff | null
  text: string
  profileName: string
  phone: string
  sale?: WaSale
  history: WaMessage[]
  prices: PriceEntry[]
  products: Product[]
  now: number
}

const ITEM_WORD =
  /\b(laptops?|phones?|computers?|desktops?|monitors?|printers?|tvs?|televisions?|generators?|inverters?|solar(?:\s+panels?)?|tablets?|macbooks?|chargers?|websites?|logos?|posters?|flyers?|repairs?|installations?|software|apps?|designs?)\b/i

const SERVICE = /\b(website|logo|poster|flyer|repair|installation|design|service|app|software)\b/i

export function priceIsFresh(confirmedAt: string, now: number): boolean {
  const at = Date.parse(confirmedAt)
  return Number.isFinite(at) && now - at < PRICE_FRESH_MS
}

export function latestPrice(prices: PriceEntry[], item: string): PriceEntry | undefined {
  return [...prices].reverse().find((entry) => sameItem(entry.item, item))
}

export function sameItem(left: string, right: string): boolean {
  const a = normItem(left)
  const b = normItem(right)
  if (!a || !b) return false
  return a === b
}

/** Pull a price out of something the owner typed. A bare meeting time is not a price. */
export function readOwnerPrice(text: string, items: string[]): { item?: string; amount: string } | null {
  const body = text.trim()
  if (!body || body.length > 180) return null
  const amount = moneyFrom(body)
  if (!amount) return null
  const named = items.find((item) => item && new RegExp(`\\b${escapeReg(normItem(item).split(' ')[0] ?? item)}`, 'i').test(body))
  const leftover = body
    .replace(/(?:₦|NGN|naira|\$|USD|£|GBP|€|EUR)\s?[\d,]+(?:\.\d{1,2})?/gi, ' ')
    .replace(/\b(?:per|a|an|the|unit|units|each|for|is|it'?s|price|current)\b/gi, ' ')
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\b\d{4,9}(?:\.\d{1,2})?\b/g, ' ')
    .replace(/[^a-z]+/gi, ' ')
    .trim()
  if (!named && leftover.length > 8) return null
  return { item: named, amount }
}

export function planClientTurn(input: TurnInput): PlannedTurn {
  const sale: WaSale = { stage: 'open', ...input.sale }
  const text = input.text.trim()
  const handler = input.handler
  const sales = input.sales ?? handler
  if (/\b(hack|exploit|malware|phish|ransomware)\b/i.test(text)) {
    return {
      reply: `${input.company} only handles requests for this company. I can’t help with breaking into anything.`,
      sale,
      notes: [],
    }
  }
  if (!handler) {
    return {
      reply: `Hello, this is ${input.company}. Thank you for writing. I have kept your message for the owner, and someone will reply in this chat.`,
      sale,
      notes: [],
    }
  }

  if (sale.stage === 'invoiced' && sale.invoiceNumber) {
    return {
      reply: introduce(handler, input.company, input.history, `You are welcome. Invoice ${sale.invoiceNumber} is already on file for ${sale.item ?? 'this order'}. Tell me if any detail should change.`),
      sale,
      notes: [],
    }
  }

  if (sale.stage === 'details') {
    return finishDetails(input, sale, handler, text)
  }

  if (sale.stage === 'quoted' && agrees(text) && !differentItem(text, sale.item)) {
    return acceptQuote(input, sale, handler, text)
  }

  if (sale.stage === 'quoted' && sale.item && sale.priceAmount && !differentItem(text, sale.item)) {
    const priced = latestPrice(input.prices, sale.item)
    if (priced && priceIsFresh(priced.confirmedAt, input.now)) {
      return {
        reply: introduce(
          handler,
          input.company,
          input.history,
          `The price for the ${sale.item} is still ${priced.amount}. Tell me if you want to go ahead, and I will prepare the invoice.`,
        ),
        sale: { ...sale, priceAmount: priced.amount },
        notes: [],
      }
    }
  }

  if (sale.stage === 'awaiting_price' && sale.item && !differentItem(text, sale.item)) {
    return {
      reply: introduce(
        handler,
        input.company,
        input.history,
        `Thank you. I am still confirming today's price for the ${sale.item} and I will send it in this chat as soon as it is confirmed.`,
      ),
      sale,
      notes: [],
    }
  }

  const item = itemFrom(text) ?? (sale.item && !isGreeting(text) ? sale.item : rememberedItem(input.history))
  if (!item || isGreeting(text)) {
    return {
      reply: `Hello, this is ${handler.name} from ${input.company}. How can I help you today?`,
      sale: { ...sale, stage: 'open' },
      notes: [],
    }
  }

  const switched = Boolean(sale.item && !sameItem(sale.item, item))
  const nextSale: WaSale = switched ? { stage: 'open', item } : { ...sale, item }
  const enough = hasEnough(text) || (nextSale.stage === 'qualifying' && !isGreeting(text) && text.length > 1)
  const detail = enough ? clip(text) : nextSale.detail
  if (!enough) {
    const fact = productFact(input.products, item)
    const ask = SERVICE.test(item) || SERVICE.test(text)
      ? 'What should it include, and when do you need it?'
      : 'What specification do you want, and how many do you need?'
    const offer = /\b(do you (?:guys )?(?:have|sell|stock)|got any|available)\b/i.test(text)
      ? `Yes, we can help with ${plural(item)}.`
      : `I can help with ${plural(item)}.`
    return {
      reply: introduce(handler, input.company, input.history, `${offer}${fact ? ` ${fact}` : ''} ${ask}`.replace(/\s+/g, ' ').trim()),
      sale: { ...nextSale, stage: 'qualifying', detail: undefined },
      notes: [],
    }
  }

  const priced = latestPrice(input.prices, item)
  const fresh = priced && priceIsFresh(priced.confirmedAt, input.now) ? priced : undefined
  const who = sales ?? handler
  if (!fresh) {
    const last = priced
      ? ` The last confirmed price was ${priced.amount} on ${when(priced.confirmedAt)}, which is older than two days.`
      : ''
    return {
      reply: introduce(
        handler,
        input.company,
        input.history,
        `Thank you. I am confirming today's price for the ${item}${detail ? ` (${short(detail)})` : ''} and I will send it in this chat once it is confirmed.`,
      ),
      sale: { ...nextSale, item, detail, stage: 'awaiting_price' as WaSaleStage, priceAmount: undefined },
      notes: notesForMissingPrice(handler, who, input.profileName, item, detail, last),
    }
  }

  return {
    reply: introduce(handler, input.company, input.history, quoteText(item, detail, fresh.amount)),
    sale: { ...nextSale, item, detail, stage: 'quoted', priceAmount: fresh.amount },
    notes: notesForKnownPrice(handler, who, input.profileName, item, fresh),
  }
}

export function quoteText(item: string, detail: string | undefined, amount: string, correction = false): string {
  const line = `The current price for the ${item}${detail ? ` (${short(detail)})` : ''} is ${amount}.`
  if (correction) return `${line} This replaces the earlier figure. Tell me if you want to go ahead, and I will prepare the invoice.`
  return `${line} Tell me if you want to go ahead, and I will prepare the invoice.`
}

function finishDetails(input: TurnInput, sale: WaSale, handler: SaleStaff, text: string): PlannedTurn {
  const contact = readContact(text, input.profileName)
  const amount = sale.priceAmount
  const item = sale.item ?? 'the order'
  if (!amount || (!contact.email && !contact.address)) {
    return {
      reply: introduce(handler, input.company, input.history, `To prepare the invoice I still need the name to put on it, and an email or a delivery address. I already have this WhatsApp number.`),
      sale,
      notes: [],
    }
  }
  const number = invoiceNumber(input.now, input.phone)
  const customerName = contact.name
  return {
    reply: introduce(handler, input.company, input.history, `Thank you, ${customerName}. Invoice ${number} is for the ${item}${sale.detail ? ` (${short(sale.detail)})` : ''} at ${amount}. I have saved your details on our customer list. Tell me if any line should change.`),
    sale: { ...sale, stage: 'invoiced', invoiceNumber: number },
    notes: [
      {
        staffId: handler.id,
        staffName: handler.name,
        text: `I issued invoice ${number} to ${customerName} on WhatsApp for ${item} at ${amount}, and saved the customer on the company list.`,
      },
    ],
    customer: {
      name: customerName,
      email: contact.email,
      address: contact.address,
      company: contact.company,
      item,
    },
    invoice: {
      number,
      item,
      detail: sale.detail,
      amount,
      customerName,
      email: contact.email,
      address: contact.address,
      company: contact.company,
    },
  }
}

function acceptQuote(input: TurnInput, sale: WaSale, handler: SaleStaff, text: string): PlannedTurn {
  const contact = readContact(text, input.profileName)
  const ready = Boolean(contact.email || contact.address)
  if (!ready) {
    return {
      reply: introduce(handler, input.company, input.history, `Good. I will prepare the invoice at ${sale.priceAmount}. Please send the name to put on it, and an email or a delivery address. I already have this WhatsApp number.`),
      sale: { ...sale, stage: 'details' },
      notes: [],
    }
  }
  return finishDetails(input, { ...sale, stage: 'details' }, handler, text)
}

function notesForMissingPrice(
  handler: SaleStaff,
  sales: SaleStaff,
  customer: string,
  item: string,
  detail: string | undefined,
  last: string,
): SaleNote[] {
  const ask = `${customer} on WhatsApp wants a current price for ${item}${detail ? ` (${short(detail)})` : ''}.${last} Reply with the price, for example 450000, or confirm it on the WhatsApp chat. I will not send a figure until you confirm it.`
  if (handler.id === sales.id) {
    return [{ staffId: sales.id, staffName: sales.name, text: ask }]
  }
  return [
    {
      staffId: handler.id,
      staffName: handler.name,
      text: `${sales.name}, ${customer} on WhatsApp wants ${item}${detail ? ` (${short(detail)})` : ''}. Do we have a current price?`,
    },
    {
      staffId: sales.id,
      staffName: sales.name,
      text: `I do not have a price from the last two days.${last} ${ask}`,
    },
  ]
}

function notesForKnownPrice(handler: SaleStaff, sales: SaleStaff, customer: string, item: string, price: PriceEntry): SaleNote[] {
  const told = `The confirmed price for ${item} is ${price.amount}, set on ${when(price.confirmedAt)}. I am sending that to ${customer} on WhatsApp.`
  if (handler.id === sales.id) {
    return [{ staffId: sales.id, staffName: sales.name, text: told }]
  }
  return [
    {
      staffId: handler.id,
      staffName: handler.name,
      text: `${sales.name}, ${customer} on WhatsApp wants ${item}. Do we have a current price?`,
    },
    { staffId: sales.id, staffName: sales.name, text: told },
  ]
}

function readContact(text: string, profileName: string): { name: string; email?: string; address?: string; company?: string; named: boolean } {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  const named = text.match(/\b(?:my name is|name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,40})/i)?.[1]?.trim()
  const address = text.match(
    /\b([A-Za-z0-9][A-Za-z0-9 .'-]{2,70}\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|close|crescent|lane|drive|lagos|abuja|port harcourt|ibadan|enugu|kano))\b/i,
  )?.[0]
  let name = named
  if (!name && email) {
    const before = text.slice(0, text.toLowerCase().indexOf(email.toLowerCase())).replace(/[,|]/g, ' ').trim()
    if (/^[A-Za-z][A-Za-z .'-]{1,40}$/.test(before)) name = before
  }
  const company = looksLikeCompany(profileName) ? profileName : undefined
  return { name: tidyName(name || company || profileName), email, address, company, named: Boolean(name) }
}

function itemFrom(text: string): string | undefined {
  const word = text.match(ITEM_WORD)?.[1]
  if (word) return normLabel(word)
  const asked = text.match(
    /\b(?:need|want|looking for|price of|cost of|how much (?:is|for|are)|quote for|buy)\s+(?:a |an |some |the )?([a-z][a-z0-9 &/-]{2,32})/i,
  )
  if (!asked) return undefined
  return normLabel(asked[1].replace(/\b(please|today|now)\b/gi, '').trim())
}

function rememberedItem(history: WaMessage[]): string | undefined {
  for (const message of [...history].reverse()) {
    if (message.author !== 'client') continue
    const item = itemFrom(message.text)
    if (item) return item
  }
  return undefined
}

function differentItem(text: string, item: string | undefined): boolean {
  const next = itemFrom(text)
  return Boolean(next && item && !sameItem(next, item))
}

function hasEnough(text: string): boolean {
  const qty = /\b\d+\b/.test(text)
  const spec =
    /\b(gb|tb|ram|ssd|hdd|inch|core|hp|dell|lenovo|apple|asus|acer|brand|model|classroom|office|gaming|student|school|page|pages|logo|banner|unit|units|piece|pieces|pack)\b/i.test(
      text,
    )
  return (qty && spec) || (spec && text.trim().length > 18) || (qty && text.trim().length > 28)
}

function agrees(text: string): boolean {
  return /^(yes|yeah|yep|ok|okay|alright|deal|proceed|go ahead)\b|\bi('ll| will) take\b|\bsend (me )?the invoice\b|\bthat works\b|\blet'?s (do|go)\b|\bi agree\b|\bi want it\b|\bi'll buy\b|\bgo ahead\b/i.test(
    text.trim(),
  )
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|how far)\b[.!?\s]*$/i.test(text.trim())
}

function productFact(products: Product[], item: string): string {
  const hit = products.find((product) => sameItem(product.name, item))
  const fact = hit?.fact?.trim()
  if (!fact || fact.length > 140) return ''
  return fact.endsWith('.') ? fact : `${fact}.`
}

function moneyFrom(text: string): string | null {
  const tagged = text.match(/(?:₦|NGN|naira|\$|USD|£|GBP|€|EUR)\s?[\d,]+(?:\.\d{1,2})?/i)
  if (tagged) return formatTagged(tagged[0])
  const bare = text.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,9})(?:\.\d{1,2})?\b/)
  if (!bare) return null
  const value = Number(bare[1].replace(/,/g, ''))
  if (!Number.isFinite(value) || value <= 0) return null
  return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value)}`
}

function formatTagged(raw: string): string {
  const upper = raw.toUpperCase()
  if (upper.includes('₦') || upper.includes('NGN') || upper.includes('NAIRA')) {
    const value = Number(raw.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(value)) return raw.trim()
    return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value)}`
  }
  return raw.replace(/\s+/g, ' ').trim()
}

function invoiceNumber(now: number, phone: string): string {
  const day = new Date(now).toISOString().slice(0, 10).replace(/-/g, '')
  const tail = phone.replace(/\D/g, '').slice(-4) || '0000'
  return `QSI-${day}-${tail}`
}

function looksLikeCompany(name: string): boolean {
  return /\b(ltd|limited|inc|plc|llc|company|enterprises|ventures|group)\b/i.test(name)
}

function tidyName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 80)
}

function normLabel(word: string): string {
  const lower = word.toLowerCase().replace(/\s+/g, ' ').trim()
  if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1)
  return lower
}

function normItem(value: string): string {
  return normLabel(value).replace(/[^a-z0-9]+/g, ' ').trim()
}

function plural(item: string): string {
  if (item === 'software' || item.endsWith('s')) return item
  return `${item}s`
}

function introduce(handler: SaleStaff, company: string, history: WaMessage[], body: string): string {
  const known = history.some((message) => message.author === 'quorum' && message.text.includes(handler.name))
  if (known) return body
  return `Hello, this is ${handler.name} from ${company}. ${body}`
}

function short(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean
}

function clip(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

function when(iso: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return 'an earlier day'
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
