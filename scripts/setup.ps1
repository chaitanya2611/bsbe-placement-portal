[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

foreach ($command in @('node', 'pnpm')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command is required. See docs/setup-windows.md."
    }
}

$nodeVersion = node --version
$pnpmVersion = pnpm --version
Write-Output "Using Node.js $nodeVersion and pnpm $pnpmVersion"

if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    Write-Output 'Created .env from .env.example; review placeholders before running the API.'
}

pnpm install --frozen-lockfile
Write-Output 'Workspace dependencies installed.'
