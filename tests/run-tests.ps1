# run-tests.ps1  --  ASCII only on purpose (no non-ASCII path literals inside).
# Run:  powershell -File tests\run-tests.ps1
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root   = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root '.workbuddy'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$raw = Join-Path $outDir 'test-raw.tap'
if (Test-Path $raw) { Remove-Item $raw -Force }

Set-Location $root
$node = (Get-Command node).Source
$files = Get-ChildItem (Join-Path $PSScriptRoot '*.test.js') | Sort-Object Name

foreach ($f in $files) {
  ('### FILE ' + $f.Name) | Out-File -FilePath $raw -Append -Encoding utf8
  (& $node '--test' '--test-reporter=tap' (Join-Path 'tests' $f.Name) 2>&1) |
    Out-File -FilePath $raw -Append -Encoding utf8
}

& $node (Join-Path $PSScriptRoot 'report.js')
exit $LASTEXITCODE
