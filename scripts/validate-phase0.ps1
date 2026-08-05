[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

$requiredFiles = @(
    'README.md',
    'docs/phase-0/README.md',
    'docs/phase-0/01-requirements.md',
    'docs/phase-0/02-architecture.md',
    'docs/phase-0/03-threat-model.md',
    'docs/phase-0/04-data-flow.md',
    'docs/phase-0/05-data-model-and-index-plan.md',
    'docs/phase-0/06-api-module-map.md',
    'docs/phase-0/07-authorization-matrix.md',
    'docs/phase-0/08-state-machines.md',
    'docs/phase-0/09-offline-sync.md',
    'docs/phase-0/10-safe-exam-browser.md',
    'docs/phase-0/11-deployment-profiles.md',
    'docs/phase-0/12-implementation-roadmap.md',
    'docs/phase-0/13-risk-register.md',
    'docs/adr/README.md',
    'docs/adr/0001-modular-monolith.md',
    'docs/adr/0002-server-authority-and-immutable-versions.md',
    'docs/adr/0003-cookie-sessions.md',
    'docs/adr/0004-bounded-offline-lease.md',
    'docs/adr/0005-encrypted-rubric-separation.md'
)

$errors = [System.Collections.Generic.List[string]]::new()

foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $relativePath -PathType Leaf)) {
        $errors.Add("Missing required file: $relativePath")
    }
}

$combined = ($requiredFiles | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | ForEach-Object {
    Get-Content -Raw -LiteralPath $_
}) -join "`n"

$requiredTopics = @(
    'OWASP ASVS 5.0',
    'X-SafeExamBrowser-RequestHash',
    'X-SafeExamBrowser-ConfigKeyHash',
    'PAUSED_INTEGRITY',
    'Idempotency-Key',
    'Asia/Kolkata',
    '<replace-with-real-domain>',
    '<cloud-provider>',
    '<object-storage-provider>',
    '<smtp-credentials>',
    '<department-logo>',
    '<final-branding-colours>'
)

foreach ($topic in $requiredTopics) {
    if (-not $combined.Contains($topic)) {
        $errors.Add("Required design topic or placeholder is absent: $topic")
    }
}

$mermaidCount = ([regex]::Matches($combined, '```mermaid')).Count
if ($mermaidCount -lt 5) {
    $errors.Add("Expected at least 5 Mermaid diagrams; found $mermaidCount")
}

$markdownFiles = Get-ChildItem -LiteralPath 'docs' -Filter '*.md' -File -Recurse
$linkPattern = [regex]'\[[^\]]+\]\((?!https?://|#)(?<target>[^)#]+)(?:#[^)]+)?\)'
foreach ($file in $markdownFiles) {
    $text = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($match in $linkPattern.Matches($text)) {
        $target = [System.Uri]::UnescapeDataString($match.Groups['target'].Value)
        $resolved = Join-Path -Path $file.DirectoryName -ChildPath $target
        if (-not (Test-Path -LiteralPath $resolved)) {
            $errors.Add("Broken relative link in $($file.FullName): $target")
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "Phase 0 documentation validation passed: $($requiredFiles.Count) required files, $mermaidCount Mermaid diagrams, required topics/placeholders present, and relative links valid."
