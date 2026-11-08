import type { DesignAudience } from '../types'

const INTERNAL =
  /\b(meeting|meetings|standup|stand-?up|all[- ]hands|town[- ]hall|agenda|internal|in[- ]house|office|hr|memo|notice|announcement|briefing|kickoff|kick-off|retreat|training|onboarding|goals?|okr|kpi)\b/i

const PROMOTIONAL =
  /\b(instagram|tiktok|youtube|social|campaign|promo(t(e|ion(al)?)?)?|product|service|launch|sell|flyer for (the )?store|ad\b|advert)\b/i

/** Calendar posts are always promotional. Freeform briefs pick a lane from the words. */
export function designAudience(brief: string, calendarId?: string): DesignAudience {
  if (calendarId) return 'promotional'
  const text = brief.replace(/\s+/g, ' ').trim()
  if (!text) return 'promotional'
  if (INTERNAL.test(text) && !PROMOTIONAL.test(text)) return 'internal'
  if (INTERNAL.test(text) && /\b(meeting|standup|stand-?up|all[- ]hands|internal|in[- ]house|agenda)\b/i.test(text)) {
    return 'internal'
  }
  if (PROMOTIONAL.test(text)) return 'promotional'
  if (INTERNAL.test(text)) return 'internal'
  return 'promotional'
}

export function audienceLabel(audience: DesignAudience | undefined): string {
  return audience === 'internal' ? 'In-house' : 'Promotional'
}
