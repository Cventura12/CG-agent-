$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$logDir = Join-Path $repoRoot ".tmp\voice-local-test"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$backendOut = Join-Path $logDir "backend.out.log"
$backendErr = Join-Path $logDir "backend.err.log"
$ngrokOut = Join-Path $logDir "ngrok.out.log"
$ngrokErr = Join-Path $logDir "ngrok.err.log"

Write-Host "Starting Arbor Agent backend on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
$backend = Start-Process `
  -FilePath python `
  -ArgumentList "-m","uvicorn","gc_agent.main:app","--host","127.0.0.1","--port","8000" `
  -WorkingDirectory $repoRoot `
  -PassThru `
  -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr

$backendReady = $false
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 1
  try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 3
    if ($health.StatusCode -eq 200) {
      $backendReady = $true
      break
    }
  } catch {
    if ($backend.HasExited) {
      break
    }
  }
}

if (-not $backendReady) {
  Write-Host "Backend failed to come up cleanly." -ForegroundColor Red
  if (Test-Path $backendErr) {
    Get-Content $backendErr -Tail 80
  }
  if (Test-Path $backendOut) {
    Get-Content $backendOut -Tail 80
  }
  throw "Backend startup failed."
}

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  throw "ngrok is not installed or not available on PATH."
}

Write-Host "Starting ngrok tunnel ..." -ForegroundColor Cyan
$ngrok = Start-Process `
  -FilePath ngrok `
  -ArgumentList "http","8000","--log=stdout" `
  -WorkingDirectory $repoRoot `
  -PassThru `
  -RedirectStandardOutput $ngrokOut `
  -RedirectStandardError $ngrokErr

$publicUrl = ""
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 1
  try {
    $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
    $publicUrl = @($tunnels.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -ExpandProperty public_url -First 1)
    if ($publicUrl) {
      break
    }
  } catch {
    if ($ngrok.HasExited) {
      break
    }
  }
}

if (-not $publicUrl) {
  Write-Host "ngrok did not expose a public HTTPS URL." -ForegroundColor Red
  if (Test-Path $ngrokErr) {
    Get-Content $ngrokErr -Tail 80
  }
  if (Test-Path $ngrokOut) {
    Get-Content $ngrokOut -Tail 80
  }
  throw "ngrok startup failed."
}

$voiceWebhook = "$publicUrl/webhook/twilio/voice"
$whatsappWebhook = "$publicUrl/webhook/whatsapp"
$statusWebhook = "$publicUrl/webhook/twilio/status"
$streamBaseUrl = $publicUrl -replace '^https://', 'wss://'

Write-Host ""
Write-Host "Local voice test is ready." -ForegroundColor Green
Write-Host ("Backend PID: " + $backend.Id)
Write-Host ("ngrok PID:   " + $ngrok.Id)
Write-Host ("Public URL:  " + $publicUrl)
Write-Host ""
Write-Host "Set these in Twilio:" -ForegroundColor Yellow
Write-Host ("Voice webhook:       " + $voiceWebhook)
Write-Host ("WhatsApp webhook:    " + $whatsappWebhook)
Write-Host ("Status callback:     " + $statusWebhook)
Write-Host ""
Write-Host "Optional local env for stronger streaming behavior:" -ForegroundColor Yellow
Write-Host ("TWILIO_VOICE_STREAM_BASE_URL=" + $streamBaseUrl)
Write-Host ("TWILIO_VOICE_STREAMING_ENABLED=1")
Write-Host ""
Write-Host "Logs:" -ForegroundColor Yellow
Write-Host ("  " + $backendOut)
Write-Host ("  " + $backendErr)
Write-Host ("  " + $ngrokOut)
Write-Host ("  " + $ngrokErr)
Write-Host ""
Write-Host "Press Ctrl+C to stop this script. It will clean up backend and ngrok." -ForegroundColor Cyan

try {
  while ($true) {
    Start-Sleep -Seconds 2
    if ($backend.HasExited) {
      throw "Backend exited unexpectedly."
    }
    if ($ngrok.HasExited) {
      throw "ngrok exited unexpectedly."
    }
  }
} finally {
  foreach ($proc in @($backend, $ngrok)) {
    if ($null -ne $proc -and -not $proc.HasExited) {
      try {
        Stop-Process -Id $proc.Id -Force
      } catch {
      }
    }
  }
}
