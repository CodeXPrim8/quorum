/** A small text PDF. No library, so minutes stay in this browser. */

function escapePdf(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrap(line: string, width: number): string[] {
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

function latin(value: string): string {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/£/g, 'GBP ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '')
}

export function minutesPdf(title: string, body: string): Uint8Array {
  const lines = latin(body).split('\n').flatMap((line) => wrap(line.replace(/\t/g, ' '), 92))
  const leading = 52
  const content: string[] = ['BT', '/F1 16 Tf', '50 780 Td', `(${escapePdf(latin(title).slice(0, 80))}) Tj`, '/F1 10 Tf', '0 -28 Td']
  let y = 752
  for (const line of lines) {
    if (y < 60) {
      content.push('ET')
      break
    }
    content.push(`(${escapePdf(line)}) Tj`, '0 -14 Td')
    y -= 14
  }
  if (!content.includes('ET')) content.push('ET')
  const stream = content.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let offset = 0
  const chunks: string[] = [`%PDF-1.4\n%${leading}\n`]
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

export function pdfDataUrl(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  const encoded = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
  return `data:application/pdf;base64,${encoded}`
}
