import type { AppState, Command, DesktopAccess, Staff, Task } from '../types'
import { remoteCommand, usingRemoteAgent } from './agent-link'
import { askModel, readModelLink, type ModelContentPart } from './model'
import { wantsProgram } from './quorum'
import { setScreen } from './screen'

const TOKEN_KEY = 'quorum.desktop.token.v1'

export function readDesktopToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeDesktopToken(token: string | null): void {
  try {
    if (!token) sessionStorage.removeItem(TOKEN_KEY)
    else sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Private mode should not break the company UI.
  }
}

export async function probeDesktopAgent(): Promise<boolean> {
  try {
    const response = await fetch('/api/desktop/status')
    const data = (await response.json()) as { ready?: boolean }
    return Boolean(data.ready)
  } catch {
    return false
  }
}

export async function startDesktopServerSession(): Promise<string> {
  if (usingRemoteAgent()) {
    await remoteCommand('session_start')
    writeDesktopToken('remote')
    return 'remote'
  }
  const response = await fetch('/api/desktop/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start' }),
  })
  const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string }
  if (!response.ok || !data.token) throw new Error(data.error || 'Desktop session could not start.')
  writeDesktopToken(data.token)
  return data.token
}

export async function endDesktopServerSession(): Promise<void> {
  const remote = usingRemoteAgent()
  writeDesktopToken(null)
  setScreen({ kind: 'idle' })
  if (remote) {
    try {
      await remoteCommand('session_end')
    } catch {
      // The agent may already be offline.
    }
    return
  }
  try {
    await fetch('/api/desktop/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end' }),
    })
  } catch {
    // Ending locally is enough if the server is already gone.
  }
}

export async function allowQuorumDesktop(
  dispatch: (command: Command) => void,
  desktop: DesktopAccess,
): Promise<void> {
  if (!desktop.sessionActive) {
    await startDesktopServerSession()
    dispatch({ type: 'SET_DESKTOP_AGENT', connected: true })
    dispatch({ type: 'START_DESKTOP_SESSION', mode: 'live' })
  } else if (desktop.mode !== 'live') {
    dispatch({ type: 'START_DESKTOP_SESSION', mode: 'live' })
  }
  dispatch({ type: 'DECIDE_QUORUM_DESKTOP', decision: 'granted' })
}

type Shot = { image: string; width: number; height: number; screenWidth: number; screenHeight: number; framed?: boolean }

async function screenshot(token: string): Promise<Shot> {
  if (usingRemoteAgent()) {
    const data = await remoteCommand<Shot>('screenshot')
    return { ...data, framed: data.framed === true }
  }
  const response = await fetch('/api/desktop/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken: token }),
  })
  const data = (await response.json().catch(() => ({}))) as Shot & { error?: string }
  if (!response.ok || !data.image) throw new Error(data.error || 'Screenshot failed.')
  return {
    image: data.image,
    width: data.width,
    height: data.height,
    screenWidth: data.screenWidth || data.width,
    screenHeight: data.screenHeight || data.height,
    framed: data.framed === true,
  }
}

export async function peekDesktop(): Promise<Shot | null> {
  const token = readDesktopToken()
  if (!token) return null
  try {
    return await screenshot(token)
  } catch {
    return null
  }
}

async function markUsing(on: boolean): Promise<void> {
  const token = readDesktopToken()
  if (!token) return
  if (usingRemoteAgent()) {
    try {
      await remoteCommand('using', { action: on ? 'start' : 'end' })
    } catch {
      // The in-app mouse still shows if the Windows overlay cannot start.
    }
    return
  }
  try {
    await fetch('/api/desktop/using', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: token, action: on ? 'start' : 'end' }),
    })
  } catch {
    // The in-app mouse still shows if the Windows overlay cannot start.
  }
}

function restCursor(shot: { width: number; height: number }, cursor?: { x: number; y: number }): { x: number; y: number } {
  if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) return cursor
  return { x: shot.width * 0.48, y: shot.height * 0.42 }
}

function showDesk(
  shot: Shot,
  extra?: { cursor?: { x: number; y: number }; click?: boolean; note?: string },
): void {
  setScreen({
    kind: 'desktop',
    image: shot.framed ? shot.image : '',
    width: shot.width,
    height: shot.height,
    cursor: restCursor(shot, extra?.cursor),
    click: extra?.click,
    note: extra?.note,
  })
}

