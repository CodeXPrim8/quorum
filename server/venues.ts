import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { venueById, TRADING_VENUES, type TradingVenue } from '../src/domain/venues'

export type VenueLink = {
  companyId: string
  venueId: string
  connectedAt: string
  /** login = user signed in via Connect and Quorum keeps the link until Disconnect. */
  mode: 'login'
  name?: string
  loginUrl?: string
  market?: TradingVenue['market']
}

type StoreFile = { version: 1; links: VenueLink[] }

const STORE_PATH = join(process.cwd(), 'data', 'venue-links.json')

function readStore(): StoreFile {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  if (!existsSync(STORE_PATH)) return { version: 1, links: [] }
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as StoreFile
    if (parsed?.version !== 1 || !Array.isArray(parsed.links)) return { version: 1, links: [] }
    return parsed
  } catch {
    return { version: 1, links: [] }
  }
}

function writeStore(store: StoreFile) {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

export function listVenueStatus(companyId: string): Array<TradingVenue & { connected: boolean; connectedAt?: string }> {
  const links = companyId ? readStore().links.filter((item) => item.companyId === companyId) : []
  const listed = TRADING_VENUES.map((venue) => {
    const link = links.find((item) => item.venueId === venue.id)
    return { ...venue, connected: Boolean(link), connectedAt: link?.connectedAt }
  })
  const extra = links
    .filter((link) => !TRADING_VENUES.some((venue) => venue.id === link.venueId))
    .map((link) => ({
      id: link.venueId,
      name: link.name || link.venueId,
      market: link.market ?? ('sports' as const),
      loginUrl: link.loginUrl || '',
      connected: true,
      connectedAt: link.connectedAt,
    }))
  return [...listed, ...extra]
}

export function connectVenue(
  companyId: string,
  venueId: string,
  custom?: { name?: string; loginUrl?: string; market?: TradingVenue['market'] },
): { loginUrl: string; connected: true } {
  const venue = venueById(venueId)
  const loginUrl = (venue?.loginUrl || custom?.loginUrl || '').trim()
  if (!venue && !/^https?:\/\//i.test(loginUrl)) throw new Error('Paste the bookmaker’s web address.')
  if (!companyId.trim()) throw new Error('Open a company first.')
  if (!venueId.trim()) throw new Error('Name the bookmaker.')
  const store = readStore()
  const next = store.links.filter((item) => !(item.companyId === companyId && item.venueId === venueId))
  next.push({
    companyId,
    venueId,
    connectedAt: new Date().toISOString(),
    mode: 'login',
    name: venue?.name || custom?.name?.trim().slice(0, 80) || venueId,
    loginUrl,
    market: venue?.market || custom?.market || 'sports',
  })
  writeStore({ version: 1, links: next })
  return { loginUrl, connected: true }
}

export function disconnectVenue(companyId: string, venueId: string): void {
  const store = readStore()
  writeStore({
    version: 1,
    links: store.links.filter((item) => !(item.companyId === companyId && item.venueId === venueId)),
  })
}
