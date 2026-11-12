/** Same split the desk uses, kept here so the live reply does not import the browser app. */
export function requestLines(messages: { author?: string; text: string }[]): string[] {
  const found: string[] = []
  for (const message of messages) {
    if (message.author && message.author !== 'client') continue
    for (const part of message.text.split(/,|\band\b|\n|(?=\b\d{1,2}\s+(?:smart\s+)?(?:tvs?|lights?|fridge|ac|pcs?|ps5)\b)/i)) {
      const item = part.replace(/\s+/g, ' ').trim().replace(/^on\s+/i, '').replace(/[.]+\s*$/, '').trim()
      if (item.length < 2 || item.length > 80 || !looksLikeItem(item)) continue
      found.push(item)
    }
  }
  const unique: string[] = []
  for (const item of found) {
    if (unique.some((line) => line.toLowerCase() === item.toLowerCase())) continue
    unique.push(item)
  }
  return unique.slice(0, 12)
}

function looksLikeItem(item: string): boolean {
  if (/^(hi|hello|hey|yes|no|ok|okay|24\/7|tomorrow|thanks|thank you)$/i.test(item)) return false
  if (/^\d+\s*(?:units?|pcs?|pieces?|sets?)?$/i.test(item)) return false
  if (/^(?:a|an|one|two|three|four|five|\d+)\s+(?:units?|pcs?|pieces?|sets?|of them)$/i.test(item)) return false
  if (/\?/.test(item)) return false
  if (/^(i |i'm |im |my |we |please |how |what |where |when |can |do |is )/i.test(item)) return false
  if (/\b(?:street|road|close|avenue|crescent|lane)\b/i.test(item)) return false
  if (/\b(?:lights?|fridge|freezer|ac|air\s*conditioners?|tvs?|televisions?|ps5|playstation|xbox|pcs?|laptops?|starlink|inverters?|batter(?:y|ies)|panels?|generators?|printers?|routers?|phones?)\b/i.test(item)) return true
  return /\b\d+(?:\.\d+)?\s*(?:w|watts?|hp|kva)\b/i.test(item)
}

export function quoteLines(lines: { item: string; amount: string }[]): string {
  const list = lines.map((line) => `${line.item}: ${line.amount}`).join('\n')
  return `Here are the prices:\n${list}\nTell me which ones you want, and I will prepare the invoice.`
}