function showDeskStart(note = 'Starting on this computer'): void {
  setScreen({
    kind: 'desktop',
    image: '',
    width: 1280,
    height: 720,
    cursor: { x: 614, y: 302 },
    note,
  })
}

async function sendInput(token: string, body: Record<string, unknown>): Promise<void> {
  if (usingRemoteAgent()) {
    await remoteCommand('input', body)
    return
  }
  const response = await fetch('/api/desktop/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken: token, ...body }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || 'Desktop input failed.')
  }
}

export type ModelAction =
  | { kind: 'click'; x: number; y: number; button?: 'left' | 'right'; clicks?: 1 | 2; note?: string }
  | { kind: 'type'; text: string; note?: string }
  | { kind: 'key'; key: string; note?: string }
  | { kind: 'scroll'; dy: number; note?: string }
  | { kind: 'launch'; app: string; note?: string }
  | { kind: 'open'; url: string; note?: string }
  | { kind: 'wait'; ms: number; note?: string }
  | { kind: 'ask'; note: string }
  | { kind: 'done'; note?: string }

export function parseDesktopAction(raw: string): ModelAction | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const kind = String(parsed.kind ?? '').toLowerCase()
    const note = typeof parsed.note === 'string' ? parsed.note.slice(0, kind === 'done' ? 700 : 180) : undefined
    if (kind === 'done') return { kind: 'done', note }
    if (kind === 'ask') return { kind: 'ask', note: (note || 'Need your OK to continue.').slice(0, 180) }
    if (kind === 'wait') {
      const ms = Math.max(200, Math.min(4000, Number(parsed.ms) || 800))
      return { kind: 'wait', ms, note }
    }
    if (kind === 'click' || kind === 'double') {
      const x = Number(parsed.x)
      const y = Number(parsed.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      const clicks: 1 | 2 = kind === 'double' || parsed.clicks === 2 || parsed.double === true ? 2 : 1
      return {
        kind: 'click',
        x,
        y,
        button: parsed.button === 'right' ? 'right' : 'left',
        clicks,
        note,
      }
    }
    if (kind === 'type') return { kind: 'type', text: String(parsed.text ?? '').slice(0, 2000), note }
    if (kind === 'key') return { kind: 'key', key: String(parsed.key ?? ''), note }
    if (kind === 'scroll') {
      const dy = Number(parsed.dy)
      if (!Number.isFinite(dy)) return null
      return { kind: 'scroll', dy, note }
    }
    if (kind === 'launch') return { kind: 'launch', app: String(parsed.app ?? parsed.text ?? ''), note }
    if (kind === 'open') return { kind: 'open', url: String(parsed.url ?? parsed.text ?? ''), note }
  } catch {
    return null
  }
  return null
}

const KNOWN_APPS: Array<{ test: RegExp; app: string; label: string }> = [
  { test: /\bnote\s*pad\b|\bnotepad\b/i, app: 'notepad', label: 'Notepad' },
  { test: /\b(ms)?paint\b/i, app: 'paint', label: 'Paint' },
  { test: /\bcalc(ulator)?\b/i, app: 'calc', label: 'Calculator' },
  { test: /\b(file\s*)?explorer\b|\bthis pc\b|\bfile manager\b/i, app: 'explorer', label: 'File Explorer' },
  { test: /\bchrome\b/i, app: 'chrome', label: 'Chrome' },
  { test: /\bedge\b/i, app: 'edge', label: 'Edge' },
  { test: /\bfirefox\b/i, app: 'firefox', label: 'Firefox' },
  { test: /\bcommand prompt\b|\bcmd\b/i, app: 'cmd', label: 'Command Prompt' },
  { test: /\bpowershell\b/i, app: 'powershell', label: 'PowerShell' },
  { test: /\bvs\s*code\b|\bvscode\b/i, app: 'code', label: 'VS Code' },
  { test: /\bexcel\b/i, app: 'excel', label: 'Excel' },
  { test: /\b(ms\s*)?word\b|\bwinword\b/i, app: 'word', label: 'Word' },
  { test: /\bpowerpoint\b/i, app: 'powerpoint', label: 'PowerPoint' },
  { test: /\bwordpad\b/i, app: 'wordpad', label: 'WordPad' },
  { test: /\bterminal\b/i, app: 'terminal', label: 'Terminal' },
  { test: /\bsnipping\b/i, app: 'snippingtool', label: 'Snipping Tool' },
  { test: /\bchat\s*gpt\b/i, app: 'ChatGPT', label: 'ChatGPT' },
  { test: /\bclaude\b/i, app: 'Claude', label: 'Claude' },
  { test: /\bgemini\b/i, app: 'Gemini', label: 'Gemini' },
  { test: /\bcopilot\b/i, app: 'Copilot', label: 'Copilot' },
  { test: /\bperplexity\b/i, app: 'Perplexity', label: 'Perplexity' },
]

