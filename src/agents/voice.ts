const STORAGE_KEY = 'quorum.voice.v1'

export type VoiceLink = {
  baseUrl: string
  model: string
  apiKey: string
}

export { cloudVoiceName } from './staff-voice'

export function readVoiceLink(): VoiceLink | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VoiceLink>
    if (!parsed.baseUrl || !parsed.model || !parsed.apiKey) return null
    return { baseUrl: parsed.baseUrl, model: parsed.model, apiKey: parsed.apiKey }
  } catch {
    return null
  }
}

export function saveVoiceLink(link: VoiceLink | null): void {
  if (!link) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(link))
}

