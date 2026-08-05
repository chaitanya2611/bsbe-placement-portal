[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    $runtimeNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
    $runtimeTools = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback'
    $runtimePaths = @($runtimeNode, $runtimeTools) | Where-Object { Test-Path -LiteralPath $_ }
    if ($runtimePaths.Count -gt 0) {
        $env:Path = "$($runtimePaths -join ';');$env:Path"
    }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 24 is required. See docs/setup-windows.md.'
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw 'pnpm 11.9.0 is required. See docs/setup-windows.md.'
}
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}

if (-not $SkipInstall) {
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}

& (Join-Path $PSScriptRoot 'start-infrastructure.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Development infrastructure startup failed.' }

pnpm migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }

if (-not $SkipSeed) {
    pnpm seed -- --apply
    if ($LASTEXITCODE -ne 0) { throw 'Database seed failed.' }
}

Write-Host 'Portal: http://localhost:5173'
Write-Host 'Mailpit: http://localhost:8025'
Write-Host 'Press Ctrl+C to stop the development servers.'
pnpm dev
if ($LASTEXITCODE -ne 0) { throw 'Development server stopped with an error.' }