function quotedText(prompt: string): string | undefined {
  const match = prompt.match(/["“]([^"”]{1,400})["”]/) || prompt.match(/'([^']{1,400})'/)
  return match?.[1]?.trim() || undefined
}

export function seedDesktopActions(prompt: string, already: string[] = []): ModelAction[] {
  const text = prompt.trim()
  if (!text) return []
  const done = already.join('\n').toLowerCase()
  const actions: ModelAction[] = []
  const push = (action: ModelAction) => {
    if (action.kind === 'launch') {
      const label = (action.note || action.app).toLowerCase()
      if (done.includes(`opened ${action.app}`) || done.includes(label)) return
    }
    if (action.kind === 'open' && done.includes(action.url.toLowerCase())) return
    actions.push(action)
  }

  const urlMatch = text.match(/\bhttps?:\/\/[^\s<>"')]+/i)
  let openedPage = false
  if (urlMatch) {
    const url = urlMatch[0].replace(/[.,;:!?)]+$/, '')
    push({ kind: 'open', url, note: `Open ${url}` })
    push({ kind: 'wait', ms: 400, note: 'Wait for the page' })
    openedPage = true
  }
  const namedSite = text.match(/\b(?:the\s+)?([a-z0-9-]{2,32})\s+website\b/i)
  const host = namedSite?.[1]?.toLowerCase()
  if (!openedPage && host && !/\b(the|this|that|my|our|a|an|web|official)\b/i.test(host)) {
    const url = `https://www.${host}.com`
    push({ kind: 'open', url, note: `Open ${host}` })
    push({ kind: 'wait', ms: 400, note: 'Wait for the page' })
    openedPage = true
  }

  const known = KNOWN_APPS.find((item) => item.test.test(text))
  const browser = known && /^(chrome|edge|firefox)$/.test(known.app)
  if (known && !(openedPage && browser)) {
    push({ kind: 'launch', app: known.app, note: `Open ${known.label}` })
    push({ kind: 'wait', ms: 250, note: `Wait for ${known.label}` })
  } else if (!known && !openedPage) {
    const openWhat = text.match(/\b(?:open|launch|start|run)\s+([a-z][\w .-]{1,40}?)(?:\s+and\s+|\s+then\s+|[,.]|$)/i)
    const name = openWhat?.[1]?.trim().replace(/\s+/g, ' ')
    if (name && !/\b(the|my|this|your|an?|app|application|program|computer|pc|desktop|file|window)\b/i.test(name)) {
      push({ kind: 'key', key: 'win+r', note: 'Open Run' })
      push({ kind: 'wait', ms: 180, note: 'Wait for Run' })
      push({ kind: 'type', text: name, note: `Run ${name}` })
      push({ kind: 'key', key: 'enter', note: `Start ${name}` })
      push({ kind: 'wait', ms: 280, note: 'Wait for the window' })
    }
  }

  const typed = quotedText(text) || text.match(/\btype\s+(.+)$/i)?.[1]?.trim()
  const asked = text.match(/\b(?:ask|research|look up|find out)\b(?:\s+(?:it|them|chatgpt|claude|gemini|copilot))?\s+(.{3,400})$/i)?.[1]?.trim()
  const message = (typed || asked || '').replace(/^["“]|["”]$/g, '').trim()
  if (message) {
    push({ kind: 'type', text: message.slice(0, 500), note: `Type “${message.slice(0, 40)}”` })
    if (asked && !/\b(draft|compose|reply)\b/i.test(text)) {
      push({ kind: 'key', key: 'enter', note: 'Submit that in the open program' })
      push({ kind: 'wait', ms: 500, note: 'Wait for the answer' })
    }
  }

  return actions
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timed out')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function nextAction(
  actor: string,
  title: string,
  detail: string,
  shot: Shot,
  history: string[],
  companyName: string,
  full: boolean,
): Promise<ModelAction> {
  const link = readModelLink()
  if (!link) {
    return {
      kind: 'done',
      note: history.length
        ? 'Finished the steps I could take on this computer.'
        : 'No chat model is linked, so further desktop steps cannot be planned. Link DeepSeek under Chat.',
    }
  }
  const system = full
    ? [
        `You are ${actor} at ${companyName}. You have the owner's Windows PC until the request is finished.`,
        'Reply with ONE JSON object only, no markdown.',
        'Kinds: click {x,y,clicks?,button?} | type {text} | key {key} | scroll {dy} | launch {app} | open {url} | wait {ms} | ask {note} | done {note}',
        `Last screenshot size: ${shot.width}x${shot.height}. Full display is ${shot.screenWidth}x${shot.screenHeight}.`,
        'The screenshot is only the program window, not the whole desktop. Click coordinates are pixels of that window. The program stays off the owner’s screen; they watch it inside Quorum.',
        'Open any installed program with launch, including ChatGPT, Claude, a browser, or another app the owner named. If launch misses, use key win, type the app name, then key enter.',
        'When the owner asked you to use that program, click its input, type the question, and press enter. On the next screenshot, read the answer and return done. The done note is the answer itself, written as a normal reply.',
        'Open a public website with open and the https URL. Wait after opening something.',
        'Never return done because a window is missing. Launch or wait, then continue.',
        'Return done only when the owner’s request is actually finished and, if an app answered, the note contains what was on screen.',
        'Return ask before passwords, payments, deleting files, installing software, or sending email.',
      ].join('\n')
    : [
        `You are ${actor} at ${companyName}, controlling the owner's Windows desktop for one request.`,
        'Reply with ONE JSON object only, no markdown.',
        'Kinds: click {x,y} | type {text} | key {key} | launch {app} | wait {ms} | done {note}',
        `Last screenshot size: ${shot.width}x${shot.height}. Full display is ${shot.screenWidth}x${shot.screenHeight}.`,
        'Prefer launch for apps. Prefer done when the checklist is finished.',
      ].join('\n')
  const userText = [
    `Task: ${title}`,
    `Description: ${detail}`,
    history.length ? `Already done:\n${history.join('\n')}` : 'No steps yet.',
    'The screenshot is what Quorum is showing. If the answer is already on screen, return done and put that answer in note. Otherwise take the next single step.',
  ].join('\n')

  const image =
    shot.framed && shot.image.startsWith('data:image/jpeg') && shot.image.length < 500_000 ? shot.image : ''
  const content: ModelContentPart[] = image
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: image } },
      ]
    : [{ type: 'text', text: userText }]
  const ask = (parts: ModelContentPart[] | string) =>
    withTimeout(
      askModel(link, [
        { role: 'system', content: system },
        { role: 'user', content: parts },
      ]),
      12_000,
    )
  try {
    const raw = await ask(image ? content : userText)
    return parseDesktopAction(raw) ?? stoppedAction(history)
  } catch {
    if (!image) return stoppedAction(history)
    try {
      const raw = await ask(userText)
      return parseDesktopAction(raw) ?? stoppedAction(history)
    } catch {
      return stoppedAction(history)
    }
  }
}

