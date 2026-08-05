param(
  [Parameter(Mandatory = $true)][string]$MongoUri,
  [Parameter(Mandatory = $true)][string]$Archive,
  [switch]$Confirmed
)

$ErrorActionPreference = 'Stop'
$resolvedArchive = [System.IO.Path]::GetFullPath($Archive)
if (-not (Test-Path -LiteralPath $resolvedArchive -PathType Leaf)) {
  throw "Backup archive not found: $resolvedArchive"
}
if (-not $Confirmed) {
  throw 'Restore can overwrite collections. Re-run only in the approved recovery window with -Confirmed.'
}
if (-not (Get-Command mongorestore -ErrorAction SilentlyContinue)) {
  throw 'mongorestore is required. Install MongoDB Database Tools before restoring.'
}

& mongorestore --uri=$MongoUri --archive=$resolvedArchive --gzip --drop
if ($LASTEXITCODE -ne 0) { throw 'MongoDB restore failed.' }
Write-Output 'Restore completed. Run migrations and the recovery verification checklist next.'
