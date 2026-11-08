/** Small PDF helpers. No library — files stay in this browser. */

export function escapePdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function wrap(line: string, width: number): string[] {
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const rows: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= width) {
      current = next
      continue
    }
    if (current) rows.push(current)
    current = word
  }
  if (current) rows.push(current)
  return rows
}

export function latin(value: string): string {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/·/g, '-')
    .replace(/×/g, 'x')
    .replace(/£/g, 'GBP ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '')
}

function pageStream(lines: string[], title: string, brand: string, page: number, pages: number): string {
  const content: string[] = [
    '0.09 0.14 0.13 rg',
    '40 742 70 36 re f',
    'BT',
    '/F2 14 Tf',
    '1 1 1 rg',
    `48 754 Td (${escapePdf(brand.slice(0, 4).toUpperCase())}) Tj`,
    'ET',
    'BT',
    '/F2 16 Tf',
    '0.09 0.14 0.13 rg',
    `130 760 Td (${escapePdf(latin(title).slice(0, 56))}) Tj`,
    '/F1 9 Tf',
    '0.35 0.33 0.3 rg',
    `0 -16 Td (${escapePdf(`${brand}  |  Page ${page} of ${pages}  |  Quorum`)} ) Tj`,
    '0.78 0.74 0.68 rg',
    '0 -10 Td (________________________________________________________________) Tj',
    '/F1 10 Tf',
    '0.11 0.1 0.08 rg',
    '0 -22 Td',
  ]
  let y = 712
  for (const line of lines) {
    if (y < 56) break
    const indent = /^\s/.test(line)
    content.push(`(${escapePdf(line)}) Tj`, `0 -${indent ? 12 : 14} Td`)
    y -= indent ? 12 : 14
  }
  content.push('ET')
  return content.join('\n')
}

export function assemblePdf(streams: string[]): Uint8Array {
  const kids = streams.map((_, index) => `${3 + index * 2} 0 R`).join(' ')
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${streams.length} >>`,
  ]
  streams.forEach((stream) => {
    const pageIndex = objects.length + 1
    const contentIndex = pageIndex + 1
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentIndex} 0 R /Resources << /Font << /F1 ${3 + streams.length * 2} 0 R /F2 ${4 + streams.length * 2} 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    )
  })
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  )
  let offset = 0
  const chunks: string[] = ['%PDF-1.4\n%\x80\x80\x80\x80\n']
  offset = chunks[0].length
  const xref = [0]
  objects.forEach((object, index) => {
    xref.push(offset)
    const block = `${index + 1} 0 obj\n${object}\nendobj\n`
    chunks.push(block)
    offset += block.length
  })
  const start = offset
  const table = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...xref.slice(1).map((pos) => `${String(pos).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(start),
    '%%EOF',
  ].join('\n')
  chunks.push(table)
  return new TextEncoder().encode(chunks.join(''))
}

export function minutesPdf(title: string, body: string): Uint8Array {
  const lines = latin(body).split('\n').flatMap((line) => wrap(line.replace(/\t/g, ' '), 92))
  return documentPdf({
    title,
    brand: 'Quorum',
    lines,
  })
}

/** Multi-page text PDF with a simple brand mark (initials badge) in the header. */
export function documentPdf(input: { title: string; brand: string; lines: string[] }): Uint8Array {
  const brand = latin(input.brand || 'Quorum').slice(0, 28)
  const title = latin(input.title).slice(0, 80)
  const prepared = input.lines.flatMap((line) => {
    const clean = latin(line.replace(/\t/g, ' '))
    if (!clean) return ['']
    const width = /^\s/.test(clean) ? 86 : 88
    return wrap(clean, width).map((row, index) => (index === 0 ? row : `  ${row}`))
  })
  const perPage = 46
  const pages: string[][] = []
  for (let i = 0; i < prepared.length; i += perPage) pages.push(prepared.slice(i, i + perPage))
  if (pages.length === 0) pages.push([''])
  const streams = pages.map((pageLines, index) => pageStream(pageLines, title, brand, index + 1, pages.length))
  return assemblePdf(streams)
}

export function pdfDataUrl(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  const encoded = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
  return `data:application/pdf;base64,${encoded}`
}
