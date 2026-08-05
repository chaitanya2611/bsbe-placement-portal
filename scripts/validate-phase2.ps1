[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

$requiredFiles = @(
    'apps/api/src/identity/identity.module.ts',
    'apps/api/src/identity/auth.controller.ts',
    'apps/api/src/identity/auth.service.ts',
    'apps/api/src/identity/identity.models.ts',
    'apps/api/src/identity/access.guards.ts',
    'apps/api/src/identity/csrf.guard.ts',
    'apps/api/src/identity/session.service.ts',
    'apps/api/src/identity/bootstrap-admin.cli.ts',
    'apps/api/src/identity/migration.cli.ts',
    'apps/web/src/pages/portal-page.tsx',
    'tests/identity-security.test.mjs',
    'tests/identity-auth.integration.test.mjs',
    'docs/phase-2/README.md',
    'docs/phase-2/authentication-operations.md',
    'docs/phase-2/identity-data-model.md',
    'docs/adr/0007-passwordless-identity-and-signed-csrf.md'
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $relativePath -PathType Leaf)) {
        $errors.Add("Missing required Phase 2 file: $relativePath")
    }
}

$environmentExample = Get-Content -Raw -LiteralPath '.env.example'
foreach ($name in @('OTP_PEPPER', 'SESSION_TOKEN_PEPPER', 'CSRF_SECRET', 'IP_HASH_KEY')) {
    if (-not $environmentExample.Contains("$name=")) {
        $errors.Add("Missing Phase 2 environment variable: $name")
    }
}

$models = Get-Content -Raw -LiteralPath 'apps/api/src/identity/identity.models.ts'
foreach ($indexName in @('ttl_otp_cleanup', 'ttl_session_expiry', 'uq_active_student_session')) {
    if (-not $models.Contains($indexName)) {
        $errors.Add("Missing security index: $indexName")
    }
}

foreach ($futureModule in @('questions', 'media')) {
    if (Test-Path -LiteralPath (Join-Path 'apps/api/src' $futureModule) -PathType Container) {
        $errors.Add("Phase 3 module exists during Phase 2: $futureModule")
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "Phase 2 boundary validation passed: $($requiredFiles.Count) required files, cryptographic variables, critical indexes, and no Phase 3 modules."
