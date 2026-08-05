[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is required. See docs/setup-docker.md.'
}

docker compose up -d --wait mongo mailpit
docker compose up -d mongo-init
docker compose wait mongo-init
if ($LASTEXITCODE -ne 0) {
    throw 'MongoDB replica-set initialization failed.'
}
docker compose ps
