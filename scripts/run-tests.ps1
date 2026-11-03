$ErrorActionPreference = "Continue"

$testFiles = @(
    Get-ChildItem "$PSScriptRoot\..\src" -Recurse `
        -Include *.test.ts,*.test.tsx,*.spec.ts,*.spec.tsx |
        Sort-Object FullName |
        Select-Object -ExpandProperty FullName
)

Write-Host "Running $($testFiles.Count) test files..."

& npx.cmd --no-install tsx --test $testFiles
$testExitCode = $LASTEXITCODE

if ($testExitCode -ne 0) {
    Write-Host ""
    Write-Host "ONE OR MORE TESTS FAILED" -ForegroundColor Red
    exit $testExitCode
}

Write-Host ""
Write-Host "ALL TEST FILES PASSED" -ForegroundColor Green
exit 0
