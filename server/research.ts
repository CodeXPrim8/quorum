import { publicWebsite, summarizeWebsite } from './company-site'

type DdgTopic = { Text?: string; FirstURL?: string }

type DdgBody = {
  AbstractText?: string
  AbstractURL?: string
  Heading?: string
  RelatedTopics?: Array<DdgTopic | { Topics?: DdgTopic[] }>
}

function topicLines(items: DdgBody['RelatedTopics'] | undefined, limit: number): string[] {
  const lines: string[] = []
  for (const item of items ?? []) {
    if (!item) continue
    if ('Text' in item && item.Text) {
      lines.push(item.Text.slice(0, 280))
    } else if ('Topics' in item) {
      for (const nested of item.Topics ?? []) {
        if (nested.Text) lines.push(nested.Text.slice(0, 280))
        if (lines.length >= limit) return lines
      }
    }
    if (lines.length >= limit) return lines
  }
  return lines
}

/** Public lookup via DuckDuckGo. Private hosts are never fetched. */
export async function researchQuery(
  raw: string,
): Promise<{ query: string; brief: string; url?: string; title?: string; image?: string }> {
  const query = raw.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (query.length < 2) throw new Error('Ask something to look up.')
  const asPage = publicWebsite(query)
  if (asPage) {
    const page = await summarizeWebsite(asPage.toString())
    return { query, brief: `Read ${page.url}:\n${page.summary}`, url: page.url, title: page.title, image: page.image }
  }
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json', 'User-Agent': 'QuorumResearch/1.0' },
  })
  if (!response.ok) throw new Error('The lookup did not come back.')
  const body = (await response.json()) as DdgBody
  const related = topicLines(body.RelatedTopics, 6)
  const parts = [
    body.Heading && `Topic: ${body.Heading}`,
    body.AbstractText && body.AbstractText.slice(0, 900),
    body.AbstractURL && publicWebsite(body.AbstractURL) ? `Source: ${body.AbstractURL}` : '',
    related.length ? `Notes:\n${related.map((line) => `• ${line}`).join('\n')}` : '',
  ].filter(Boolean)
  if (parts.length === 0) {
    return { query, brief: `No public summary came back for “${query}”. Answer from what you know, and say when you are unsure.` }
  }
  const source = body.AbstractURL && publicWebsite(body.AbstractURL) ? publicWebsite(body.AbstractURL)!.toString() : undefined
  return { query, brief: parts.join('\n'), url: source, title: body.Heading || undefined }
}
