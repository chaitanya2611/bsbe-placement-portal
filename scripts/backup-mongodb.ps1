param(
  [Parameter(Mandatory = $true)][string]$MongoUri,
  [Parameter(Mandatory = $true)][string]$DestinationDirectory
)

$ErrorActionPreference = 'Stop'
$resolvedDestination = [System.IO.Path]::GetFullPath($DestinationDirectory)
New-Item -ItemType Directory -Path $resolvedDestination -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $resolvedDestination "bsbe-portal-$timestamp.archive.gz"

if (-not (Get-Command mongodump -ErrorAction SilentlyContinue)) {
  throw 'mongodump is required. Install MongoDB Database Tools before running this backup.'
}

& mongodump --uri=$MongoUri --archive=$archive --gzip
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archive)) {
  throw 'MongoDB backup failed.'
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $archive
Set-Content -LiteralPath "$archive.sha256" -Value "$($hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($archive))"
Write-Output $archive
