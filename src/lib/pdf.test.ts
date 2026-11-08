import { describe, expect, it } from 'vitest'
import { documentPdf, minutesPdf, pdfDataUrl } from './pdf'

describe('pdf helpers', () => {
  it('builds a multi-page branded document that starts with a PDF header', () => {
    const lines = Array.from({ length: 80 }, (_, index) => `Line ${index + 1} of the content calendar.`)
    const bytes = documentPdf({ title: 'Northline content calendar', brand: 'Northline Supply Co.', lines })
    const text = new TextDecoder().decode(bytes.slice(0, 8))
    expect(text.startsWith('%PDF')).toBe(true)
    expect(pdfDataUrl(bytes).startsWith('data:application/pdf;base64,')).toBe(true)
    expect(minutesPdf('Minutes', 'Hello').byteLength).toBeGreaterThan(100)
  })
})
