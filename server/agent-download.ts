/** A double-click Windows launcher with the pairing secret already inside. */
export function quorumDesktopCommand(code: string, gateway: string): string {
  const pair = code.trim().toUpperCase()
  const socket = gateway.trim()
  if (!/^[A-Z2-9]{6}$/.test(pair)) throw new Error('Pairing code is not valid.')
  if (!/^wss?:\/\/[^'"\s]+$/i.test(socket)) throw new Error('Gateway address is not valid.')
  const script = desktopScript(pair, socket)
  return `@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Join-Path $env:TEMP 'QuorumDesktop.ps1'; Get-Content -LiteralPath '%~f0' | Select-Object -Skip 4 | Set-Content -LiteralPath $p -Encoding UTF8; powershell -NoProfile -ExecutionPolicy Bypass -File $p"
exit /b
REM QUORUM-DESKTOP
${script}`
}

function desktopScript(code: string, gateway: string): string {
  return `
$ErrorActionPreference = 'Stop'
$PairCode = '${code}'
$Gateway = '${gateway}'
$DeviceId = ''
$Active = $false
$script:Work = [IntPtr]::Zero
$script:Home = [IntPtr]::Zero
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class QuorumMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
public class QuorumDesk {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll", EntryPoint="GetWindowLong")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="SetWindowLong")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hWnd, ref POINT pt);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public struct POINT { public int X; public int Y; }
  public static void Park(IntPtr hwnd) {
    if (hwnd == IntPtr.Zero) return;
    RECT rect;
    GetWindowRect(hwnd, out rect);
    int w = rect.Right - rect.Left;
    int h = rect.Bottom - rect.Top;
    if (w < 1000) w = 1200;
    if (h < 680) h = 760;
    if (w > 1400) w = 1280;
    if (h > 960) h = 800;
    int vx = GetSystemMetrics(76);
    int vy = GetSystemMetrics(77);
    int ex = GetWindowLong(hwnd, -20);
    SetWindowLong(hwnd, -20, ex | 0x00000080 | 0x08000000);
    SetWindowPos(hwnd, new IntPtr(1), vx - w - 48, vy + 8, w, h, 0x0010 | 0x0040);
  }
  public static void QuietFocus(IntPtr hwnd) {
    if (hwnd == IntPtr.Zero) return;
    Park(hwnd);
    IntPtr fore = GetForegroundWindow();
    uint foreThread = GetWindowThreadProcessId(fore, IntPtr.Zero);
    uint target = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
    uint cur = GetCurrentThreadId();
    AttachThreadInput(cur, foreThread, true);
    AttachThreadInput(cur, target, true);
    SetForegroundWindow(hwnd);
    AttachThreadInput(cur, target, false);
    AttachThreadInput(cur, foreThread, false);
    Park(hwnd);
  }
  public static void Click(IntPtr hwnd, int x, int y, bool right, int times) {
    if (hwnd == IntPtr.Zero) return;
    Park(hwnd);
    RECT rect;
    GetWindowRect(hwnd, out rect);
    POINT p = new POINT();
    p.X = rect.Left + x;
    p.Y = rect.Top + y;
    ScreenToClient(hwnd, ref p);
    if (p.X < 0) p.X = 0;
    if (p.Y < 0) p.Y = 0;
    uint down = right ? 0x0204u : 0x0201u;
    uint up = right ? 0x0205u : 0x0202u;
    IntPtr lp = new IntPtr((p.Y << 16) | (p.X & 0xFFFF));
    int n = times < 1 ? 1 : times;
    for (int i = 0; i < n; i++) {
      PostMessage(hwnd, down, new IntPtr(1), lp);
      PostMessage(hwnd, up, IntPtr.Zero, lp);
    }
  }
}
"@

function Send-Text($ws, $text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $ws.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
}
function Receive-Text($ws) {
  $buffer = New-Object byte[] 262144
  $stream = New-Object IO.MemoryStream
  do {
    $result = $ws.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { return $null }
    $stream.Write($buffer, 0, $result.Count)
  } while (-not $result.EndOfMessage)
  return [Text.Encoding]::UTF8.GetString($stream.ToArray())
}
function Use-Work([scriptblock]$Action) {
  if ($script:Work -eq [IntPtr]::Zero) { & $Action; return }
  [QuorumDesk]::QuietFocus($script:Work)
  & $Action
  if ($script:Home -ne [IntPtr]::Zero) { [QuorumDesk]::SetForegroundWindow($script:Home) | Out-Null }
  [QuorumDesk]::Park($script:Work)
}
function Shot {
  $src = $null
  $realW = 0
  $realH = 0
  if ($script:Work -ne [IntPtr]::Zero) {
    [QuorumDesk]::Park($script:Work)
    Start-Sleep -Milliseconds 90
    $rect = New-Object 'QuorumDesk+RECT'
    [QuorumDesk]::GetWindowRect($script:Work, [ref]$rect) | Out-Null
    $bw = $rect.Right - $rect.Left
    $bh = $rect.Bottom - $rect.Top
    if ($bw -ge 80 -and $bh -ge 80) {
      $src = New-Object Drawing.Bitmap $bw, $bh
      $g = [Drawing.Graphics]::FromImage($src)
      $hdc = $g.GetHdc()
      $ok = [QuorumDesk]::PrintWindow($script:Work, $hdc, 2)
      $g.ReleaseHdc($hdc)
      $g.Dispose()
      if ($ok) { $realW = $bw; $realH = $bh } else { $src.Dispose(); $src = $null }
    }
  }
  if (-not $src) {
    return @{ image = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; width = 8; height = 8; screenWidth = 8; screenHeight = 8; framed = $false }
  }
  $maxW = 1280
  $scale = [Math]::Min(1.0, $maxW / [double]$realW)
  $w = [int][Math]::Round($realW * $scale)
  $h = [int][Math]::Round($realH * $scale)
  $dst = New-Object Drawing.Bitmap $w, $h
  $g2 = [Drawing.Graphics]::FromImage($dst)
  $g2.DrawImage($src, 0, 0, $w, $h)
  $ms = New-Object IO.MemoryStream
  $dst.Save($ms, [Drawing.Imaging.ImageFormat]::Jpeg)
  $b64 = [Convert]::ToBase64String($ms.ToArray())
  $g2.Dispose(); $dst.Dispose(); $src.Dispose(); $ms.Dispose()
  return @{ image = "data:image/jpeg;base64,$b64"; width = $w; height = $h; screenWidth = $realW; screenHeight = $realH; framed = $true }
}
function Move-Click($x, $y, $button, $clicks) {
  if ($script:Work -ne [IntPtr]::Zero) {
    if (-not $button) { return }
    $right = $button -eq 'right'
    [QuorumDesk]::Click($script:Work, [int]$x, [int]$y, $right, [int]$clicks)
    return
  }
  [QuorumMouse]::SetCursorPos([int]$x, [int]$y) | Out-Null
  if (-not $button) { return }
  $down = $(if ($button -eq 'right') { 0x0008 } else { 0x0002 })
  $up = $(if ($button -eq 'right') { 0x0010 } else { 0x0004 })
  for ($i = 0; $i -lt $clicks; $i++) {
    [QuorumMouse]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 30
    [QuorumMouse]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
  }
}
function Invoke-Op($op, $body) {
  if ($op -eq 'session_start') { $script:Active = $true; return @{ ok = $true; active = $true } }
  if ($op -eq 'session_end' -or $op -eq 'stop') { $script:Active = $false; $script:Work = [IntPtr]::Zero; $script:Home = [IntPtr]::Zero; return @{ ok = $true; active = $false } }
  if (-not $script:Active) { throw 'Allow computer use on the Quorum website first.' }
  if ($op -eq 'using') { return @{ ok = $true } }
  if ($op -eq 'screenshot' -or $op -eq 'observe') {
    $shot = Shot
    if ($op -eq 'observe') { return @{ title = 'Desktop'; processName = 'windows'; image = $shot.image; width = $shot.width; height = $shot.height; controls = @() } }
    return $shot
  }
  if ($op -eq 'windows') { return @{ windows = @(@{ hwnd = '1'; processName = 'windows'; title = 'Desktop' }) } }
  if ($op -eq 'target') { return @{ window = @{ hwnd = '1'; processName = 'windows'; title = 'Desktop' } } }
  if ($op -eq 'input') {
    $kind = [string]$body.kind
    if ($kind -eq 'move') { Use-Work { Move-Click $body.x $body.y $null 0 } }
    elseif ($kind -eq 'click' -or $kind -eq 'double') {
      $n = 1; if ($kind -eq 'double' -or $body.clicks -eq 2) { $n = 2 }
      $btn = 'left'; if ($body.button -eq 'right') { $btn = 'right' }
      Use-Work { Move-Click $body.x $body.y $btn $n }
    }
    elseif ($kind -eq 'type') { Use-Work { [Windows.Forms.SendKeys]::SendWait([string]$body.text) } }
    elseif ($kind -eq 'key') {
      $send = [string]$body.key
      $named = @{ enter = '{ENTER}'; return = '{ENTER}'; tab = '{TAB}'; escape = '{ESC}'; esc = '{ESC}'; backspace = '{BACKSPACE}'; delete = '{DELETE}'; up = '{UP}'; down = '{DOWN}'; left = '{LEFT}'; right = '{RIGHT}' }
      if ($named.ContainsKey($send)) { $send = $named[$send] }
      $script:PendingKey = $send
      Use-Work { [Windows.Forms.SendKeys]::SendWait($script:PendingKey) }
    }
    elseif ($kind -eq 'scroll') { [QuorumMouse]::mouse_event(0x0800, 0, 0, [uint32]([int]$body.dy), [UIntPtr]::Zero) }
    elseif ($kind -eq 'launch') {
      $wanted = [string]$body.app
      $script:Home = [QuorumDesk]::GetForegroundWindow()
      $hit = Get-StartApps | Where-Object { $_.Name -eq $wanted -or ($_.Name -replace '\\s','') -like ('*' + ($wanted -replace '\\s','') + '*') } | Select-Object -First 1
      if ($hit) { Start-Process ('shell:AppsFolder\\' + $hit.AppID) -WindowStyle Minimized } else { Start-Process $wanted -WindowStyle Minimized }
      $found = [IntPtr]::Zero
      for ($i = 0; $i -lt 8 -and $found -eq [IntPtr]::Zero; $i++) {
        Start-Sleep -Milliseconds 200
        $proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like ('*' + $wanted + '*') -or $_.MainWindowTitle -like ('*' + $wanted + '*')) } | Select-Object -First 1
        if ($proc) { $found = [IntPtr]$proc.MainWindowHandle }
      }
      if ($found -ne [IntPtr]::Zero) { $script:Work = $found; [QuorumDesk]::Park($found) }
      if ($script:Home -ne [IntPtr]::Zero) { [QuorumDesk]::SetForegroundWindow($script:Home) | Out-Null }
    }
    elseif ($kind -eq 'open') {
      $script:Home = [QuorumDesk]::GetForegroundWindow()
      Start-Process ([string]$body.url)
      Start-Sleep -Milliseconds 200
      if ($script:Home -ne [IntPtr]::Zero) { [QuorumDesk]::SetForegroundWindow($script:Home) | Out-Null }
    }
    else { throw 'That input is not supported.' }
    return @{ ok = $true }
  }
  if ($op -eq 'click' -or $op -eq 'compose' -or $op -eq 'act') { throw 'Use the desktop mouse path for this Quorum Desktop build.' }
  throw "Unknown desktop command: $op"
}

while ($true) {
  $ws = $null
  try {
    $ws = [Net.WebSockets.ClientWebSocket]::new()
    $ws.ConnectAsync([Uri]$Gateway, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    Send-Text $ws (@{ type = 'hello'; code = $PairCode; deviceId = $DeviceId; name = $env:COMPUTERNAME } | ConvertTo-Json -Compress)
    while ($ws.State -eq [Net.WebSockets.WebSocketState]::Open) {
      $raw = Receive-Text $ws
      if (-not $raw) { break }
      $msg = $raw | ConvertFrom-Json
      if ($msg.type -eq 'welcome') { $DeviceId = [string]$msg.deviceId; continue }
      if ($msg.type -eq 'error') { throw [string]$msg.error }
      if ($msg.type -ne 'command') { continue }
      try {
        $data = Invoke-Op ([string]$msg.op) $msg.body
        Send-Text $ws (@{ type = 'result'; requestId = [string]$msg.requestId; ok = $true; data = $data } | ConvertTo-Json -Compress -Depth 6)
      } catch {
        Send-Text $ws (@{ type = 'result'; requestId = [string]$msg.requestId; ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
      }
    }
  } catch {
    Start-Sleep -Seconds 2
  } finally {
    if ($ws) { try { $ws.Dispose() } catch {} }
  }
}
`
}
