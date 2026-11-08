import { assemblePdf, escapePdf, latin, wrap } from './pdf'

export type ProposalPdfInput = {
  title: string
  kind: string
  body: string
  brand: string
  writerName: string
  writerTitle: string
  website?: string
  preparedFor?: string
  date: string
}

export type PdfLine = { text: string; head: boolean }

export type ProposalCover = {
  mark: string
  brand: string
  title: string
  kind: string
  forLine: string
  byLine: string
  web: string
  date: string
}

export type ProposalLayout = {
  cover: ProposalCover
  pages: PdfLine[][]
}

function heading(line: string): boolean {
  const text = line.trim()
  if (!text || text.length > 70) return false
  if (/^\d+(\.\d+)*[.)]?\s+\S/.test(text)) return true
  if (/^[A-Z][A-Z0-9 /&-]{3,}$/.test(text)) return true
  if (!/[.?!]$/.test(text) && text.length < 48 && /[A-Za-z]/.test(text)) return true
  return false
}

export function proposalLayout(input: ProposalPdfInput): ProposalLayout {
  const brand = latin(input.brand).slice(0, 42)
  const cover: ProposalCover = {
    mark: brand.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'Q',
    brand,
    title: latin(input.title).slice(0, 72),
    kind: latin(input.kind || 'proposal').toUpperCase().slice(0, 24),
    forLine: latin(input.preparedFor || 'To be confirmed').slice(0, 64),
    byLine: latin(`${input.writerName}, ${input.writerTitle}`).slice(0, 64),
    web: latin(input.website || '').replace(/^https?:\/\//, '').slice(0, 48),
    date: latin(input.date),
  }
  const rows = latin(input.body)
    .split('\n')
    .flatMap((line) => {
      const clean = line.replace(/\t/g, ' ')
      if (!clean.trim()) return [{ text: '', head: false }]
      const head = heading(clean)
      const width = head ? 78 : 86
      return wrap(clean.trim(), width).map((text, index) => ({ text, head: head && index === 0 }))
    })
  const perPage = 42
  const pages: PdfLine[][] = []
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage))
  if (pages.length === 0) pages.push([{ text: '', head: false }])
  return { cover, pages }
}

function coverStream(cover: ProposalCover): string {
  return [
    '0.23 0.36 0.88 rg',
    '0 618 612 174 re f',
    '0.49 0.42 0.94 rg',
    '0 610 612 8 re f',
    '1 1 1 rg',
    '48 742 54 36 re f',
    'BT',
    '/F2 14 Tf',
    '0.23 0.36 0.88 rg',
    `58 754 Td (${escapePdf(cover.mark)}) Tj`,
    'ET',
    'BT',
    '1 1 1 rg',
    '/F1 10 Tf',
    `48 700 Td (${escapePdf(cover.kind)}) Tj`,
    '/F2 22 Tf',
    `0 -28 Td (${escapePdf(cover.title)}) Tj`,
    '/F1 11 Tf',
    `0 -20 Td (${escapePdf(cover.brand)}) Tj`,
    'ET',
    '0.95 0.96 0.99 rg',
    '48 430 248 120 re f',
    '0.93 0.94 0.98 rg',
    '316 430 248 120 re f',
    '0.23 0.36 0.88 rg',
    '48 546 40 4 re f',
    '316 546 40 4 re f',
    'BT',
    '/F1 9 Tf',
    '0.43 0.45 0.55 rg',
    `60 532 Td (PREPARED FOR) Tj`,
    '/F2 12 Tf',
    '0.09 0.1 0.16 rg',
    `0 -22 Td (${escapePdf(cover.forLine)}) Tj`,
    'ET',
    'BT',
    '/F1 9 Tf',
    '0.43 0.45 0.55 rg',
    `328 532 Td (PREPARED BY) Tj`,
    '/F2 12 Tf',
    '0.09 0.1 0.16 rg',
    `0 -22 Td (${escapePdf(cover.byLine)}) Tj`,
    '/F1 10 Tf',
    `0 -20 Td (${escapePdf(cover.brand)}) Tj`,
    'ET',
    'BT',
    '/F1 10 Tf',
    '0.43 0.45 0.55 rg',
    `48 80 Td (${escapePdf([cover.date, cover.web].filter(Boolean).join('   |   '))}) Tj`,
    'ET',
  ].join('\n')
}

function bodyStream(lines: PdfLine[], brand: string, page: number, pages: number): string {
  const content: string[] = [
    '0.23 0.36 0.88 rg',
    '0 0 10 792 re f',
    '0.95 0.96 0.99 rg',
    '0 752 612 40 re f',
    'BT',
    '/F1 9 Tf',
    '0.23 0.36 0.88 rg',
    `28 768 Td (${escapePdf(latin(brand).slice(0, 40))}) Tj`,
    '0.43 0.45 0.55 rg',
    `480 768 Td (${escapePdf(`Page ${page} of ${pages}`)}) Tj`,
    'ET',
    'BT',
    '0.11 0.1 0.14 rg',
    '28 720 Td',
  ]
  let y = 720
  for (const line of lines) {
    if (y < 56) break
    if (line.head) {
      content.push('/F2 12 Tf', '0.23 0.36 0.88 rg', `(${escapePdf(line.text)}) Tj`, '0 -18 Td')
      y -= 18
    } else {
      content.push('/F1 10 Tf', '0.11 0.1 0.14 rg', `(${escapePdf(line.text)}) Tj`, '0 -14 Td')
      y -= 14
    }
  }
  content.push('ET')
  return content.join('\n')
}

export function proposalPdf(input: ProposalPdfInput): Uint8Array {
  const layout = proposalLayout(input)
  const streams = [
    coverStream(layout.cover),
    ...layout.pages.map((pageLines, index) => bodyStream(pageLines, layout.cover.brand, index + 1, layout.pages.length)),
  ]
  return assemblePdf(streams)
}
