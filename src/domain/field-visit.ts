/** A site visit or engineer call hidden in a customer conversation. The customer reply itself is left alone. */
export function visitBrief(messages: { text: string }[]): string | null {
  const recent = messages.slice(-10).map((message) => message.text.trim()).filter(Boolean)
  const blob = recent.join('\n')
  const asked =
    /site visit|come look|engineers?\s+(?:to\s+|can\s+)?come|mounting bracket|site survey/i.test(blob) ||
    (/engineer/i.test(blob) && /tomorrow|today|\bstreet\b|\broad\b/i.test(blob))
  if (!asked) return null
  const when = blob.match(/tomorrow[^.\n]{0,48}|\btoday[^.\n]{0,32}|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)?.[0]?.trim()
  const place = blob.match(/\d+\s+[A-Za-z][A-Za-z'’-]+(?:\s+[A-Za-z][A-Za-z'’-]+){0,5}\s+(?:Street|Road|Close|Avenue|Crescent|Lane)/i)?.[0]
  const phone = blob.match(/\b0\d{9,10}\b/)?.[0]
  const lines = [when, place, phone ? `Call ${phone} when the engineer arrives.` : ''].filter((line): line is string => Boolean(line))
  return (lines.join('. ') || recent.at(-1) || 'A customer asked for someone to come and look.').slice(0, 500)
}
