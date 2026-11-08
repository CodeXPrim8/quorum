import { describe, expect, it } from 'vitest'
import { proposalLayout, proposalPdf } from './proposal-pdf'

describe('proposal PDF', () => {
  it('builds a branded multi-page file', () => {
    const bytes = proposalPdf({
      title: 'Fleet supply',
      kind: 'proposal',
      body: 'Prepared by Riley Chen, Chairman\n\nScope of work\nWe can wire the yard and train the crew.\n',
      brand: 'Northline Systems',
      writerName: 'Riley Chen',
      writerTitle: 'Chairman',
      website: 'https://northline.example',
      preparedFor: 'Ada Okonkwo, Motor House Ltd',
      date: '2026-11-03',
    })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(400)
    const layout = proposalLayout({
      title: 'Fleet supply',
      kind: 'proposal',
      body: 'Prepared by Riley Chen, Chairman\n\nScope of work\nWe can wire the yard and train the crew.\n',
      brand: 'Northline Systems',
      writerName: 'Riley Chen',
      writerTitle: 'Chairman',
      website: 'https://northline.example',
      preparedFor: 'Ada Okonkwo, Motor House Ltd',
      date: '2026-11-03',
    })
    expect(layout.cover.byLine).toMatch(/Riley Chen/)
    expect(layout.pages.length).toBeGreaterThan(0)
  })
})
