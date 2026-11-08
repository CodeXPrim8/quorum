import type { Staff } from '../types'

export type VoiceKind = 'woman' | 'man'

export type StaffVoice = {
  kind: VoiceKind
  /** OpenAI GPT Live / Realtime voice. */
  live: string
  /** OpenAI TTS fallback voice. */
  tts: string
  rate: number
  pitch: number
}

const LIVE_WOMEN = ['coral', 'sage', 'shimmer', 'verse', 'marin'] as const
const LIVE_MEN = ['ash', 'echo', 'ballad', 'cedar'] as const
const TTS_WOMEN = ['nova', 'shimmer', 'coral', 'sage'] as const
const TTS_MEN = ['onyx', 'echo', 'ash', 'fable'] as const

/** First names treated as men when someone new is added. */
const MEN = new Set([
  'jonah',
  'john',
  'samir',
  'sam',
  'marco',
  'david',
  'tom',
  'thomas',
  'jules',
  'james',
  'michael',
  'daniel',
  'robert',
  'paul',
  'peter',
  'andrew',
  'benjamin',
  'william',
  'charles',
  'joseph',
  'kevin',
  'brian',
  'ryan',
  'lucas',
  'nathan',
  'omar',
  'ahmed',
  'carlos',
  'diego',
  'luis',
])

const WOMEN = new Set([
  'morgan',
  'priya',
  'lena',
  'nina',
  'maya',
  'casey',
  'helen',
  'aisha',
  'ruth',
  'elise',
  'sofia',
  'sophia',
  'imani',
  'sarah',
  'emily',
  'anna',
  'maria',
  'fatima',
  'amara',
  'chloe',
  'grace',
  'olivia',
  'ava',
  'mia',
  'zara',
  'leila',
  'hana',
  'yuki',
  'mei',
])

/** One voice each so people do not collapse into the same sound. */
export const QUORUM_SPEAKER: Pick<Staff, 'id' | 'name'> = { id: 'quorum', name: 'Quorum' }

const ROSTER: Record<string, StaffVoice> = {
  quorum: { kind: 'man', live: 'ash', tts: 'onyx', rate: 0.97, pitch: 0.9 },
  staff_morgan: { kind: 'woman', live: 'coral', tts: 'nova', rate: 0.98, pitch: 1.06 },
  staff_priya: { kind: 'woman', live: 'sage', tts: 'shimmer', rate: 1.0, pitch: 1.04 },
  staff_jonah: { kind: 'man', live: 'ash', tts: 'onyx', rate: 0.96, pitch: 0.84 },
  staff_lena: { kind: 'woman', live: 'shimmer', tts: 'coral', rate: 1.01, pitch: 1.08 },
  staff_samir: { kind: 'man', live: 'echo', tts: 'echo', rate: 0.94, pitch: 0.82 },
  staff_nina: { kind: 'woman', live: 'verse', tts: 'sage', rate: 0.99, pitch: 1.05 },
  staff_maya: { kind: 'woman', live: 'marin', tts: 'nova', rate: 1.02, pitch: 1.1 },
  staff_casey: { kind: 'woman', live: 'coral', tts: 'shimmer', rate: 0.97, pitch: 1.03 },
  staff_helen: { kind: 'woman', live: 'sage', tts: 'coral', rate: 0.95, pitch: 1.02 },
  staff_marco: { kind: 'man', live: 'ballad', tts: 'ash', rate: 0.93, pitch: 0.8 },
  staff_aisha: { kind: 'woman', live: 'verse', tts: 'nova', rate: 1.0, pitch: 1.07 },
  staff_david: { kind: 'man', live: 'cedar', tts: 'fable', rate: 0.92, pitch: 0.78 },
  staff_ruth: { kind: 'woman', live: 'shimmer', tts: 'sage', rate: 0.96, pitch: 1.01 },
  staff_elise: { kind: 'woman', live: 'marin', tts: 'shimmer', rate: 0.98, pitch: 1.04 },
  staff_tom: { kind: 'man', live: 'ash', tts: 'onyx', rate: 0.97, pitch: 0.86 },
  staff_sofia: { kind: 'woman', live: 'coral', tts: 'coral', rate: 1.01, pitch: 1.09 },
  staff_imani: { kind: 'woman', live: 'sage', tts: 'nova', rate: 0.99, pitch: 1.05 },
  staff_jules: { kind: 'man', live: 'echo', tts: 'echo', rate: 0.95, pitch: 0.83 },
}

function firstName(person: Pick<Staff, 'name'>): string {
  return person.name.split(' ')[0]?.toLowerCase() ?? ''
}

function hash(value: string): number {
  let n = 0
  for (const char of value) n += char.charCodeAt(0)
  return Math.abs(n)
}

export function voiceKind(person: Pick<Staff, 'id' | 'name'> | Pick<Staff, 'name'> & { id?: string }): VoiceKind {
  if (person.id && ROSTER[person.id]) return ROSTER[person.id].kind
  const first = firstName(person)
  if (MEN.has(first)) return 'man'
  if (WOMEN.has(first)) return 'woman'
  return MEN.has(first) ? 'man' : 'woman'
}

export function staffVoice(person: Pick<Staff, 'id' | 'name'>): StaffVoice {
  if (ROSTER[person.id]) return ROSTER[person.id]
  const kind = voiceKind(person)
  const livePool = kind === 'woman' ? LIVE_WOMEN : LIVE_MEN
  const ttsPool = kind === 'woman' ? TTS_WOMEN : TTS_MEN
  const n = hash(person.id || person.name)
  const shade = (n % 6) * 0.015
  return {
    kind,
    live: livePool[n % livePool.length],
    tts: ttsPool[n % ttsPool.length],
    rate: (kind === 'woman' ? 0.97 : 0.93) + shade,
    pitch: (kind === 'woman' ? 1.03 : 0.8) + shade,
  }
}

export function liveVoiceName(kind: VoiceKind, variety: number): string {
  const pool = kind === 'woman' ? LIVE_WOMEN : LIVE_MEN
  return pool[Math.abs(variety) % pool.length]
}

export function cloudVoiceName(kind: VoiceKind, variety: number): string {
  const pool = kind === 'woman' ? TTS_WOMEN : TTS_MEN
  return pool[Math.abs(variety) % pool.length]
}
