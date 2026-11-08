import { planOf, type PlanId } from './billing'
import type { SocialPlatform } from '../types'
import { normalizeWebsite } from './website'

export const SOCIAL_NETWORKS = ['youtube', 'tiktok', 'instagram', 'linkedin'] as const

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export type CompanySocial = Partial<Record<SocialNetwork, string>>

const LABELS: Record<SocialNetwork, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
}

const PLACEHOLDERS: Record<SocialNetwork, string> = {
  youtube: 'youtube.com/@company',
  tiktok: 'tiktok.com/@company',
  instagram: 'instagram.com/company',
  linkedin: 'linkedin.com/company/name',
}

export function socialLabel(network: SocialNetwork): string {
  return LABELS[network]
}

export function socialPlaceholder(network: SocialNetwork): string {
  return PLACEHOLDERS[network]
}

/** Keep only real links. A blank field stays blank. */
export function normalizeSocial(raw: CompanySocial | undefined): CompanySocial | undefined {
  if (!raw) return undefined
  const next: CompanySocial = {}
  for (const network of SOCIAL_NETWORKS) {
    const url = normalizeWebsite(raw[network])
    if (url) next[network] = url
  }
  return Object.keys(next).length > 0 ? next : undefined
}

/** The first network the user typed that is not a link. Blank fields are fine. */
export function invalidSocial(raw: CompanySocial | undefined): SocialNetwork | null {
  if (!raw) return null
  for (const network of SOCIAL_NETWORKS) {
    const value = (raw[network] ?? '').trim()
    if (value && !normalizeWebsite(value)) return network
  }
  return null
}

export function socialAccounts(social: CompanySocial | undefined): string {
  if (!social) return ''
  const lines = SOCIAL_NETWORKS.flatMap((network) =>
    social[network] ? [`${LABELS[network]}: ${social[network]}`] : [],
  )
  return lines.length > 0 ? `Connected social accounts:\n${lines.join('\n')}` : ''
}

/** The saved link for a calendar platform, when the company added one. */
export function accountFor(social: CompanySocial | undefined, platform: SocialPlatform | undefined): string | undefined {
  if (!social || !platform) return undefined
  return social[platform]
}

/** Cloud plans with publish allowance may send approved Instagram posts live. */
export function planAllowsPublish(planId: PlanId | undefined): boolean {
  return planOf(planId ?? 'starter').publishes > 0
}