function stoppedAction(history: string[]): ModelAction {
  const did = history.some((line) => /^(Open|Opened|Typed|Submit|Start|Run)/i.test(line))
  return {
    kind: 'done',
    note: did
      ? 'I completed the steps on the program. The model did not return another step, so this is the result of the work already done.'
      : 'The linked model did not return a step, so I stopped before using the PC.',
  }
}

export type DesktopRunResult = {
  text: string
  result: string
  ask?: { reason: string; steps: string[] }
}

/** Run Approved (capped) or Live desktop control for a granted task. */
export async function runDesktopGrant(
  state: AppState,
  person: Staff,
  task: Task,
): Promise<DesktopRunResult> {
  return runDesktopLoop(state, person.name, task.title, task.description, {
    full: state.desktop.mode === 'live',
    prior: [],
  })
}

async function ensureToken(state: AppState): Promise<string | null> {
  const existing = readDesktopToken()
  if (existing) return existing
  if (!state.desktop.sessionActive && !state.desktop.grantedQuorum) return null
  try {
    return await startDesktopServerSession()
  } catch {
    return null
  }
}

async function takeShot(token: string): Promise<{ token: string; shot: Shot }> {
  try {
    return { token, shot: await screenshot(token) }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/not active|token is wrong/i.test(message)) throw error
    if (!readDesktopToken()) throw error
    const next = await startDesktopServerSession()
    await markUsing(true)
    return { token: next, shot: await screenshot(next) }
  }
}

