import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import {
  assertDesktopToken,
  desktopAgentReady,
  desktopHalted,
  DesktopBusyError,
  runLockedPowerShell,
} from './desktop-agent'
import { gateComputerAction, type ComputerAction, type ControlInfo } from '../src/computer/policy'
import { clickNamed, clickTarget, mailFieldPoints, visibleLabels, type OcrWord } from '../src/computer/windows'

export type ComputerWindow = { hwnd: string; processName: string; title: string }

export type ComputerControl = ControlInfo & { x: number; y: number; w: number; h: number }

export type ComputerView = {
  title: string
  processName: string
  image: string
  width: number
  height: number
  controls: ControlInfo[]
  note?: string
}

type Target = { hwnd: string; processName: string; title: string; left: number; top: number; right: number; bottom: number }

let boundToken: string | null = null
let target: Target | null = null
let controls: ComputerControl[] = []

function session(token: string | undefined): string {
  assertDesktopToken(token)
  if (desktopHalted()) throw new DesktopBusyError('Computer access is stopped.')
  if (!desktopAgentReady()) throw new DesktopBusyError('Computer use needs Windows 10 or 11.')
  if (boundToken !== token) {
    boundToken = token ?? null
    target = null
    controls = []
  }
  return token as string
}

function hwndOf(value: string): string {
  if (!/^\d{2,20}$/.test(value)) throw new Error('That window is not available.')
  return value
}

export function parseWindowRows(raw: string): ComputerWindow[] {
  const seen = new Set<string>()
  const windows: ComputerWindow[] = []
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const hwnd = parts[0]?.trim() ?? ''
    const processName = (parts[1] ?? '').trim()
    const title = parts.slice(2).join('\t').trim()
    if (!/^\d{2,20}$/.test(hwnd) || title.length < 2 || seen.has(hwnd)) continue
    const ownApp = /quorum/i.test(title) && /ai staff/i.test(title)
    if (ownApp || /quorumusingcomputer/i.test(title) || /^program manager$/i.test(title)) continue
    seen.add(hwnd)
    windows.push({ hwnd, processName: processName || 'window', title: title.slice(0, 180) })
    if (windows.length >= 24) break
  }
  return windows
}

export function parseControlRows(raw: string): { controls: ComputerControl[]; minimized: boolean } {
  const controls: ComputerControl[] = []
  let minimized = false
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === 'MINIMIZED') minimized = true
    if (!line.startsWith('CONTROL\t')) continue
    const parts = line.split('\t')
    const x = Number(parts[1])
    const y = Number(parts[2])
    const w = Number(parts[3])
    const h = Number(parts[4])
    const role = (parts[5] ?? 'Control').slice(0, 40)
    const name = parts.slice(6).join(' ').trim().slice(0, 160)
    if (!name || !Number.isFinite(x) || w < 2 || h < 2) continue
    controls.push({ id: `c${controls.length}`, name, role, x, y, w, h })
    if (controls.length >= 40) break
  }
  return { controls, minimized }
}

const LIST_SCRIPT = `
if (-not ([System.Management.Automation.PSTypeName]'QuorumWindows').Type) {
Add-Type @"
using System;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class QuorumWindows {
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  public static string List() {
    var rows = new List<string>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(300);
      GetWindowText(h, sb, 300);
      var title = sb.ToString().Trim().Replace(((char)9).ToString(), " ");
      if (title.Length < 2) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      var name = "window";
      try { name = Process.GetProcessById((int)pid).ProcessName; } catch {}
      rows.Add(h.ToInt64().ToString() + ((char)9) + name + ((char)9) + title);
      return rows.Count < 40;
    }, IntPtr.Zero);
    return string.Join(((char)10).ToString(), rows);
  }
}
"@
}
[QuorumWindows]::List()
`

export async function listComputerWindows(token: string | undefined): Promise<ComputerWindow[]> {
  session(token)
  const raw = await runLockedPowerShell(LIST_SCRIPT)
  return parseWindowRows(raw)
}

