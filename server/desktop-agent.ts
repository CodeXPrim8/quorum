import { randomBytes } from 'node:crypto'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { publicWebsite } from './company-site'

const execFileAsync = promisify(execFile)

export type DesktopInput =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'click'; x: number; y: number; button?: 'left' | 'right'; clicks?: 1 | 2 }
  | { kind: 'type'; text: string }
  | { kind: 'key'; key: string }
  | { kind: 'scroll'; dy: number }
  | { kind: 'launch'; app: string }
  | { kind: 'open'; url: string }

let sessionToken: string | null = null
let chain = Promise.resolve()
let overlay: ChildProcess | null = null
let halted = false

function withDesktopLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function desktopAgentReady(): boolean {
  return process.platform === 'win32'
}

export function desktopSessionActive(): boolean {
  return Boolean(sessionToken)
}

export function desktopHalted(): boolean {
  return halted
}

export function startDesktopSession(): { token: string } {
  halted = false
  sessionToken = randomBytes(24).toString('hex')
  return { token: sessionToken }
}

export function endDesktopSession(): void {
  halted = true
  sessionToken = null
  hideUsingOverlay()
}

const OVERLAY_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumOverlayWin {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
  public static void ClickThrough(IntPtr hwnd) {
    int ex = GetWindowLong(hwnd, -20);
    SetWindowLong(hwnd, -20, ex | 0x80 | 0x20 | 0x80000);
  }
}
"@
$form = New-Object System.Windows.Forms.Form
$form.Text = 'QuorumUsingComputer'
$form.FormBorderStyle = 'None'
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.StartPosition = 'Manual'
$form.Size = New-Object System.Drawing.Size 440, 48
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point ([int](($wa.Width - 440) / 2)), 18
$form.BackColor = [System.Drawing.Color]::FromArgb(28, 30, 39)
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Quorum is using your Computer'
$label.ForeColor = [System.Drawing.Color]::White
$label.Dock = 'Fill'
$label.TextAlign = 'MiddleCenter'
$label.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($label)
$form.Add_Shown({ [QuorumOverlayWin]::ClickThrough($form.Handle); $form.TopMost = $true })
[System.Windows.Forms.Application]::Run($form)
`

export async function showUsingOverlay(token: string | undefined): Promise<void> {
  assertDesktopToken(token)
  if (!desktopAgentReady()) return
  hideUsingOverlay()
  const path = join(tmpdir(), 'quorum-using.ps1')
  await writeFile(path, OVERLAY_SCRIPT, 'utf8')
  overlay = spawn(
    'powershell.exe',
    ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', path],
    { windowsHide: true, stdio: 'ignore' },
  )
  overlay.unref()
}

export function hideUsingOverlay(): void {
  if (!overlay) return
  try {
    overlay.kill()
  } catch {
    // The banner is gone if the process already exited.
  }
  overlay = null
}

export function assertDesktopToken(token: string | undefined): void {
  if (!sessionToken || !token || token !== sessionToken) {
    throw new DesktopAuthError('Desktop session is not active or the token is wrong.')
  }
}

export class DesktopAuthError extends Error {
  status = 403
}

export class DesktopBusyError extends Error {
  status = 503
}

function escapePsSingle(value: string): string {
  return value.replace(/'/g, "''")
}

async function runPowerShell(script: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 12 * 1024 * 1024, timeout: 30_000 },
  )
  const err = String(stderr || '').trim()
  if (err && !stdout) throw new Error(err.slice(0, 200))
  return String(stdout || '').trim()
}

export async function captureScreenshot(
  token: string | undefined,
): Promise<{ image: string; width: number; height: number; screenWidth: number; screenHeight: number }> {
  return withDesktopLock(() => takeScreenshot(token))
}

async function takeScreenshot(
  token: string | undefined,
): Promise<{ image: string; width: number; height: number; screenWidth: number; screenHeight: number }> {
  assertDesktopToken(token)
  if (!desktopAgentReady()) throw new DesktopBusyError('Desktop control is only available on Windows in this build.')
  const path = join(tmpdir(), `quorum-desk-${randomBytes(8).toString('hex')}.jpg`)
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$src = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($src)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$maxW = 1280
$scale = [Math]::Min(1.0, $maxW / [double]$bounds.Width)
$w = [int][Math]::Round($bounds.Width * $scale)
$h = [int][Math]::Round($bounds.Height * $scale)
$dst = New-Object System.Drawing.Bitmap $w, $h
$g2 = [System.Drawing.Graphics]::FromImage($dst)
$g2.DrawImage($src, 0, 0, $w, $h)
$dst.Save('${escapePsSingle(path)}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g2.Dispose(); $dst.Dispose(); $g.Dispose(); $src.Dispose()
Write-Output ($bounds.Width.ToString() + 'x' + $bounds.Height.ToString() + '|' + $w.ToString() + 'x' + $h.ToString())
`
  try {
    const size = await runPowerShell(script)
    const match = size.match(/(\d+)x(\d+)\|(\d+)x(\d+)/)
    const screenWidth = match ? Number(match[1]) : 0
    const screenHeight = match ? Number(match[2]) : 0
    const width = match ? Number(match[3]) : 0
    const height = match ? Number(match[4]) : 0
    const bytes = await readFile(path)
    return {
      image: `data:image/jpeg;base64,${bytes.toString('base64')}`,
      width,
      height,
      screenWidth,
      screenHeight,
    }
  } finally {
    await unlink(path).catch(() => undefined)
  }
}