function toScreen(shot: Shot, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: point.x * (shot.screenWidth / Math.max(1, shot.width)),
    y: point.y * (shot.screenHeight / Math.max(1, shot.height)),
  }
}

async function movePointer(token: string, shot: Shot, cursor: { x: number; y: number }, click = false, note?: string): Promise<void> {
  showDesk(shot, { cursor, click, note })
  const point = toScreen(shot, cursor)
  await sendInput(token, { kind: 'move', x: point.x, y: point.y })
}

async function applyStep(
  token: string,
  shot: Shot,
  action: Exclude<ModelAction, { kind: 'ask' } | { kind: 'done' }>,
  cursor: { x: number; y: number },
): Promise<{ token: string; shot: Shot; cursor: { x: number; y: number }; note: string }> {
  if (action.kind === 'wait') {
    await sleep(action.ms)
    return { token, shot, cursor, note: action.note || 'Waited.' }
  }
  if (action.kind === 'click') {
    const next = { x: action.x, y: action.y }
    await movePointer(token, shot, next, false, action.note)
    await sleep(40)
    const point = toScreen(shot, next)
    showDesk(shot, { cursor: next, click: true, note: action.note })
    await sendInput(token, { kind: 'click', x: point.x, y: point.y, button: action.button, clicks: action.clicks })
    return { token, shot, cursor: next, note: action.note || `Clicked ${Math.round(point.x)},${Math.round(point.y)}` }
  }
  if (action.kind === 'type') {
    await sendInput(token, { kind: 'type', text: action.text })
    return { token, shot, cursor, note: action.note || `Typed “${action.text.slice(0, 40)}”` }
  }
  if (action.kind === 'key') {
    await sendInput(token, { kind: 'key', key: action.key })
    return { token, shot, cursor, note: action.note || `Key ${action.key}` }
  }
  if (action.kind === 'scroll') {
    await sendInput(token, { kind: 'scroll', dy: action.dy })
    return { token, shot, cursor, note: action.note || 'Scrolled' }
  }
  if (action.kind === 'launch') {
    await movePointer(token, shot, restCursor(shot), false, action.note)
    await sendInput(token, { kind: 'launch', app: action.app })
    await sleep(120)
    return { token, shot, cursor: restCursor(shot), note: action.note || `Opened ${action.app}` }
  }
  await movePointer(token, shot, restCursor(shot), false, action.note)
  await sendInput(token, { kind: 'open', url: action.url })
  await sleep(200)
  return { token, shot, cursor: restCursor(shot), note: action.note || `Opened ${action.url}` }
}

