/** A public http(s) address, or nothing when the field is blank or not a link. */
export function normalizeWebsite(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim()
  if (!value) return undefined
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    if (!url.hostname.includes('.')) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

export function websiteLine(website: string | undefined): string {
  return website ? `Company website: ${website}` : ''
}