function mouseScript(x: number, y: number, click: 'none' | 'left' | 'right', clicks = 1): string {
  const downUp =
    click === 'none'
      ? ''
      : click === 'left'
        ? '[QuorumUser32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30; [QuorumUser32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)'
        : '[QuorumUser32]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 30; [QuorumUser32]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)'
  const extra = click !== 'none' && clicks === 2 ? `; Start-Sleep -Milliseconds 50; ${downUp}` : ''
  return `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumUser32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[QuorumUser32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
${downUp}${extra}
`
}

const KEY_MAP: Record<string, string> = {
  enter: '{ENTER}',
  return: '{ENTER}',
  tab: '{TAB}',
  escape: '{ESC}',
  esc: '{ESC}',
  backspace: '{BACKSPACE}',
  delete: '{DELETE}',
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
  home: '{HOME}',
  end: '{END}',
  space: ' ',
}

const VK: Record<string, number> = {
  win: 0x5b,
  windows: 0x5b,
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  shift: 0x10,
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  escape: 0x1b,
  esc: 0x1b,
  space: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  home: 0x24,
  end: 0x23,
  f4: 0x73,
  f5: 0x74,
  f11: 0x7a,
}

function vkFor(part: string): number | null {
  const key = part.trim().toLowerCase()
  if (VK[key] != null) return VK[key]
  if (key.length === 1) {
    const code = key.toUpperCase().charCodeAt(0)
    if ((code >= 65 && code <= 90) || (code >= 48 && code <= 57)) return code
  }
  return null
}

function hotkeyScript(raw: string): string {
  const parts = raw
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) throw new Error('That key is not supported.')
  const codes = parts.map((part) => {
    const vk = vkFor(part)
    if (vk == null) throw new Error('That key is not supported.')
    return vk
  })
  const downs = codes.map((vk) => `[QuorumKeys]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 25`).join('\n')
  const ups = [...codes]
    .reverse()
    .map((vk) => `[QuorumKeys]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 20`)
    .join('\n')
  return `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
${downs}
${ups}
`
}

const APP_ALIASES: Record<string, string> = {
  notepad: 'notepad.exe',
  note: 'notepad.exe',
  'note pad': 'notepad.exe',
  calc: 'calc.exe',
  calculator: 'calc.exe',
  paint: 'mspaint.exe',
  mspaint: 'mspaint.exe',
  wordpad: 'wordpad.exe',
  explorer: 'explorer.exe',
  files: 'explorer.exe',
  cmd: 'cmd.exe',
  powershell: 'powershell.exe',
  terminal: 'wt.exe',
  edge: 'msedge.exe',
  msedge: 'msedge.exe',
  chrome: 'chrome.exe',
  firefox: 'firefox.exe',
  code: 'code.exe',
  vscode: 'code.exe',
  cursor: 'Cursor.exe',
  excel: 'excel.exe',
  word: 'winword.exe',
  winword: 'winword.exe',
  powerpoint: 'powerpnt.exe',
  taskmgr: 'taskmgr.exe',
  snipping: 'snippingtool.exe',
  snippingtool: 'snippingtool.exe',
  control: 'control.exe',
}

const DENY_APP =
  /^(format|diskpart|reg|regedit|shutdown|rundll32|mshta|wscript|cscript|bitsadmin|certutil|msiexec|mmc|cmdlet)$/i

