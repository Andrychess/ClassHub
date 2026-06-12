$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path $PSScriptRoot -Parent
$outputDir = "build-output"
$outputPath = Join-Path $root $outputDir
$markerFile = Join-Path $root ".build-output"

Get-Process -Name "ClassHub", "electron" -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*MegaCleaner*" -or $_.Path -like "*ClassHub*" } |
  Stop-Process -Force

Start-Sleep -Milliseconds 500

if (Test-Path $outputPath) {
  Remove-Item (Join-Path $outputPath "win-unpacked") -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $outputPath -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path $outputPath) {
  $backupName = "build-output_old_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  Rename-Item $outputPath (Join-Path $root $backupName) -ErrorAction SilentlyContinue
}

if (Test-Path $outputPath) {
  $outputDir = "build-output_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  Write-Host "Output folder is locked. Using $outputDir instead." -ForegroundColor Yellow
}

Set-Content -Path $markerFile -Value $outputDir -Encoding ASCII
exit 0
