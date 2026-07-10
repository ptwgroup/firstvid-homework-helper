param(
  [string]$EnvPath = ".env"
)

$ErrorActionPreference = "Stop"

Write-Host "FirstVid xAI key setup" -ForegroundColor Cyan
Write-Host "Paste your xAI API key when prompted. It will be written only to $EnvPath." -ForegroundColor Yellow
Write-Host "If you pasted a key into chat, rotate it first in the xAI Console." -ForegroundColor Yellow

$secureKey = Read-Host "xAI API key" -AsSecureString
$plainKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
)

if ([string]::IsNullOrWhiteSpace($plainKey) -or -not $plainKey.StartsWith("xai-")) {
  throw "That does not look like an xAI API key. No file was written."
}

$content = @"
XAI_API_KEY=$plainKey
XAI_ANALYSIS_MODEL=grok-4.5
XAI_VIDEO_MODEL=grok-imagine-video
FIRSTVID_VIDEO_SECONDS=auto
FIRSTVID_VIDEO_RESOLUTION=480p
FIRSTVID_VIDEO_TIMEOUT_MS=180000
PORT=8788
"@

Set-Content -LiteralPath $EnvPath -Value $content -Encoding UTF8
Write-Host "Saved $EnvPath. Restart FirstVid with: npm start" -ForegroundColor Green
