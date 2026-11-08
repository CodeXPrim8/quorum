import type { QuorumScreen } from '../types'

const learned = new Map<string, string>()
const previews = new Map<string, QuorumScreen>()

const SITE_ASK =
  /\b(website|web ?site|homepage|home ?page|web ?page|browse|gone through|go through|look(?:ed)? through|our site|the site|company site)\b/i

const LINK =
  /\bhttps?:\/\/[^\s<>"')]+|\b(?:www\.)?(?:[a-z0-9-]+\.)+(?:com|ng|io|co|org|net|ai|uk|app|dev)(?:\/[^\s<>"')]+)?/gi

/** Public pages the Managing Director should open for this message. */
export function readingRequest(
  website: string | undefined,
  prompt: string,
): { urls: string[]; missing: boolean } {
  const named = [...prompt.matchAll(LINK)].map((match) => match[0].replace(/[.,;:!?)]+$/, ''))
  const asked = SITE_ASK.test(prompt) || named.length > 0
  if (!asked) return { urls: [], missing: false }
  const urls: string[] = []
  const seen = new Set<string>()
  for (const url of [...(website && SITE_ASK.test(prompt) ? [website] : []), ...named]) {
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    urls.push(url)
    if (urls.length === 2) break
  }
  return { urls, missing: urls.length === 0 }
}

/** Read a short public description of the company site. Empty when there is no site or it cannot be read. */
export async function learnCompany(url: string | undefined): Promise<string> {
  const site = url?.trim()
  if (!site) return ''
  const cached = learned.get(site)
  if (cached !== undefined) return cached
  try {
    const response = await fetch('/api/company-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: site }),
    })
    if (!response.ok) return ''
    const body = (await response.json()) as { summary?: string; url?: string; title?: string; image?: string }
    const summary = (body.summary ?? '').trim().slice(0, 1800)
    if (summary) learned.set(site, summary)
    if (body.url || body.image) {
      previews.set(site, {
        kind: 'page',
        url: body.url || site,
        title: body.title,
        image: body.image,
        summary,
      })
    }
    return summary
  } catch {
    return ''
  }
}

/** What the Managing Director can say after opening a public page. Failures stay uncached. */
export async function readPublicPage(url: string): Promise<string> {
  const site = url.trim()
  if (!site) return ''
  const cached = learned.get(site)
  if (cached) return `Read ${site}:\n${cached}`
  try {
    const response = await fetch('/api/company-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: site }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      summary?: string
      error?: string
      url?: string
      title?: string
      image?: string
    }
    if (!response.ok) return `Could not read ${site}. ${body.error ?? 'The page did not come back.'}`
    const summary = (body.summary ?? '').trim().slice(0, 1800)
    if (!summary) return `Could not read ${site}. The page had no readable text.`
    learned.set(site, summary)
    previews.set(site, {
      kind: 'page',
      url: body.url || site,
      title: body.title,
      image: body.image,
      summary,
    })
    return `Read ${site}:\n${summary}`
  } catch {
    return `Could not read ${site}.`
  }
}

export function previewFor(url: string | undefined): QuorumScreen | undefined {
  const site = url?.trim()
  if (!site) return undefined
  return previews.get(site) ?? (learned.has(site) ? { kind: 'page', url: site } : undefined)
}
