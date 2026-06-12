param(
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch",
  [switch]$SkipPush,
  [switch]$SkipBuild,
  [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "ClassHub release: bump $Bump" -ForegroundColor Cyan

$version = node (Join-Path $PSScriptRoot "bump-version.js") $Bump
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$tag = "v$version"
Write-Host "New version: $version ($tag)" -ForegroundColor Green

git add package.json package-lock.json
$pending = git diff --cached --name-only
if (-not $pending) {
  Write-Host "No version changes to commit." -ForegroundColor Yellow
} else {
  git commit -m "Release $version"
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (git rev-parse "$tag" 2>$null) {
  Write-Host "Tag $tag already exists. Delete it or choose another bump type." -ForegroundColor Red
  exit 1
}

git tag $tag
Write-Host "Created tag: $tag" -ForegroundColor Green

if (-not $SkipBuild) {
  Write-Host "Building installer..." -ForegroundColor Cyan
  npm run dist
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (-not $SkipUpload) {
  if (-not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
    Write-Host ""
    Write-Host "GH_TOKEN is not set. Skipping GitHub upload." -ForegroundColor Yellow
    Write-Host "Run: `$env:GH_TOKEN = 'ghp_...'; npm run upload:github" -ForegroundColor Yellow
  } else {
    Write-Host "Uploading to GitHub Releases..." -ForegroundColor Cyan
    npm run upload:github
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
}

if (-not $SkipPush) {
  Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
  git push origin HEAD
  git push origin $tag
  Write-Host ""
  Write-Host "GitHub Actions will also build release for tag $tag." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Version $version is ready." -ForegroundColor Green
Write-Host "Release: https://github.com/Andrychess/ClassHub/releases/tag/$tag" -ForegroundColor Yellow
