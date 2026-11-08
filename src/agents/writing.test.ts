import { describe, expect, it } from 'vitest'
import { createSampleState } from '../engine/fixture'
import { isDraftAsk, knownWriter, parseDocument, turnOf, withWriter } from './writing'

const now = 1_700_000_000_000

describe('document drafting', () => {
  it('spots a proposal request', () => {
    expect(isDraftAsk('draft a proposal for a vehicle vendor company')).toBe(true)
    expect(isDraftAsk('hello')).toBe(false)
  })

  it('already knows the writer and the company', () => {
    const card = knownWriter(createSampleState(now))
    expect(card).toMatch(/Riley Chen/)
    expect(card).toMatch(/Chairman/)
    expect(card).toMatch(/Northline/)
    expect(card).toMatch(/Do not ask/)
  })

  it('lifts a finished document out of the reply', () => {
    const parsed = parseDocument(
      [
        'Here is the proposal.',
        'DOCUMENT: proposal | Fleet supply',
        'Prepared for: Ada Okonkwo, Motor House Ltd',
        '---',
        'Prepared by Riley Chen, Chairman',
        'Northline Systems',
        '---',
      ].join('\n'),
    )
    expect(parsed.text).toBe('Here is the proposal.')
    expect(parsed.document).toMatchObject({
      kind: 'proposal',
      title: 'Fleet supply',
      preparedFor: 'Ada Okonkwo, Motor House Ltd',
    })
    expect(parsed.document?.body).toMatch(/Riley Chen/)
  })

  it('fills the writer name and title from the company', () => {
    const company = createSampleState(now).company!
    expect(withWriter('[Name]\n[Title]\nNorthline Supply Co.', company)).toMatch(/Riley Chen/)
    expect(withWriter('[Name]\n[Title]\nNorthline Supply Co.', company)).toMatch(/Chairman/)
    expect(withWriter('[Name]\n[Title]\nNorthline Supply Co.', company)).not.toMatch(/\[Name\]/)
  })

  it('keeps the client title and still signs the writer', () => {
    const company = createSampleState(now).company!
    const text = withWriter(
      [
        'PROPOSAL',
        'Yard radios',
        'Prepared by: Northline Supply Co.',
        'Prepared for: [Client Name], [Title]',
        '',
        'Please contact [Name] on [Phone].',
        '',
        '[Name]',
        '[Title]',
      ].join('\n'),
      company,
    )
    expect(text).toMatch(/Prepared by: Riley Chen, Chairman/)
    expect(text).toMatch(/Prepared for: \[Client Name\], \[Title\]/)
    expect(text).toMatch(/contact Riley Chen/)
    expect(text).toMatch(/Riley Chen\nChairman/)
    expect(text).not.toMatch(/\[Name\]/)
    expect(text.split('\n').slice(1).join('\n')).toMatch(/Yard radios/)
  })

  it('keeps an ordinary numbered reply as chat', () => {
    const parsed = parseDocument(
      [
        "Hello again! I'm here.",
        '1. The vehicle vendor proposal — I drafted it as a Clemx proposal.',
        '2. Zoho — say the word and I’ll open it in the browser.',
        'What would you like to do?',
      ].join('\n'),
    )
    expect(parsed.document).toBeUndefined()
    expect(parsed.text).toMatch(/Hello again/)
    const body = parsed.text
    const recovered = turnOf({
      text: 'Here is the proposal.',
      document: { kind: 'proposal', title: "Hello again! I'm here.", body },
    })
    expect(recovered.document).toBeUndefined()
    expect(recovered.note).toMatch(/Hello again/)
  })

  it('lifts a fenced draft that has no DOCUMENT wrapper', () => {
    const parsed = parseDocument(
      [
        "Here's a draft proposal for the fleet.",
        '---',
        'PROPOSAL',
        'Fleet Technology and Security Solutions',
        'Prepared by: Northline Supply Co.',
        '1. Introduction',
        'Northline can supply the yard with tracking and power.',
        '[Name]',
        '[Title]',
        '---',
        'Fill in the bracketed placeholders if anything is still open.',
      ].join('\n'),
    )
    expect(parsed.text).toMatch(/Here's a draft/)
    expect(parsed.text).toMatch(/Fill in the bracketed/)
    expect(parsed.document?.kind).toBe('proposal')
    expect(parsed.document?.title).toBe('Fleet Technology and Security Solutions')
    expect(parsed.document?.body).toMatch(/1\. Introduction/)
    expect(parsed.document?.body).not.toMatch(/Here's a draft/)
  })
})
