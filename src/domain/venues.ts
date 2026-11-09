export type TradingVenue = {
  id: string
  name: string
  market: 'crypto' | 'forex' | 'sports'
  loginUrl: string
}

/** Platforms listed in Quorum. Connect opens the venue login. The link stays until Disconnect. */
export const TRADING_VENUES: TradingVenue[] = [
  { id: 'binance', name: 'Binance', market: 'crypto', loginUrl: 'https://accounts.binance.com/en/login' },
  { id: 'bybit', name: 'Bybit', market: 'crypto', loginUrl: 'https://www.bybit.com/en/login' },
  { id: 'okx', name: 'OKX', market: 'crypto', loginUrl: 'https://www.okx.com/account/login' },
  { id: 'oanda', name: 'OANDA', market: 'forex', loginUrl: 'https://www.oanda.com/account/login' },
  { id: 'fxcm', name: 'FXCM', market: 'forex', loginUrl: 'https://www.fxcm.com/login' },
  { id: 'sportybet', name: 'SportyBet', market: 'sports', loginUrl: 'https://www.sportybet.com/ng/' },
  { id: 'nairabet', name: 'NairaBet', market: 'sports', loginUrl: 'https://www.nairabet.com/' },
  { id: 'bet9ja', name: 'Bet9ja', market: 'sports', loginUrl: 'https://web.bet9ja.com/' },
  { id: 'betway', name: 'Betway', market: 'sports', loginUrl: 'https://www.betway.com/' },
  { id: 'onexbet', name: '1xBet', market: 'sports', loginUrl: 'https://1xbet.ng/' },
]

export type BookHit = { id: string; name: string; loginUrl: string; listed: boolean }

/** A featured book, a pasted address, or a best-guess login page for a name that is not listed. */
export function lookupBook(query: string): BookHit | null {
  const text = query.trim()
  if (text.length < 2) return null
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      const host = url.hostname.replace(/^www\./, '')
      return { id: bookId(host), name: host, loginUrl: url.toString(), listed: false }
    } catch {
      return null
    }
  }
  const needle = text.toLowerCase()
  const sports = TRADING_VENUES.filter((item) => item.market === 'sports')
  const known =
    sports.find((item) => item.name.toLowerCase() === needle) ??
    sports.find((item) => item.name.toLowerCase().startsWith(needle) && needle.length >= 4) ??
    sports.find((item) => needle.length >= 4 && item.name.toLowerCase().includes(needle))
  if (known) return { id: known.id, name: known.name, loginUrl: known.loginUrl, listed: true }
  const slug = needle.replace(/[^a-z0-9]+/g, '').slice(0, 40)
  if (slug.length < 3) return null
  return {
    id: bookId(slug),
    name: text.slice(0, 80),
    loginUrl: `https://www.${slug}.com`,
    listed: false,
  }
}

function bookId(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
  return `book_${slug || 'custom'}`
}

export function venueById(id: string): TradingVenue | null {
  return TRADING_VENUES.find((item) => item.id === id) ?? null
}
