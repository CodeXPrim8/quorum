import { describe, expect, it } from 'vitest'
import { pagePreview, pageSummary, publicWebsite, summarizeWebsite } from './company-site'

describe('company website reader', () => {
  it('accepts a public https address and refuses private hosts', () => {
    expect(publicWebsite('https://example.com/about')?.hostname).toBe('example.com')
    expect(publicWebsite('example.com')?.protocol).toBe('https:')
    expect(publicWebsite('')).toBeNull()
    expect(publicWebsite('http://localhost/tax')).toBeNull()
    expect(publicWebsite('http://127.0.0.1')).toBeNull()
    expect(publicWebsite('http://192.168.1.4')).toBeNull()
    expect(publicWebsite('file:///c/secret')).toBeNull()
  })

  it('keeps the title, description, and visible words', () => {
    const summary = pageSummary(
      '<html><head><title>Clemx</title><meta name="description" content="Builds office software."></head><body><script>secret()</script><p>We sell company tools.</p></body></html>',
    )
    expect(summary).toContain('Title: Clemx')
    expect(summary).toContain('Builds office software.')
    expect(summary).toContain('We sell company tools.')
    expect(summary).not.toContain('secret')
  })

  it('picks the page title and social image', () => {
    const preview = pagePreview(
      '<html><head><title>Clemx</title><meta property="og:image" content="/hero.jpg"></head><body></body></html>',
      'https://clemxtech.com.ng/',
    )
    expect(preview.title).toBe('Clemx')
    expect(preview.image).toBe('https://clemxtech.com.ng/hero.jpg')
  })

  it('follows one redirect onto another public page', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url === 'https://example.com/') {
        return new Response(null, { status: 302, headers: { location: 'https://www.example.com/home' } })
      }
      return new Response('<html><title>Home</title><p>Office tools.</p></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }) as typeof fetch
    try {
      const page = await summarizeWebsite('example.com')
      expect(page.url).toBe('https://www.example.com/home')
      expect(page.summary).toContain('Office tools.')
    } finally {
      globalThis.fetch = original
    }
  })

  it('does not follow a redirect to a private host', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } })) as typeof fetch
    try {
      await expect(summarizeWebsite('https://example.com/start')).rejects.toThrow(/public page/)
    } finally {
      globalThis.fetch = original
    }
  })
})
