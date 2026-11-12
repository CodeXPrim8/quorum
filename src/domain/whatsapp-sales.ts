import type { PriceEntry, Product, WaMessage, WaSale, WaSaleStage } from '../types'
import { quoteLines, requestLines } from './price-lines'

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
  /** The customer refused the lowest price. The owner must approve a call. */
  call?: boolean
  /** Send the invoice PDF again with this reply. */
  resendInvoice?: boolean
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
  account?: { bankName: string; accountName: string; accountNumber: string }
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
    return invoicedReply(input, sale, handler, text)
  }

  if (sale.stage === 'calling') {
    return {
      reply: introduce(handler, input.company, input.history, 'I have passed this to my boss. I will message you here once we have spoken.'),
      sale,
      notes: [],
    }
  }

  if (sale.stage === 'details') {
    return finishDetails(input, sale, handler, text)
  }

  const lines = requestLines([...input.history, { author: 'client', text }])
  if (lines.length > 1 && !(sale.stage === 'quoted' && agrees(text))) {
    const priced = lines.map((item) => ({ item, price: latestPrice(input.prices, item) })).filter((line) => line.price && priceIsFresh(line.price.confirmedAt, input.now))
    const detail = lines.join('; ').slice(0, 240)
    if (priced.length === lines.length) {
      return {
        reply: introduce(handler, input.company, input.history, quoteLines(priced.map((line) => ({ item: line.item, amount: line.price?.amount ?? '' })))),
        sale: { ...sale, item: lines[0], detail, stage: 'quoted', priceAmount: priced[0]?.price?.amount },
        notes: [],
      }
    }
    const who = sales ?? handler
    return {
      reply: introduce(
        handler,
        input.company,
        input.history,
        `Please hold on while I confirm the price. I have ${lines.join(', ')}. I will send each figure in this chat as soon as it is confirmed.`,
      ),
      sale: { ...sale, item: lines[0], detail, stage: 'awaiting_price', priceAmount: undefined },
      notes: sale.stage === 'awaiting_price' ? [] : notesForMissingPrice(handler, who, input.profileName, lines[0], detail, ''),
    }
  }

  if (sale.stage === 'quoted' && agrees(text) && !differentItem(text, sale.item)) {
    return acceptQuote(input, sale, handler, text)
  }

  if ((isCheckIn(text) || (isGreeting(text) && sale.stage !== 'open')) && sale.item && sale.stage !== 'open') {
    const offer = sale.priceAmount ? ` The price for the ${sale.item} is still ${sale.priceAmount}.` : ''
    return {
      reply: introduce(handler, input.company, input.history, `Yes, I am here.${offer} Tell me how you want to continue.`),
      sale,
      notes: [],
    }
  }

  if (sale.stage === 'quoted' && sale.item && sale.priceAmount && bargains(text) && !differentItem(text, sale.item)) {
    const priced = latestPrice(input.prices, sale.item)
    const floor = priced?.floor && nairaValue(priced.floor) > 0 && nairaValue(priced.floor) < nairaValue(priced.amount) ? priced.floor : ''
    if (floor && !sale.offeredFloor) {
      return {
        reply: introduce(handler, input.company, input.history, `I can do ${floor} for the ${sale.item}.`),
        sale: { ...sale, priceAmount: floor, offeredFloor: true },
        notes: notesForStepDown(handler, input.sales ?? handler, input.profileName, sale.item, floor),
      }
    }
    if (sale.offeredFloor && refuses(text)) {
      return {
        reply: introduce(handler, input.company, input.history, 'Let me speak with my boss and come back to you on this chat.'),
        sale: { ...sale, stage: 'calling' },
        notes: [
          {
            staffId: handler.id,
            staffName: handler.name,
            text: `${input.profileName} (${input.phone}) would not take ${sale.priceAmount} for the ${sale.item}. Please approve a call.`,
          },
        ],
        call: true,
      }
    }
    return {
      reply: introduce(handler, input.company, input.history, `${sale.priceAmount} is the lowest I can confirm for the ${sale.item}. If you want it, I will prepare the invoice.`),
      sale,
      notes: [],
    }
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
    const who = sales ?? handler
    return {
      reply: introduce(handler, input.company, input.history, `I am confirming today's price for the ${sale.item} again, and I will send the figure in this chat.`),
      sale: { ...sale, stage: 'awaiting_price', priceAmount: undefined },
      notes: notesForMissingPrice(handler, who, input.profileName, sale.item, sale.detail, ''),
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
  if (!item || (isGreeting(text) && (!sale.item || sale.stage === 'open'))) {
    return {
      reply: `Hello, this is ${handler.name} from ${input.company}. How can I help you today?`,
      sale: { ...sale, stage: 'open' },
      notes: [],
    }
  }

  const switched = Boolean(sale.item && !sameItem(sale.item, item))
  const nextSale: WaSale = switched ? { stage: 'open', item } : { ...sale, item }
  const enough = hasEnough(text)
  const detail = enough || nextSale.askedDetail ? cleanNeed(text, item) : nextSale.detail
  if (!enough && !(nextSale.stage === 'qualifying' && nextSale.askedDetail)) {
    if (nextSale.stage === 'qualifying') {
      return {
        reply: introduce(handler, input.company, input.history, `For the ${item}, which brand do you prefer, and how many do you need?`),
        sale: { ...nextSale, stage: 'qualifying', askedDetail: true, detail: cleanNeed(text, item) },
        notes: [],
      }
    }
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
  const ask = `${customer} on WhatsApp wants a current price for ${item}${detail ? ` (${short(detail)})` : ''}.${last} Set the opening price and the lowest price on the WhatsApp chat, for example open 1000000 and lowest 950000. I will start at the opening price and will not go below the lowest.`
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

function withoutBudget(text: string): string {
  return text
    .replace(/\b(?:my |the )?budget(?:\s+is|\s+of)?\s*(?:₦|ngn|naira)?\s*[\d,.]+\b/gi, ' ')
    .replace(/\bi (?:have|get|can pay|can spend)\s*(?:₦|ngn|naira)?\s*[\d,.]+\b/gi, ' ')
}

function unitQuantity(text: string): boolean {
  return [...withoutBudget(text).matchAll(/\b(\d{1,3})\b/g)].some((match) => {
    const value = Number(match[1])
    return value > 0 && value <= 100
  })
}

function hasEnough(text: string): boolean {
  const qty = unitQuantity(text)
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

function isCheckIn(text: string): boolean {
  return /^(are you there|you there|you dey|are you still there|hello\??|hi\??)\b[.!?\s]*$/i.test(text.trim())
}

function productFact(products: Product[], item: string): string {
  const hit = products.find((product) => sameItem(product.name, item))
  const fact = hit?.fact?.trim()
  if (!fact || fact.length > 140) return ''
  return fact.endsWith('.') ? fact : `${fact}.`
}

function invoicedReply(input: TurnInput, sale: WaSale, handler: SaleStaff, text: string): PlannedTurn {
  const number = sale.invoiceNumber ?? 'the invoice'
  const item = sale.item ?? 'this order'
  if (/\bpdf\b/i.test(text)) {
    return {
      reply: introduce(handler, input.company, input.history, `I am sending invoice ${number} as a PDF.`),
      sale,
      notes: [],
      resendInvoice: true,
    }
  }
  if (/\baccount\b/i.test(text)) {
    const account = input.account
    const line = account?.accountNumber
      ? `You can pay invoice ${number} to ${account.accountName}, ${account.bankName}, account ${account.accountNumber}.`
      : `I am adding the company account number to invoice ${number} and I will send it here.`
    return {
      reply: introduce(handler, input.company, input.history, line),
      sale,
      notes: account?.accountNumber
        ? []
        : [{ staffId: handler.id, staffName: handler.name, text: `${input.profileName} asked for the account number on invoice ${number}. Add it under Company.` }],
    }
  }
  return {
    reply: introduce(handler, input.company, input.history, `Invoice ${number} for the ${item} is with you. Tell me what you want changed, or if you need the PDF again.`),
    sale,
    notes: [],
  }
}

function notesForStepDown(handler: SaleStaff, sales: SaleStaff, customer: string, item: string, floor: string): SaleNote[] {
  return [
    {
      staffId: sales.id,
      staffName: sales.name,
      text: `${handler.name} offered ${floor} for the ${item} to ${customer}. That is the lowest confirmed price.`,
    },
  ]
}

function bargains(text: string): boolean {
  return /\b(too (?:much|expensive|high)|high side|on the high|reduce|discount|last price|your last|final price|best price|lowest|cheapest|lower|come down|can you do|better price|how much (?:can|you) (?:you )?go|gen it go|last offer)\b/i.test(text)
}

function refuses(text: string): boolean {
  return /^(no|nope|can't|cannot)\b|\b(too (?:much|expensive|high)|not interested|i can't pay|leave it|no deal)\b/i.test(text.trim())
}

function cleanNeed(text: string, item: string): string {
  const use = text.match(/\bfor (work|school|the office|office|gaming|business|home|students?)\b/i)
  const brand = text.match(/\b(hp|dell|lenovo|apple|asus|acer|macbook)\b/i)
  const qty = withoutBudget(text).match(/\b(\d{1,3})\b/)
  const parts = [qty ? `${qty[1]}` : '', brand?.[1] ?? '', use ? use[0].toLowerCase() : ''].filter(Boolean)
  if (parts.length > 0) return parts.join(' ').slice(0, 80)
  if (text.trim().length <= 32 && !/\b(anyway|anyways|need|want|have|laptop)\b/i.test(text)) return clip(text)
  return item
}

function nairaValue(amount: string): number {
  const value = Number(amount.replace(/[^\d.]/g, ''))
  return Number.isFinite(value) ? value : 0
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