function finalReport(title: string, history: string[]): string {
  const skip = /^(Looking at the PC|Waited|Wait for|Key |Clicked |That step missed|Could not read|The session ended|The linked model)/i
  const answer = [...history].reverse().find((line) => line.trim() && !skip.test(line.trim()))
  const did = history.filter((line) => /^(Open|Opened|Typed|Submit|Start|Run)/i.test(line)).slice(0, 6)
  return [
    `Done. ${title}.`,
    did.length ? `What I did: ${did.join('; ')}.` : '',
    `Result: ${answer || 'I finished the steps on your PC.'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

let desktopFlight: Promise<DesktopRunResult> | null = null

async function runDesktopLoop(
  state: AppState,
  actor: string,
  title: string,
  detail: string,
  options: { full: boolean; prior: string[] },
): Promise<DesktopRunResult> {
  if (desktopFlight) return desktopFlight
  desktopFlight = (async () => {
    let token = await ensureToken(state)
    if (!token || (!state.desktop.sessionActive && !state.desktop.grantedQuorum)) {
      return {
        text: 'No active desktop session. Allow access and I can try on this computer.',
        result: 'Desktop run skipped — no session token.',
      }
    }
    const cap = options.full ? 80 : state.desktop.mode === 'live' ? 32 : 8
    const history = [...options.prior]
    let misses = 0
    let cursor = { x: 614, y: 302 }
    let shot: Shot = {
      image: '',
      width: 1280,
      height: 720,
      screenWidth: 1280,
      screenHeight: 720,
    }
    showDeskStart()
    await markUsing(true)
    try {
      const grabbed = await takeShot(token)
      token = grabbed.token
      shot = grabbed.shot
      cursor = restCursor(shot, cursor)
      showDesk(shot, { cursor, note: 'Looking at the PC.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Screenshot failed.'
      if (/not active|token is wrong/i.test(message)) {
        return {
          text: 'The desktop session ended before I could take the pointer.',
          result: 'Desktop run skipped — session ended.',
        }
      }
      history.push(`Could not read the screen yet: ${message}`)
    }

    const seeds = seedDesktopActions(detail, history)
    for (const seed of seeds) {
      if (!readDesktopToken()) break
      if (seed.kind === 'ask' || seed.kind === 'done') continue
      try {
        const next = await applyStep(token, shot, seed, cursor)
        token = next.token
        shot = next.shot
        cursor = next.cursor
        history.push(next.note)
        try {
          const grabbed = await takeShot(token)
          token = grabbed.token
          shot = grabbed.shot
          showDesk(shot, { cursor, note: next.note })
        } catch {
          showDesk(shot, { cursor, note: next.note })
        }
        misses = 0
      } catch (error) {
        misses += 1
        const message = error instanceof Error ? error.message : 'Desktop input failed.'
        history.push(`That step missed (${message}). Trying another way.`)
        if (misses >= 6 && !options.full) break
      }
    }

    for (let step = 0; step < cap; step += 1) {
      if (!readDesktopToken()) {
        history.push('The session ended.')
        break
      }
      try {
        const grabbed = await takeShot(token)
        token = grabbed.token
        shot = grabbed.shot
        showDesk(shot, { cursor, note: history.at(-1) })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Screenshot failed.'
        if (/not active|token is wrong/i.test(message)) {
          history.push('The session ended.')
          break
        }
        history.push(`Could not read the screen: ${message}`)
        await sleep(250)
        continue
      }
      const action = await nextAction(
        actor,
        title,
        detail,
        shot,
        history.slice(-24),
        state.company?.name ?? 'the company',
        options.full,
      )
      if (/could not parse a desktop action/i.test(action.note ?? '')) {
        if (action.note) history.push(action.note)
        history.push('I stopped. The model did not return a usable action.')
        break
      }
      if (action.kind === 'ask') {
        return {
          text: `I need your OK before I continue: ${action.note}`,
          result: action.note,
          ask: { reason: action.note, steps: history },
        }
      }
      if (action.kind === 'done') {
        history.push(action.note || 'Done.')
        try {
          const grabbed = await takeShot(token)
          token = grabbed.token
          shot = grabbed.shot
          showDesk(shot, { cursor, note: action.note || 'Done.' })
        } catch {
          showDesk(shot, { cursor, note: action.note || 'Done.' })
        }
        break
      }
      try {
        const next = await applyStep(token, shot, action, cursor)
        token = next.token
        shot = next.shot
        cursor = next.cursor
        history.push(next.note)
        misses = 0
      } catch (error) {
        misses += 1
        const message = error instanceof Error ? error.message : 'Desktop input failed.'
        history.push(`That step missed (${message}). Trying another way.`)
        if (misses >= 6 && !options.full) break
        await sleep(180)
      }
      if (options.full && step === cap - 1) {
        return {
          text: 'I am still on this computer and need your OK to keep going.',
          result: 'Desktop run reached the live step cap.',
          ask: { reason: 'Keep going on this computer until the work is finished.', steps: history },
        }
      }
    }
    const mode = state.desktop.mode === 'live' ? 'Live' : 'Approved'
    const text = finalReport(title, history)
    return {
      text: text.slice(0, 4000),
      result: `${mode} desktop run for ${title} (${history.length} step${history.length === 1 ? '' : 's'}).`,
    }
  })().finally(() => {
    desktopFlight = null
  })
  return desktopFlight as Promise<DesktopRunResult>
}

export async function endDesktopUsing(): Promise<void> {
  await markUsing(false)
}

export async function runQuorumDesktop(
  _state: AppState,
  instruction: string,
  prior: string[] = [],
): Promise<DesktopRunResult> {
  const task = instruction || 'Help on this computer.'
  if (wantsProgram(task)) {
    return runDesktopLoop(_state, 'Quorum', task.slice(0, 120), task, { full: true, prior })
  }
  const { runWindowSession } = await import('./computer-run')
  return runWindowSession(task, prior, _state.company?.name || 'the company')
}
