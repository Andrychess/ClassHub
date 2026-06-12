param(
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch",
  [switch]$SkipPush,
  [switch]$SkipBuild,
  [switch]$SkipUpload,
  [switch]$SkipBump
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Test-GitTagExists([string]$TagName) {
  $existing = git tag -l $TagName
  return [bool]$existing
}

if ($SkipBump) {
  $version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
  Write-Host "Continuing release without bump: $version" -ForegroundColor Cyan
} else {
  Write-Host "ClassHub release: bump $Bump" -ForegroundColor Cyan
  $version = node (Join-Path $PSScriptRoot "bump-version.js") $Bump
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  git add package.json package-lock.json
  $pending = git diff --cached --name-only
  if ($pending) {
    git commit -m "Release $version"
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } else {
    Write-Host "Version files already committed." -ForegroundColor Yellow
  }
}

$tag = "v$version"
Write-Host "Release version: $version ($tag)" -ForegroundColor Green

if (Test-GitTagExists $tag) {
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
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  git push origin $tag 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) {
    $tagOnRemote = git ls-remote --tags origin "refs/tags/$tag"
    if ($tagOnRemote) {
      Write-Host "Tag $tag already exists on GitHub. Skipping tag push." -ForegroundColor Yellow
    } else {
      exit $LASTEXITCODE
    }
  }

  Write-Host ""
  Write-Host "GitHub Actions will also build release for tag $tag." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Version $version is ready." -ForegroundColor Green
Write-Host "Release: https://github.com/Andrychess/ClassHub/releases/tag/$tag" -ForegroundColor Yellow
