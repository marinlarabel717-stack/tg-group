import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AccountRecord, PremiumExpiryReadResult } from './types'

const execFileAsync = promisify(execFile)

function escapePowerShellString(value: string) {
  return value.replace(/'/g, "''")
}

function trimRawText(value?: string | null) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 600) : null
}

export class TelegramDesktopPremiumService {
  private readonly debugDirectory: string

  constructor(accountsRootPath: string) {
    this.debugDirectory = path.join(accountsRootPath, 'desktop-premium-debug')
  }

  async readPremiumExpiry(_account: AccountRecord): Promise<PremiumExpiryReadResult> {
    await fs.mkdir(this.debugDirectory, { recursive: true })
    const debugDirectory = escapePowerShellString(this.debugDirectory)

    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr.OcrEngine, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging.BitmapDecoder, ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage.StorageFile, ContentType=WindowsRuntime]
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TgPremiumNative {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@

function Await($operation) {
  return $operation.AsTask().GetAwaiter().GetResult()
}

function Capture-WindowText($filePath) {
  $file = Await([Windows.Storage.StorageFile]::GetFileFromPathAsync($filePath))
  $stream = Await($file.OpenAsync([Windows.Storage.FileAccessMode]::Read))
  $decoder = Await([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream))
  $softwareBitmap = Await($decoder.GetSoftwareBitmapAsync())
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $engine) {
    throw 'Windows OCR 引擎不可用'
  }
  $result = Await($engine.RecognizeAsync($softwareBitmap))
  return [string]$result.Text
}

function Resolve-Expiry($text) {
  $patterns = @(
    '(?im)it\\s+expires\\s+on\\s+([^\\r\\n]+)',
    '(?im)expires\\s+on\\s+([^\\r\\n]+)',
    '(?im)到期(?:时间)?[:：]?\\s*([^\\r\\n]+)',
    '(?im)将于\\s*([^\\r\\n]+?)\\s*到期'
  )

  foreach ($pattern in $patterns) {
    $match = [regex]::Match($text, $pattern)
    if ($match.Success) {
      return $match.Groups[1].Value.Trim(' ', '.', '。', '：', ':')
    }
  }

  return $null
}

try {
  Start-Process 'tg://premium_offer?ref=tg-group'
} catch {
  $fallback = @{ ok = $false; premiumExpiry = $null; message = '无法打开 tg://premium_offer，请确认官方 Telegram Desktop 已安装并注册为 tg:// 处理器'; rawText = $null; screenshotPath = $null } | ConvertTo-Json -Compress -Depth 4
  Write-Output $fallback
  exit 0
}

$process = $null
for ($i = 0; $i -lt 40; $i++) {
  $process = Get-Process Telegram -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending | Select-Object -First 1
  if ($process -and $process.MainWindowHandle -ne 0) { break }
  Start-Sleep -Milliseconds 500
}

if (-not $process -or $process.MainWindowHandle -eq 0) {
  $missing = @{ ok = $false; premiumExpiry = $null; message = '未找到 Telegram Desktop 窗口，请先打开官方 Telegram Desktop 并切到目标账号'; rawText = $null; screenshotPath = $null } | ConvertTo-Json -Compress -Depth 4
  Write-Output $missing
  exit 0
}

[TgPremiumNative]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
[TgPremiumNative]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 2200

$window = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
if (-not $window) {
  $fail = @{ ok = $false; premiumExpiry = $null; message = '读取 Telegram Desktop 窗口失败'; rawText = $null; screenshotPath = $null } | ConvertTo-Json -Compress -Depth 4
  Write-Output $fail
  exit 0
}

$rect = $window.Current.BoundingRectangle
$width = [Math]::Max([int][Math]::Ceiling($rect.Width), 200)
$height = [Math]::Max([int][Math]::Ceiling($rect.Height), 200)
$left = [int][Math]::Floor($rect.Left)
$top = [int][Math]::Floor($rect.Top)

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($left, $top, 0, 0, $bitmap.Size)
$screenshotPath = Join-Path '${debugDirectory}' ('premium-' + [DateTime]::Now.ToString('yyyyMMddHHmmss') + '.png')
$bitmap.Save($screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

$ocrText = Capture-WindowText $screenshotPath
$expiry = Resolve-Expiry $ocrText

if ($expiry) {
  $success = @{ ok = $true; premiumExpiry = $expiry; message = '已从官方 Telegram Desktop Premium 页面识别到到期时间'; rawText = $ocrText; screenshotPath = $screenshotPath } | ConvertTo-Json -Compress -Depth 4
  Write-Output $success
  exit 0
}

$result = @{ ok = $false; premiumExpiry = $null; message = '已打开 Telegram Desktop Premium 页面，但未识别到到期时间；请确认当前活动账号正确，且页面已停留在 Premium 详情'; rawText = $ocrText; screenshotPath = $screenshotPath } | ConvertTo-Json -Compress -Depth 4
Write-Output $result
`

    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      })
      const raw = stdout.trim()
      if (!raw) {
        return {
          ok: false,
          premiumExpiry: null,
          message: '官方 Telegram Desktop 自动化没有返回结果',
          rawText: null,
          screenshotPath: null
        }
      }

      const parsed = JSON.parse(raw) as PremiumExpiryReadResult
      return {
        ok: Boolean(parsed.ok && parsed.premiumExpiry),
        premiumExpiry: parsed.premiumExpiry ?? null,
        message: parsed.message || '官方 Telegram Desktop 自动化已执行',
        rawText: trimRawText(parsed.rawText),
        screenshotPath: parsed.screenshotPath ?? null
      }
    } catch (error) {
      return {
        ok: false,
        premiumExpiry: null,
        message: error instanceof Error ? error.message : '官方 Telegram Desktop 自动化执行失败',
        rawText: null,
        screenshotPath: null
      }
    }
  }
}
