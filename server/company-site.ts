const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|\[?::1\]?)$/i

/** Accept only a public http(s) page. Blank and private hosts are refused. */
export function publicWebsite(raw: string): URL | null {
  const value = raw.trim()
  if (!value) return null
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (PRIVATE_HOST.test(url.hostname)) return null
  if (!url.hostname.includes('.')) return null
  url.hash = ''
  return url
}

function metaContent(html: string, key: string): string {
  const property = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const named = new RegExp(`<meta[^>]+(?:name|property)=["']${property}["'][^>]+content=["']([^"']{1,500})["']`, 'i')
  const reversed = new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:name|property)=["']${property}["']`, 'i')
  return decode(html.match(named)?.[1] ?? html.match(reversed)?.[1] ?? '')
}

export function pagePreview(
  html: string,
  pageUrl: string,
): { title: string; image?: string; summary: string } {
  const title = decode(html.match(/<title[^>]*>([^<]{1,180})/i)?.[1] ?? '') || metaContent(html, 'og:title')
  const description =
    metaContent(html, 'description') || metaContent(html, 'og:description')
  const imageRaw = metaContent(html, 'og:image') || metaContent(html, 'twitter:image')
  let image: string | undefined
  if (imageRaw) {
    try {
      const absolute = publicWebsite(new URL(imageRaw, pageUrl).toString())
      if (absolute) image = absolute.toString()
    } catch {
      image = undefined
    }
  }
  const text = decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)
  const summary = [title && `Title: ${title}`, description && `Description: ${description}`, text && `Page: ${text}`]
    .filter(Boolean)
    .join('\n')
  return { title, image, summary }
}

export function pageSummary(html: string): string {
  return pagePreview(html, 'https://example.com/').summary
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function publicLocation(base: URL, location: string | null): URL | null {
  if (!location) return null
  try {
    return publicWebsite(new URL(location, base).toString())
  } catch {
    return null
  }
}

/** Read a short public description of a page. One redirect is followed when it stays on a public host. */
export async function summarizeWebsite(raw: string): Promise<{ url: string; summary: string }> {
  let url = publicWebsite(raw)
  if (!url) throw new Error('That website address is not a public link.')
  let response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'text/html,text/plain;q=0.9', 'User-Agent': 'QuorumCompanyReader/1.0' },
  })
  if (response.status >= 300 && response.status < 400) {
    const next = publicLocation(url, response.headers.get('location'))
    if (!next) throw new Error('The website redirected off a public page, so it was not read.')
    url = next
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'text/html,text/plain;q=0.9', 'User-Agent': 'QuorumCompanyReader/1.0' },
    })
    if (response.status >= 300 && response.status < 400) {
      throw new Error('The website redirected more than once, so it was not read.')
    }
  }
  if (!response.ok) throw new Error('The website could not be read.')
  const type = response.headers.get('content-type') ?? ''
  if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) {
    throw new Error('The website did not return a page of text.')
  }
  const html = (await response.text()).slice(0, 150_000)
  const preview = pagePreview(html, url.toString())
  const summary = preview.summary.slice(0, 1800)
  if (!summary) throw new Error('The website had no readable text.')
  return { url: url.toString(), summary, title: preview.title || undefined, image: preview.image }
}