export async function chooseComputerWindow(token: string | undefined, hwnd: string): Promise<ComputerWindow> {
  session(token)
  const id = hwndOf(hwnd)
  const windows = await listComputerWindows(token)
  const found = windows.find((item) => item.hwnd === id)
  if (!found) throw new Error('That window is no longer open. Choose another.')
  target = { hwnd: found.hwnd, processName: found.processName, title: found.title, left: 0, top: 0, right: 0, bottom: 0 }
  controls = []
  return found
}

export function currentComputerWindow(): ComputerWindow | null {
  if (!target) return null
  return { hwnd: target.hwnd, processName: target.processName, title: target.title }
}

function observeScript(hwnd: string, imagePath: string): string {
  const file = imagePath.replace(/'/g, "''")
  return `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if (-not ([System.Management.Automation.PSTypeName]'QuorumCap').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumCap {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint nFlags);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
}
function Bring-QuorumTarget([IntPtr]$target) {
  $fg = [QuorumCap]::GetForegroundWindow()
  $pidOut = [uint32]0
  $fgThread = [QuorumCap]::GetWindowThreadProcessId($fg, [ref]$pidOut)
  $me = [QuorumCap]::GetCurrentThreadId()
  [QuorumCap]::AttachThreadInput($me, $fgThread, $true) | Out-Null
  [QuorumCap]::ShowWindow($target, 9) | Out-Null
  [QuorumCap]::BringWindowToTop($target) | Out-Null
  [QuorumCap]::keybd_event(18, 0, 0, [UIntPtr]::Zero)
  [QuorumCap]::SetForegroundWindow($target) | Out-Null
  [QuorumCap]::keybd_event(18, 0, 2, [UIntPtr]::Zero)
  [QuorumCap]::AttachThreadInput($me, $fgThread, $false) | Out-Null
}
$hwnd = [IntPtr]${hwnd}
if ([QuorumCap]::IsIconic($hwnd)) { [QuorumCap]::ShowWindow($hwnd, 9) | Out-Null }
$front = [QuorumCap]::GetForegroundWindow()
$rootNow = [QuorumCap]::GetAncestor($front, 2)
if ($rootNow -eq [IntPtr]::Zero) { $rootNow = $front }
if ($front -ne $hwnd -and $rootNow -ne $hwnd) {
  Bring-QuorumTarget $hwnd
  Start-Sleep -Milliseconds 160
  $front = [QuorumCap]::GetForegroundWindow()
  $rootNow = [QuorumCap]::GetAncestor($front, 2)
  if ($rootNow -eq [IntPtr]::Zero) { $rootNow = $front }
  if ($front -ne $hwnd -and $rootNow -ne $hwnd) {
    Bring-QuorumTarget $hwnd
    Start-Sleep -Milliseconds 160
    $front = [QuorumCap]::GetForegroundWindow()
  }
}
$rect = New-Object QuorumCap+RECT
[QuorumCap]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -lt 80 -or $height -lt 80) { Write-Output 'MINIMIZED'; exit 0 }
Write-Output ("RECT\`t" + $rect.Left + "\`t" + $rect.Top + "\`t" + $rect.Right + "\`t" + $rect.Bottom)
$bmp = New-Object System.Drawing.Bitmap $width, $height
$printed = $false
try {
  $pg = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $pg.GetHdc()
  $printed = [QuorumCap]::PrintWindow($hwnd, $hdc, 2)
  $pg.ReleaseHdc($hdc)
  $pg.Dispose()
} catch { $printed = $false }
$dark = 0
if ($printed) {
  for ($i = 0; $i -lt 12; $i++) {
    $px = $bmp.GetPixel( ((8 + $i * 70) % [Math]::Max(1, $width - 1)), ((8 + $i * 40) % [Math]::Max(1, $height - 1)) )
    if ($px.R -lt 12 -and $px.G -lt 12 -and $px.B -lt 12) { $dark++ }
  }
}
$root = [QuorumCap]::GetAncestor($front, 2)
if ($root -eq [IntPtr]::Zero) { $root = $front }
$inFront = ($front -eq $hwnd -or $root -eq $hwnd)
if ((-not $printed -or $dark -ge 10) -and $inFront) {
  $bmp.Dispose()
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
  $g.Dispose()
} elseif (-not $printed -or $dark -ge 10) {
  $bmp.Dispose()
  Write-Output 'NOT_FRONT'
  exit 0
}
$maxW = 1280
$scale = [Math]::Min(1.0, $maxW / [double]$width)
$w = [int][Math]::Round($width * $scale)
$h = [int][Math]::Round($height * $scale)
$dst = New-Object System.Drawing.Bitmap $w, $h
$g2 = [System.Drawing.Graphics]::FromImage($dst)
$g2.DrawImage($bmp, 0, 0, $w, $h)
$dst.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g2.Dispose(); $dst.Dispose(); $bmp.Dispose()
Write-Output ("SHOT\`t" + $w + "\`t" + $h)
try {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $n = 0
  foreach ($el in $all) {
    if ($n -ge 80) { break }
    $role = ([string]$el.Current.ControlType.ProgrammaticName).Replace('ControlType.','')
    $name = ([string]$el.Current.Name).Replace([char]9,' ').Replace([char]13,' ').Replace([char]10,' ').Trim()
    if (-not $name) {
      if ($role -notmatch 'Edit|Document|ComboBox') { continue }
      $name = $role
    }
    $box = $el.Current.BoundingRectangle
    if ($box.Width -lt 2 -or $box.Height -lt 2) { continue }
    Write-Output ("CONTROL\`t" + [int]$box.X + "\`t" + [int]$box.Y + "\`t" + [int]$box.Width + "\`t" + [int]$box.Height + "\`t" + $role + "\`t" + $name)
    $n++
  }
} catch {
  Write-Output 'UIA_EMPTY'
}
`
}

export async function observeComputer(token: string | undefined): Promise<ComputerView> {
  session(token)
  if (!target) throw new Error('Choose a window before Quorum looks at the screen.')
  const imagePath = join(tmpdir(), `quorum-window-${randomBytes(6).toString('hex')}.jpg`)
  try {
    const raw = await runLockedPowerShell(observeScript(target.hwnd, imagePath))
    const parsed = parseControlRows(raw)
    if (parsed.minimized || raw.includes('MINIMIZED')) {
      throw new Error('That window is minimized. Restore it, then look again.')
    }
    if (raw.includes('NOT_FRONT')) {
      throw new Error('That window is still behind another window. Leave it visible and try again.')
    }
    const rect = raw.match(/RECT\t(-?\d+)\t(-?\d+)\t(-?\d+)\t(-?\d+)/)
    if (rect) {
      target = {
        ...target,
        left: Number(rect[1]),
        top: Number(rect[2]),
        right: Number(rect[3]),
        bottom: Number(rect[4]),
      }
    }
    const shot = raw.match(/SHOT\t(\d+)\t(\d+)/)
    const bytes = await readFile(imagePath)
    controls = parsed.controls.filter((control) => inside(control, target))
    return {
      title: target.title,
      processName: target.processName,
      image: `data:image/jpeg;base64,${bytes.toString('base64')}`,
      width: shot ? Number(shot[1]) : 0,
      height: shot ? Number(shot[2]) : 0,
      controls: controls.map(({ id, name, role }) => ({ id, name, role })),
    }
  } finally {
    await unlink(imagePath).catch(() => undefined)
  }
}

function inside(control: ComputerControl, frame: Target | null): boolean {
  if (!frame || frame.right <= frame.left) return true
  const cx = control.x + control.w / 2
  const cy = control.y + control.h / 2
  return cx >= frame.left && cx <= frame.right && cy >= frame.top && cy <= frame.bottom
}

function focusScript(hwnd: string): string {
  return `
if (-not ([System.Management.Automation.PSTypeName]'QuorumFocus').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
}
"@
}
$target = [IntPtr]${hwnd}
$fg = [QuorumFocus]::GetForegroundWindow()
$pidOut = [uint32]0
$fgThread = [QuorumFocus]::GetWindowThreadProcessId($fg, [ref]$pidOut)
$me = [QuorumFocus]::GetCurrentThreadId()
[QuorumFocus]::AttachThreadInput($me, $fgThread, $true) | Out-Null
[QuorumFocus]::ShowWindow($target, 9) | Out-Null
[QuorumFocus]::BringWindowToTop($target) | Out-Null
[QuorumFocus]::keybd_event(18, 0, 0, [UIntPtr]::Zero)
[QuorumFocus]::SetForegroundWindow($target) | Out-Null
[QuorumFocus]::keybd_event(18, 0, 2, [UIntPtr]::Zero)
[QuorumFocus]::AttachThreadInput($me, $fgThread, $false) | Out-Null
Start-Sleep -Milliseconds 70
`
}

function clickScript(hwnd: string, x: number, y: number): string {
  return `
${focusScript(hwnd)}
if (-not ([System.Management.Automation.PSTypeName]'QuorumClick').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumClick {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
}
[QuorumClick]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
Start-Sleep -Milliseconds 40
[QuorumClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[QuorumClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`
}

function typeScript(hwnd: string, text: string): string {
  const safe = text.replace(/[+^%~(){}]/g, '{$&}').replace(/\r?\n/g, '{ENTER}').replace(/'/g, "''").slice(0, 1500)
  return `
${focusScript(hwnd)}
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 80
[System.Windows.Forms.SendKeys]::SendWait('${safe}')
`
}

function keyScript(hwnd: string, key: string): string {
  const send: Record<string, string> = {
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
    f5: '{F5}',
  }
  if (send[key]) {
    return `
${focusScript(hwnd)}
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 60
[System.Windows.Forms.SendKeys]::SendWait('${send[key]}')
`
  }
  if (/^[a-z0-9]$/.test(key)) {
    return `
${focusScript(hwnd)}
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 60
[System.Windows.Forms.SendKeys]::SendWait('${key}')
`
  }
  const chord = key === 'ctrl+l' ? ['0x11', '0x4C'] : key === 'ctrl+t' ? ['0x11', '0x54'] : key === 'alt+left' ? ['0x12', '0x25'] : key === 'alt+right' ? ['0x12', '0x27'] : null
  if (!chord) {
    return `
${focusScript(hwnd)}
Write-Output 'KEY_SKIPPED'
`
  }
  return `
${focusScript(hwnd)}
if (-not ([System.Management.Automation.PSTypeName]'QuorumChord').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumChord {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
}
[QuorumChord]::keybd_event(${chord[0]}, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[QuorumChord]::keybd_event(${chord[1]}, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[QuorumChord]::keybd_event(${chord[1]}, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 20
[QuorumChord]::keybd_event(${chord[0]}, 0, 2, [UIntPtr]::Zero)
`
}

function scrollScript(hwnd: string, dy: number): string {
  const amount = Math.max(-600, Math.min(600, Math.round(dy)))
  const x = target ? Math.round((target.left + target.right) / 2) : 400
  const y = target ? Math.round((target.top + target.bottom) / 2) : 300
  return `
${focusScript(hwnd)}
if (-not ([System.Management.Automation.PSTypeName]'QuorumWheel').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumWheel {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
}
[QuorumWheel]::SetCursorPos(${x}, ${y}) | Out-Null
[QuorumWheel]::mouse_event(0x0800, 0, 0, ${amount}, [UIntPtr]::Zero)
`
}

export type ComputerActResult =
  | { ok: true; note: string }
  | { ok: false; needsApproval: true; reason: string }
  | { ok: false; handoff: true; reason: string }

export async function actOnComputer(
  token: string | undefined,
  action: ComputerAction,
  approved = false,
  approvedStake = false,
): Promise<ComputerActResult> {
  session(token)
  if (!target) throw new Error('Choose a window before Quorum uses the computer.')
  const control = action.kind === 'click' || (action.kind === 'type' && action.controlId)
    ? controls.find((item) => item.id === ('controlId' in action ? action.controlId : ''))
    : undefined
  if ((action.kind === 'click' || (action.kind === 'type' && action.controlId)) && !control) {
    throw new Error('That control is not in the current view. Look at the window again.')
  }
  const gate = gateComputerAction(action, {
    processName: target.processName,
    control: control ? { id: control.id, name: control.name, role: control.role } : undefined,
    approvedStake,
  })
  if (gate.gate === 'deny') throw new Error(gate.reason)
  if (gate.gate === 'handoff') return { ok: false, handoff: true, reason: gate.reason }
  if (gate.gate === 'approve' && !approved) return { ok: false, needsApproval: true, reason: gate.reason }
  if (action.kind === 'wait') {
    await new Promise((resolve) => setTimeout(resolve, action.ms))
    return { ok: true, note: gate.reason }
  }
  if (action.kind === 'click' && control) {
    if (!inside(control, target)) throw new Error('That control is outside the chosen window.')
    await runLockedPowerShell(clickScript(target.hwnd, control.x + control.w / 2, control.y + control.h / 2))
    return { ok: true, note: gate.reason }
  }
  if (action.kind === 'type') {
    if (control) await runLockedPowerShell(clickScript(target.hwnd, control.x + control.w / 2, control.y + control.h / 2))
    await runLockedPowerShell(typeScript(target.hwnd, action.text))
    return { ok: true, note: gate.reason }
  }
  if (action.kind === 'key') {
    await runLockedPowerShell(keyScript(target.hwnd, action.key.trim().toLowerCase()))
    return { ok: true, note: gate.reason }
  }
  await runLockedPowerShell(scrollScript(target.hwnd, action.dy))
  return { ok: true, note: gate.reason }
}

function sendKeysLiteral(text: string): string {
  return text.replace(/[+^%~(){}]/g, '{$&}').replace(/\r?\n/g, '{ENTER}').replace(/'/g, "''").slice(0, 1200)
}

function readLabelsScript(hwnd: string, file: string): string {
  const image = file.replace(/'/g, "''")
  return `
${focusScript(hwnd)}
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
if (-not ([System.Management.Automation.PSTypeName]'QuorumRect').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumRect {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
}
$hwnd = [IntPtr]${hwnd}
$rect = New-Object QuorumRect+RECT
[QuorumRect]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -lt 80 -or $height -lt 80) { Write-Output 'MINIMIZED'; exit 0 }
Write-Output ("RECT\`t" + $rect.Left + "\`t" + $rect.Top + "\`t" + $rect.Right + "\`t" + $rect.Bottom)
$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $width, $height))
$g.Dispose()
$bmp.Save('${image}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await-WinRt($op, $type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType = WindowsRuntime]
$file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync('${image}')) ([Windows.Storage.StorageFile])
$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
foreach ($line in $result.Lines) {
  foreach ($word in $line.Words) {
    $r = $word.BoundingRect
    $text = ([string]$word.Text).Replace([char]9, ' ').Replace([char]13, ' ').Replace([char]10, ' ')
    Write-Output ("WORD\`t" + [int]$r.X + "\`t" + [int]$r.Y + "\`t" + [int]$r.Width + "\`t" + [int]$r.Height + "\`t" + $text)
  }
}
`
}

function parseLabelWords(raw: string): { words: OcrWord[]; origin: { left: number; top: number } } {
  const words: OcrWord[] = []
  let origin = { left: 0, top: 0 }
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts[0] === 'RECT') origin = { left: Number(parts[1]) || 0, top: Number(parts[2]) || 0 }
    if (parts[0] !== 'WORD') continue
    const text = parts.slice(5).join(' ').trim()
    if (!text) continue
    words.push({ text, x: Number(parts[1]), y: Number(parts[2]), w: Number(parts[3]), h: Number(parts[4]) })
  }
  return { words, origin }
}

function typeFieldsScript(
  hwnd: string,
  points: { to: { x: number; y: number }; subject: { x: number; y: number }; body: { x: number; y: number } },
  draft: { to: string; subject: string; body: string },
): string {
  const to = sendKeysLiteral(draft.to)
  const subject = sendKeysLiteral(draft.subject)
  const body = sendKeysLiteral(draft.body)
  return `
${focusScript(hwnd)}
if (-not ([System.Management.Automation.PSTypeName]'QuorumClick').Type) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumClick {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
}
Add-Type -AssemblyName System.Windows.Forms
function Release-QuorumModifiers {
  [QuorumClick]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
  [QuorumClick]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero)
}
function Click-QuorumField([int]$x, [int]$y) {
  [QuorumClick]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 40
  [QuorumClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [QuorumClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  Release-QuorumModifiers
}
${to ? `Click-QuorumField ${points.to.x} ${points.to.y}\n[System.Windows.Forms.SendKeys]::SendWait('${to},')\nStart-Sleep -Milliseconds 80` : ''}
Click-QuorumField ${points.subject.x} ${points.subject.y}
[System.Windows.Forms.SendKeys]::SendWait('${subject}')
Start-Sleep -Milliseconds 50
Click-QuorumField ${points.body.x} ${points.body.y}
[System.Windows.Forms.SendKeys]::SendWait('${body}')
`
}

async function readWindowWords(token: string | undefined): Promise<{ words: OcrWord[]; origin: { left: number; top: number } }> {
  session(token)
  if (!target) throw new Error('Choose a window before Quorum looks at the screen.')
  const imagePath = join(tmpdir(), `quorum-labels-${randomBytes(4).toString('hex')}.png`)
  try {
    const raw = await runLockedPowerShell(readLabelsScript(target.hwnd, imagePath))
    if (raw.includes('MINIMIZED')) throw new Error('That window is minimized. Restore it, then try again.')
    return parseLabelWords(raw)
  } finally {
    await unlink(imagePath).catch(() => undefined)
  }
}

/** Click a visible word the instruction needs, such as Compose. Does not click Send or payment. */
export async function clickForInstruction(
  token: string | undefined,
  instruction: string,
  options?: { label?: string; dryRun?: boolean },
): Promise<{ clicked: string | null; saw: string[] }> {
  const { words, origin } = await readWindowWords(token)
  const saw = visibleLabels(words)
  if (options?.dryRun || !target) return { clicked: null, saw }
  const requested = options?.label?.trim()
  const hit = requested ? clickNamed(requested, words) : clickTarget(instruction, words)
  if (!hit) return { clicked: null, saw }
  const x = Math.round(origin.left + hit.x + hit.w / 2)
  const y = Math.round(origin.top + hit.y + hit.h / 2)
  await runLockedPowerShell(clickScript(target.hwnd, x, y))
  return { clicked: hit.text, saw }
}

/** Type the owner's message into the open compose window. Does not send. */
export async function writeCompose(
  token: string | undefined,
  draft: { to: string; subject: string; body: string },
): Promise<{ ok: true; note: string }> {
  session(token)
  if (!target) throw new Error('Choose a window before Quorum writes.')
  const to = draft.to.trim().slice(0, 200)
  const subject = draft.subject.trim().slice(0, 120)
  const body = draft.body.trim().slice(0, 1200)
  if (!to && !subject && !body) throw new Error('There is nothing to type.')
  const gate = gateComputerAction({ kind: 'type', text: `${to}\n${subject}\n${body}` }, { processName: target.processName })
  if (gate.gate !== 'allow') throw new Error(gate.reason)
  const { words, origin } = await readWindowWords(token)
  const points = mailFieldPoints(words, origin)
  if (!points) throw new Error('The To and Subject lines are not visible. Leave the compose window fully open, then try again.')
  await runLockedPowerShell(typeFieldsScript(target.hwnd, points, { to, subject, body }))
  return { ok: true, note: 'Filled To, then Subject, then the message. Nothing was sent.' }
}
