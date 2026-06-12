param(
  [string]$Tag = "",
  [string]$ExePath = "",
  [string]$ReleaseName = "",
  [string]$ReleaseBody = "ClassHub Windows installer"
)

$ErrorActionPreference = "Stop"
$owner = "Andrychess"
$repo = "ClassHub"
$root = Split-Path $PSScriptRoot -Parent

$token = $env:GH_TOKEN
if (-not $token) {
  $token = $env:GITHUB_TOKEN
}
if (-not $token) {
  Write-Host "Set GH_TOKEN with a GitHub personal access token (scope: repo)." -ForegroundColor Red
  Write-Host "Example: `$env:GH_TOKEN = 'ghp_...'" -ForegroundColor Yellow
  exit 1
}

if (-not $Tag) {
  $packageJson = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $Tag = "v$($packageJson.version)"
}

if (-not $ExePath) {
  $exe = Get-ChildItem -Path $root -Recurse -Filter "ClassHub Setup *.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $exe) {
    Write-Host "Installer not found. Run npm run dist first." -ForegroundColor Red
    exit 1
  }
  $ExePath = $exe.FullName
}

if (-not (Test-Path $ExePath)) {
  throw "File not found: $ExePath"
}

if (-not $ReleaseName) {
  $ReleaseName = "ClassHub $Tag"
}

$headers = @{
  Authorization = "Bearer $token"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

Write-Host "Tag: $Tag" -ForegroundColor Cyan
Write-Host "File: $ExePath" -ForegroundColor Cyan

$release = $null
try {
  $release = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$Tag" `
    -Headers $headers
} catch {
  $release = $null
}

if (-not $release) {
  Write-Host "Creating release $Tag..." -ForegroundColor Cyan
  $body = @{
    tag_name = $Tag
    name = $ReleaseName
    body = $ReleaseBody
    draft = $false
    prerelease = $false
  } | ConvertTo-Json

  $release = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.github.com/repos/$owner/$repo/releases" `
    -Headers $headers `
    -Body $body `
    -ContentType "application/json; charset=utf-8"
}

$fileName = Split-Path $ExePath -Leaf
$uploadUrl = "https://uploads.github.com/repos/$owner/$repo/releases/$($release.id)/assets?name=$([uri]::EscapeDataString($fileName))"

Write-Host "Uploading $fileName..." -ForegroundColor Cyan
$bytes = [System.IO.File]::ReadAllBytes($ExePath)
Invoke-RestMethod `
  -Method Post `
  -Uri $uploadUrl `
  -Headers @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github+json"
    "Content-Type" = "application/octet-stream"
  } `
  -Body $bytes | Out-Null

Write-Host ""
Write-Host "Done: $($release.html_url)" -ForegroundColor Green
