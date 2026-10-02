$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
try {
    if (Test-Path -LiteralPath $runtimeNode) { $editorNode = $runtimeNode }
    else { $editorNode = (Get-Command node -ErrorAction Stop).Source }
    $version = & $editorNode --version
    if ([int](($version.TrimStart('v') -split '\.')[0]) -lt 22) { throw 'Node.js 22 or newer is required.' }
    & $editorNode (Join-Path $PSScriptRoot 'edit-item-server.mjs') $root
    if ($LASTEXITCODE -ne 0) { throw 'The editor stopped. See the message above.' }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
