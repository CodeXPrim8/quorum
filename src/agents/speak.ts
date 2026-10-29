import { startLocalListening } from './listen-local'
import { staffVoice } from './staff-voice'
import type { Staff } from '../types'

type SpeechResult = { isFinal: boolean; 0: { transcript: string } }

type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }

type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onresult: ((event: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  const win = window as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null
}

export function canListen(): boolean {
  return (
    recognitionCtor() !== null ||
    (typeof MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia))
  )
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

const FATAL_MIC = new Set(['not-allowed', 'service-not-allowed'])

let held: MediaStream | null = null

/** Open the mic on the same click that starts the call, so the browser still treats it as a user gesture. */
export async function holdMicrophone(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return canListen()
  if (held?.getTracks().some((track) => track.readyState === 'live')) return true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    const tracks = stream.getTracks().length
    stream.getTracks().forEach((track) => track.stop())
    held = null
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'A',location:'speak.ts:holdMicrophone',message:'mic stream opened',data:{tracks,live:false,released:true,canListen:canListen(),runId:'post-fix'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return true
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'A',location:'speak.ts:holdMicrophone',message:'mic stream failed',data:{name:err instanceof Error?err.name:'unknown',canListen:canListen()},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return false
  }
}

export function releaseMicrophone() {
  held?.getTracks().forEach((track) => track.stop())
  held = null
}

export function startListening(
  onText: (text: string, final: boolean) => void,
  onError: (message: string) => void,
  keepGoing: () => boolean,
  onReady?: () => void,
): { stop: () => void } | null {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'A',location:'speak.ts:startListening',message:'no speech recognition ctor',data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return startLocalListening({ onText, onError, keepGoing, onReady })
  }
  let stopped = false
  let rec: Recognition | null = null
  let retry = 0
  let timer = 0
  let local: { stop: () => void } | null = null
  let falling = false

  const detach = () => {
    if (!rec) return
    rec.onstart = null
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    try {
      rec.stop()
    } catch {
      /* already stopped */
    }
    rec = null
  }

  const useLocal = () => {
    if (stopped || local || falling) return
    falling = true
    window.clearTimeout(timer)
    detach()
    // #region agent log
    fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'F',location:'speak.ts:useLocal',message:'switching to local speech',data:{runId:'post-fix'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    local = startLocalListening({ onText, onError, keepGoing, onReady })
  }

  const listen = () => {
    if (stopped || falling || local || !keepGoing()) return
    detach()
    const next = new Ctor()
    rec = next
    next.continuous = false
    next.interimResults = true
    next.lang = (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en') ? navigator.language : 'en-US')
    next.onstart = () => {
      retry = 0
      onReady?.()
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'B',location:'speak.ts:onstart',message:'recognition started',data:{lang:next.lang,held:Boolean(held?.active)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
    next.onresult = (event) => {
      retry = 0
      onReady?.()
      let text = ''
      let final = false
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript
        if (event.results[i].isFinal) final = true
      }
      const line = text.trim()
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'B',location:'speak.ts:onresult',message:'recognition result',data:{chars:line.length,final,count:event.results.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      onText(line, final)
    }
    next.onerror = (event) => {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'E',location:'speak.ts:onerror',message:'recognition error',data:{error:event.error,stopped,keepGoing:keepGoing()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (stopped || event.error === 'aborted' || event.error === 'no-speech') return
      if (FATAL_MIC.has(event.error)) {
        stopped = true
        onError('Allow the microphone to talk on this call.')
        return
      }
      if (event.error === 'network') {
        useLocal()
        return
      }
      retry += 1
    }
    next.onend = () => {
      const going = !stopped && keepGoing() && !local && !falling
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'E',location:'speak.ts:onend',message:'recognition ended',data:{stopped,going,retry,local:Boolean(local)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!going) return
      window.clearTimeout(timer)
      timer = window.setTimeout(listen, Math.min(1600, 280 + retry * 220))
    }
    try {
      next.start()
      onReady?.()
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'A',location:'speak.ts:start',message:'recognition start threw',data:{name:err instanceof Error?err.name:'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (stopped) return
      window.clearTimeout(timer)
      timer = window.setTimeout(listen, Math.min(1600, 400 + retry * 220))
    }
  }

  listen()
  return {
    stop: () => {
      stopped = true
      window.clearTimeout(timer)
      detach()
      local?.stop()
      local = null
    },
  }
}

function spoken(text: string): string {
  return text
    .replace(/(?:^|\n)\s*DESIGN:\s*.+$/i, '')
    .replace(/[*#_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420)
}

const FEMALE_VOICE = /female|woman|zira|samantha|victoria|susan|hazel|aria|jenny|sara|sonia|libby|natasha|karen|moira|fiona|tessa|veena|catherine/
const MALE_VOICE = /male|\bman\b|david|mark|george|daniel|\balex\b|guy|ryan|james|ravi|fred|arthur|brian/

async function voiceList(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis
  let voices = synth.getVoices()
  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      const done = () => {
        synth.removeEventListener('voiceschanged', done)
        resolve()
      }
      synth.addEventListener('voiceschanged', done)
      window.setTimeout(done, 500)
    })
    voices = synth.getVoices()
  }
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  return english.length > 0 ? english : voices
}

function poolFor(voices: SpeechSynthesisVoice[], kind: 'woman' | 'man'): SpeechSynthesisVoice[] {
  const want = kind === 'woman' ? FEMALE_VOICE : MALE_VOICE
  const other = kind === 'woman' ? MALE_VOICE : FEMALE_VOICE
  const match = voices.filter((voice) => want.test(voice.name.toLowerCase()))
  if (match.length > 0) return match
  const neutral = voices.filter((voice) => !other.test(voice.name.toLowerCase()))
  return neutral.length > 0 ? neutral : voices
}

let spokenAudio: HTMLAudioElement | null = null

async function speakCloud(line: string, person: Pick<Staff, 'id' | 'name'>): Promise<boolean> {
  const voice = staffVoice(person)
  try {
    const response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice: voice.tts,
        input: line,
      }),
    })
    if (!response.ok) return false
    const blob = await response.blob()
    if (blob.size < 80) return false
    const url = URL.createObjectURL(blob)
    await new Promise<void>((resolve) => {
      const audio = new Audio(url)
      spokenAudio = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        if (spokenAudio === audio) spokenAudio = null
        resolve()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        if (spokenAudio === audio) spokenAudio = null
        resolve()
      }
      void audio.play().catch(() => resolve())
    })
    return true
  } catch {
    return false
  }
}

/** Each person keeps their own voice. Women speak female, men speak male. */
export async function speakAs(text: string, person: Pick<Staff, 'id' | 'name'>): Promise<void> {
  const line = spoken(text)
  if (!line) return
  if (await speakCloud(line, person)) return
  if (!canSpeak()) return
  const voice = staffVoice(person)
  const voices = await voiceList()
  await new Promise<void>((resolve) => {
    const pool = poolFor(voices, voice.kind)
    const utter = new SpeechSynthesisUtterance(line)
    if (pool.length > 0) utter.voice = pool[hash(person.id || person.name) % pool.length]
    utter.rate = voice.rate
    utter.pitch = voice.pitch
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  })
}

function hash(value: string): number {
  let n = 0
  for (const char of value) n += char.charCodeAt(0)
  return Math.abs(n)
}

export function stopSpeaking(): void {
  spokenAudio?.pause()
  spokenAudio = null
  if (canSpeak()) window.speechSynthesis.cancel()
}
