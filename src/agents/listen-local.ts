type ListenHandlers = {
  onText: (text: string, final: boolean) => void
  onError: (message: string) => void
  keepGoing: () => boolean
  onReady?: () => void
}

type Transcriber = (audio: Float32Array) => Promise<string>

let transcriber: Transcriber | null = null
let loading: Promise<void> | null = null

async function ensureTranscriber() {
  if (transcriber) return
  if (!loading) {
    loading = (async () => {
      const { env, pipeline } = await import('@xenova/transformers')
      env.allowRemoteModels = true
      const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { quantized: true })
      transcriber = async (audio: Float32Array) => {
        const out = await asr(audio)
        if (out && typeof out === 'object' && 'text' in out) return String((out as { text: string }).text).trim()
        return ''
      }
    })()
  }
  await loading
}

function rms(data: Float32Array) {
  let sum = 0
  for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i]
  return Math.sqrt(sum / Math.max(1, data.length))
}

async function to16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext()
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
  await ctx.close()
  const data = buffer.numberOfChannels > 1 ? mix(buffer) : buffer.getChannelData(0)
  if (Math.abs(buffer.sampleRate - 16_000) < 1) return data
  const ratio = buffer.sampleRate / 16_000
  const length = Math.max(1, Math.floor(data.length / ratio))
  const out = new Float32Array(length)
  for (let i = 0; i < length; i += 1) out[i] = data[Math.min(data.length - 1, Math.floor(i * ratio))]
  return out
}

function mix(buffer: AudioBuffer): Float32Array {
  const length = buffer.length
  const out = new Float32Array(length)
  const channels = buffer.numberOfChannels
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i += 1) out[i] += data[i] / channels
  }
  return out
}

function mimeType() {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return ''
}

function energy(analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(samples)
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) {
    const v = (samples[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}

/** Record the mic on this computer and transcribe here. Used when the browser speech service returns network errors. */
export function startLocalListening({ onText, onError, keepGoing, onReady }: ListenHandlers): { stop: () => void } {
  let stopped = false
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let audioCtx: AudioContext | null = null
  let raf = 0
  let busy = false
  let chunks: Blob[] = []
  const mime = mimeType()

  const stop = () => {
    stopped = true
    cancelAnimationFrame(raf)
    try {
      recorder?.stop()
    } catch {
      /* already stopped */
    }
    recorder = null
    void audioCtx?.close()
    audioCtx = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }

  const transcribe = async (blob: Blob) => {
    if (stopped || busy || blob.size < 1200) return
    busy = true
    try {
      const audio = await to16k(blob)
      if (rms(audio) < 0.012) return
      await ensureTranscriber()
      const text = (await transcriber?.(audio))?.replace(/\s+/g, ' ').trim() ?? ''
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'F',location:'listen-local.ts:chunk',message:'local transcript',data:{chars:text.length,bytes:blob.size,runId:'post-fix'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (text && keepGoing() && !stopped) onText(text, true)
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'F',location:'listen-local.ts:chunk',message:'local transcribe failed',data:{name:err instanceof Error?err.name:'unknown',runId:'post-fix'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } finally {
      busy = false
    }
  }

  void (async () => {
    try {
      onError('Getting speech ready on this computer…')
      await ensureTranscriber()
      if (stopped || !keepGoing()) return
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorder = rec
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })
        chunks = []
        void transcribe(blob)
        if (!stopped && keepGoing()) {
          try {
            rec.start()
          } catch {
            /* restart after stop */
          }
        }
      }
      audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      const samples: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(analyser.fftSize))
      let voiced = false
      let quiet = 0
      let startedAt = performance.now()

      const watch = () => {
        if (stopped) return
        const level = energy(analyser, samples)
        const elapsed = performance.now() - startedAt
        if (level > 0.045) {
          voiced = true
          quiet = 0
        } else if (voiced) {
          quiet += 1
        }
        const longEnough = elapsed > 900
        const endBySilence = voiced && quiet > 18 && longEnough
        const endByLength = elapsed > 4200
        if (rec.state === 'recording' && (endBySilence || endByLength)) {
          voiced = false
          quiet = 0
          startedAt = performance.now()
          try {
            rec.stop()
          } catch {
            /* already stopped */
          }
        }
        raf = requestAnimationFrame(watch)
      }

      rec.start()
      startedAt = performance.now()
      raf = requestAnimationFrame(watch)
      onReady?.()
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'F',location:'listen-local.ts:start',message:'local listener started',data:{mime,runId:'post-fix'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7397/ingest/6a4b834e-7dbc-45d6-99db-0f30e34f4ffe',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'950888'},body:JSON.stringify({sessionId:'950888',hypothesisId:'F',location:'listen-local.ts:start',message:'local listener failed',data:{name:err instanceof Error?err.name:'unknown',runId:'post-fix'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      onError('Allow the microphone to talk on this call.')
      stop()
    }
  })()

  return { stop }
}
