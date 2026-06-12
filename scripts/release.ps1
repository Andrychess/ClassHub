param(
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "ClassHub release: bump $Bump" -ForegroundColor Cyan

npm version $Bump -m "Release %s"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$tag = git describe --tags --abbrev=0
Write-Host "Created tag: $tag" -ForegroundColor Green
Write-Host "Pushing to GitHub..." -ForegroundColor Cyan

git push origin HEAD
git push origin $tag

Write-Host ""
Write-Host "Done. GitHub Actions will build .exe and publish the release automatically." -ForegroundColor Green
Write-Host "Track progress: https://github.com/Andrychess/ClassHub/actions" -ForegroundColor Yellow