export function resolveDesktopApp(raw: string): string | null {
  const name = raw.replace(/['"]/g, '').trim().toLowerCase().replace(/\.exe$/, '')
  if (!name) return null
  const aliased = APP_ALIASES[name.replace(/\s+/g, ' ')]
  if (aliased) return aliased
  if (DENY_APP.test(name)) return null
  if (!/^[a-z][\w.-]{0,48}$/i.test(name)) return null
  if (name.includes('..') || name.includes('\\') || name.includes('/')) return null
  return `${name}.exe`
}

function needsHotkey(key: string): boolean {
  const raw = key.trim().toLowerCase()
  return raw.includes('+') || raw === 'win' || raw === 'windows'
}

export async function applyDesktopInput(token: string | undefined, input: DesktopInput): Promise<void> {
  return withDesktopLock(() => runDesktopInput(token, input))
}

export async function runLockedPowerShell(script: string): Promise<string> {
  if (halted) throw new DesktopBusyError('Computer access is stopped.')
  return withDesktopLock(async () => {
    if (halted) throw new DesktopBusyError('Computer access is stopped.')
    return runPowerShell(script)
  })
}

async function runDesktopInput(token: string | undefined, input: DesktopInput): Promise<void> {
  if (halted) throw new DesktopBusyError('Computer access is stopped.')
  assertDesktopToken(token)
  if (!desktopAgentReady()) throw new DesktopBusyError('Desktop control is only available on Windows in this build.')
  if (input.kind === 'move') {
    await runPowerShell(mouseScript(input.x, input.y, 'none'))
    return
  }
  if (input.kind === 'click') {
    await runPowerShell(mouseScript(input.x, input.y, input.button === 'right' ? 'right' : 'left', input.clicks === 2 ? 2 : 1))
    return
  }
  if (input.kind === 'scroll') {
    const dy = Math.max(-2400, Math.min(2400, Math.round(input.dy)))
    const wheel = dy >>> 0
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumUser32 {
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[QuorumUser32]::mouse_event(0x0800, 0, 0, ${wheel}, [UIntPtr]::Zero)
`
    await runPowerShell(script)
    return
  }
  if (input.kind === 'type') {
    const text = String(input.text ?? '').slice(0, 2000)
    const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escapePsSingle(text.replace(/[+^%~(){}]/g, '{$&}'))}')
`
    await runPowerShell(script)
    return
  }
  if (input.kind === 'key') {
    const raw = String(input.key ?? '').trim().toLowerCase()
    if (needsHotkey(raw)) {
      await runPowerShell(hotkeyScript(raw))
      return
    }
    const send = KEY_MAP[raw] ?? (raw.length === 1 ? raw : '')
    if (!send) throw new Error('That key is not supported.')
    const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escapePsSingle(send)}')
`
    await runPowerShell(script)
    return
  }
  if (input.kind === 'launch') {
    const app = resolveDesktopApp(input.app)
    if (!app) throw new Error('That app cannot be launched.')
    await runPowerShell(`Start-Process -FilePath '${escapePsSingle(app)}'`)
    return
  }
  if (input.kind === 'open') {
    const url = publicWebsite(input.url)
    if (!url) throw new Error('That address is not a public page.')
    await runPowerShell(`Start-Process '${escapePsSingle(url.toString())}'`)
  }
}

export function parseDesktopInput(body: unknown): DesktopInput {
  const raw = body as {
    kind?: string
    x?: number
    y?: number
    button?: string
    text?: string
    key?: string
    dy?: number
    app?: string
    url?: string
    clicks?: number
    double?: boolean
  }
  const kind = String(raw.kind ?? '')
  if (kind === 'move' || kind === 'click' || kind === 'double') {
    const x = Number(raw.x)
    const y = Number(raw.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Click and move need x and y.')
    if (kind === 'move') return { kind: 'move', x, y }
    const clicks: 1 | 2 = kind === 'double' || raw.clicks === 2 || raw.double ? 2 : 1
    return { kind: 'click', x, y, button: raw.button === 'right' ? 'right' : 'left', clicks }
  }
  if (kind === 'type') return { kind: 'type', text: String(raw.text ?? '') }
  if (kind === 'key') return { kind: 'key', key: String(raw.key ?? '') }
  if (kind === 'scroll') {
    const dy = Number(raw.dy)
    if (!Number.isFinite(dy)) throw new Error('Scroll needs dy.')
    return { kind: 'scroll', dy }
  }
  if (kind === 'launch') return { kind: 'launch', app: String(raw.app ?? '') }
  if (kind === 'open') return { kind: 'open', url: String(raw.url ?? '') }
  throw new Error('Input kind must be move, click, type, key, scroll, launch, or open.')
}
