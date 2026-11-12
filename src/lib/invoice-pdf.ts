import { assemblePdf, escapePdf, latin } from './pdf'
import type { InvoiceProfile } from '../types'

export type InvoicePdfInput = {
  brand: string
  number: string
  date: string
  customerName: string
  phone: string
  email?: string
  address?: string
  item: string
  detail?: string
  amount: string
  profile?: InvoiceProfile
}

/** One-page invoice. Account lines come only from the company profile. */
export function invoicePdf(input: InvoicePdfInput): Uint8Array {
  const brand = latin(input.brand).slice(0, 42) || 'Company'
  const profile = input.profile
  const pay = profile?.accountNumber
    ? [`Pay to ${latin(profile.accountName)}`, `${latin(profile.bankName)}  ${latin(profile.accountNumber)}`]
    : ['Account details are added when the company saves them.']
  const lines = [
    latin(input.customerName),
    input.email ? latin(input.email) : '',
    input.address ? latin(input.address) : '',
    latin(input.phone),
    '',
    latin(input.item),
    input.detail ? latin(input.detail) : '',
    latin(input.amount),
    '',
    ...pay,
    profile?.extra ? latin(profile.extra) : '',
  ].filter((line) => line !== undefined)
  const body = lines
    .map((line) => `(${escapePdf(line)}) Tj`)
    .join(' T*\n')
  const classic = profile?.template !== 'plain'
  const stream = [
    classic ? '0.12 0.22 0.28 rg' : '0.15 0.15 0.16 rg',
    '0 760 612 82 re f',
    'BT',
    '/F2 18 Tf',
    '1 1 1 rg',
    '48 792 Td',
    `(${escapePdf(brand)}) Tj`,
    '/F1 11 Tf',
    '0 -22 Td',
    `(INVOICE ${escapePdf(latin(input.number))}) Tj`,
    '0 -16 Td',
    `(${escapePdf(latin(input.date))}) Tj`,
    '0.1 0.1 0.12 rg',
    '/F1 12 Tf',
    '1 0 0 1 48 700 Tm',
    '14 TL',
    body,
    'ET',
  ].join('\n')
  return assemblePdf([stream])
}
