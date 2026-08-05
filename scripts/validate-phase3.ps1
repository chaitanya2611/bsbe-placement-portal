[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

$requiredFiles = @(
    'apps/api/src/question-bank/question-bank.module.ts',
    'apps/api/src/question-bank/question.models.ts',
    'apps/api/src/question-bank/question.service.ts',
    'apps/api/src/question-bank/media.service.ts',
    'apps/api/src/question-bank/rubric-crypto.service.ts',
    'apps/api/src/question-bank/chemical-validation.service.ts',
    'apps/web/src/components/question-bank.tsx',
    'packages/contracts/src/questions.ts',
    'tests/question-bank-security.test.mjs',
    'tests/question-bank.integration.test.mjs',
    'docs/phase-3/README.md',
    'docs/phase-3/question-bank-data-model.md'
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $relativePath -PathType Leaf)) {
        $errors.Add("Missing required Phase 3 file: $relativePath")
    }
}

$environmentExample = Get-Content -Raw -LiteralPath '.env.example'
foreach ($name in @('QUESTION_RUBRIC_KEYS_JSON', 'QUESTION_RUBRIC_ACTIVE_KEY_VERSION', 'MEDIA_STORAGE_DRIVER', 'MEDIA_MAX_BYTES', 'MEDIA_MAX_PIXELS')) {
    if (-not $environmentExample.Contains("$name=")) {
        $errors.Add("Missing Phase 3 environment variable: $name")
    }
}

$models = Get-Content -Raw -LiteralPath 'apps/api/src/question-bank/question.models.ts'
foreach ($indexName in @('uq_question_version_number', 'uq_question_version_rubric', 'uq_question_exam_version_usage')) {
    if (-not $models.Contains($indexName)) {
        $errors.Add("Missing Phase 3 integrity index: $indexName")
    }
}

if (Test-Path -LiteralPath 'apps/api/src/exams' -PathType Container) {
    $errors.Add('Phase 4 exam module exists during the Phase 3 boundary.')
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "Phase 3 boundary validation passed: $($requiredFiles.Count) required files, media/rubric variables, integrity indexes, and no Phase 4 module."
