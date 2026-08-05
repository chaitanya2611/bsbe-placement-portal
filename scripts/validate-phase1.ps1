[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

$requiredFiles = @(
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'eslint.config.mjs',
    '.env.example',
    'apps/api/package.json',
    'apps/api/src/main.ts',
    'apps/api/src/health/health.controller.ts',
    'apps/api/Dockerfile',
    'apps/web/package.json',
    'apps/web/src/main.tsx',
    'apps/web/Dockerfile',
    'packages/config/package.json',
    'packages/contracts/package.json',
    'packages/shared/package.json',
    'docker-compose.yml',
    'infra/mongodb/init-replica-set.js',
    '.github/workflows/ci.yml',
    'docs/phase-1/README.md',
    'docs/architecture.md',
    'docs/environment-reference.md',
    'docs/setup-windows.md',
    'docs/setup-docker.md',
    'docs/testing.md',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md'
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $relativePath -PathType Leaf)) {
        $errors.Add("Missing required Phase 1 file: $relativePath")
    }
}

$rootPackage = Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json
if ($rootPackage.packageManager -ne 'pnpm@11.9.0') {
    $errors.Add('packageManager must be pinned to pnpm@11.9.0')
}
if ($rootPackage.devDependencies.typescript -ne '6.0.3') {
    $errors.Add('TypeScript compatibility pin must be 6.0.3')
}

$apiPackage = Get-Content -Raw -LiteralPath 'apps/api/package.json' | ConvertFrom-Json
if ($apiPackage.dependencies.'@nestjs/core' -ne '11.1.28') {
    $errors.Add('NestJS core must be pinned to 11.1.28')
}
if ($apiPackage.dependencies.mongoose -ne '8.24.1') {
    $errors.Add('Mongoose compatibility pin must be 8.24.1')
}

$webPackage = Get-Content -Raw -LiteralPath 'apps/web/package.json' | ConvertFrom-Json
if ($webPackage.dependencies.react -ne '19.2.8' -or $webPackage.devDependencies.vite -ne '8.2.0') {
    $errors.Add('React/Vite pins do not match the Phase 1 baseline')
}

$compose = Get-Content -Raw -LiteralPath 'docker-compose.yml'
foreach ($image in @('mongo:8.0.28-noble', 'axllent/mailpit:v1.30.0')) {
    if (-not $compose.Contains($image)) {
        $errors.Add("Compose image is not pinned: $image")
    }
}

$environmentExample = Get-Content -Raw -LiteralPath '.env.example'
foreach ($placeholder in @('INSTITUTE_EMAIL_DOMAIN=replace-with-real-domain', 'Asia/Kolkata', '<object-storage-provider>')) {
    if (-not $environmentExample.Contains($placeholder)) {
        $errors.Add("Missing safe environment placeholder: $placeholder")
    }
}

foreach ($futureModule in @('auth', 'users', 'questions', 'exams', 'attempts', 'results')) {
    if (Test-Path -LiteralPath (Join-Path 'apps/api/src' $futureModule) -PathType Container) {
        $errors.Add("Later-phase API module exists during Phase 1: $futureModule")
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "Phase 1 validation passed: $($requiredFiles.Count) required files, exact baseline pins, safe placeholders, infrastructure images, and phase boundary verified."
