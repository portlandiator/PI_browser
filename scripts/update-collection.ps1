[CmdletBinding()]
param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$repo = 'portlandiator/PI_browser'
$site = 'https://portlandiator.github.io/PI_browser/'
$runtime = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies'
function Find-Tool($Name, $Candidates) {
    foreach ($candidate in $Candidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate } }
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notlike '*WindowsApps*') { return $command.Source }
    throw "Cannot find $Name. Install it and add it to PATH, then run this utility again."
}
function Run($Exe, [string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($Exe)) failed (exit $LASTEXITCODE). Update stopped." }
}
$lock = $null
$stage = $null
$originalLocation = Get-Location
try {
    Set-Location -LiteralPath $root
    New-Item -ItemType Directory -Force -Path (Join-Path $root '.qa') | Out-Null
    try { $lock = [IO.File]::Open((Join-Path $root '.qa/update.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Another update is running. Wait for it to finish.' }
    $node = Find-Tool 'node' @((Join-Path $runtime 'node/bin/node.exe'))
    $python = Find-Tool 'python' @((Join-Path $runtime 'python/python.exe'))
    $git = Find-Tool 'git' @((Join-Path $runtime 'native/git/cmd/git.exe'))
    $gh = Find-Tool 'gh' @((Join-Path $root '.tools/gh/bin/gh.exe'))
    $version = Run $node @('--version')
    if ([int](($version.TrimStart('v') -split '\.')[0]) -lt 22) { throw 'Node.js 22 or newer is required.' }
    Run $python @('--version')
    $top = Run $git @('-C', $root, 'rev-parse', '--show-toplevel')
    if ([IO.Path]::GetFullPath($top) -ne [IO.Path]::GetFullPath($root)) { throw 'This folder must be the repository root.' }
    $branch = Run $git @('-C', $root, 'branch', '--show-current')
    if ($branch -ne 'main') { throw 'Switch this repository to main before updating.' }
    $remote = Run $git @('-C', $root, 'remote', 'get-url', 'origin')
    if ($remote -notmatch '^https://github\.com/portlandiator/PI_browser(?:\.git)?/?$|^git@github\.com:portlandiator/PI_browser(?:\.git)?$') { throw 'Origin does not point to portlandiator/PI_browser.' }
    $dirty = @(Run $git @('-C', $root, 'status', '--porcelain', '--untracked-files=no'))
    if ($dirty.Count) { throw 'Commit or resolve tracked-file changes before updating. Your source folders are ignored by Git and may contain your edits.' }
    foreach ($folder in @('original_texts - copy','translated_texts - copy')) {
        if (@(Get-ChildItem -LiteralPath (Join-Path $root $folder) -Filter '*.txt' -File).Count -eq 0) { throw "$folder contains no .txt files." }
    }
    if (@(Get-ChildItem -LiteralPath (Join-Path $root 'metadata - copy') -Filter '*.csv' -File).Count -ne 1) { throw 'Keep exactly one .csv file in metadata - copy.' }
    Write-Host "`n1/5 Checking GitHub access and syncing main..." -ForegroundColor Cyan
    Run $gh @('auth','status','--hostname','github.com')
    Run $git @('-C',$root,'fetch','origin')
    $ahead = @(Run $git @('-C',$root,'log','--format=%H','origin/main..HEAD'))
    if ($ahead.Count) { throw 'There are unpublished local commits. Push or resolve them before running the updater.' }
    Run $git @('-C',$root,'merge','--ff-only','origin/main')
    Write-Host "`n2/5 Snapshotting every source text and the metadata CSV..." -ForegroundColor Cyan
    $stage = Join-Path $root ('.qa/update-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    foreach ($folder in @('src','scripts','tests')) { Copy-Item -LiteralPath (Join-Path $root $folder) -Destination $stage -Recurse }
    New-Item -ItemType Directory -Force -Path (Join-Path $stage 'data') | Out-Null
    foreach ($file in @('subject-edits.json','subjects-snapshot.json.gz','subject-source-exceptions.json')) { Copy-Item -LiteralPath (Join-Path $root ('data/' + $file)) -Destination (Join-Path $stage 'data') }
    Copy-Item -LiteralPath (Join-Path $root '14-colors_and_hyperlinks.csv') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root 'subjects - reference.docx') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root 'pdf_volumes - copy') -Destination $stage -Recurse
    Run $python @((Join-Path $root 'scripts/archive-sources.py'),'--output',(Join-Path $stage 'data/collection.tar.gz'))
    Write-Host "`n3/5 Building and testing the exact upload snapshot..." -ForegroundColor Cyan
    Set-Location -LiteralPath $stage
    Run $node @('--max-old-space-size=6144','scripts/build.mjs')
    $tests = @(Get-ChildItem -LiteralPath (Join-Path $stage 'tests') -Filter '*.test.mjs' -File | ForEach-Object { $_.FullName })
    Run $node (@('--test') + $tests)
    Set-Location -LiteralPath $root
    if ($ValidateOnly) { Write-Host 'Validation passed. Nothing was uploaded.' -ForegroundColor Green; exit 0 }
    # Only tested snapshot files are committed; source folders are never edited.
    Copy-Item -LiteralPath (Join-Path $stage 'data/collection.tar.gz') -Destination (Join-Path $root 'data/collection.tar.gz')
    Copy-Item -LiteralPath (Join-Path $stage 'build-report.json') -Destination (Join-Path $root 'build-report.json')
    Copy-Item -LiteralPath (Join-Path $stage 'subject-import-report.json') -Destination (Join-Path $root 'subject-import-report.json')
    Write-Host "`n4/5 Uploading the complete source archive..." -ForegroundColor Cyan
    Run $git @('-C',$root,'add','--','data/collection.tar.gz','build-report.json','subject-import-report.json','pdf_volumes - copy')
    $account = (Run $gh @('api','user') | Out-String | ConvertFrom-Json)
    Run $git @('-C',$root,'-c',('user.name='+$account.login),'-c',('user.email='+$account.id+'+'+$account.login+'@users.noreply.github.com'),'commit','-m',('Refresh collection sources '+(Get-Date -Format 'yyyy-MM-dd HH:mm')))
    $sha = Run $git @('-C',$root,'rev-parse','HEAD')
    Run $git @('-C',$root,'push','origin','main')
    Write-Host "`n5/5 Waiting for the GitHub Pages rebuild and publication..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddMinutes(3)
    $runId = $null
    do {
        $runJson = & $gh 'run' 'list' '--repo' $repo '--workflow' 'pages.yml' '--commit' $sha '--event' 'push' '--limit' '1' '--json' 'databaseId'
        if ($LASTEXITCODE -ne 0) { throw "GitHub could not list the deployment run." }
        $runData = $runJson | ConvertFrom-Json
        if ($runData -is [array] -and $runData.Count) { $runId = $runData[0].databaseId }
        elseif ($runData -and $runData.databaseId) { $runId = $runData.databaseId }
        if ($runId) { break }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)
    if (-not $runId) { throw "GitHub has not started a deployment for $sha. Check the repository Actions page." }
    Run $gh @('run','watch',"$runId",'--repo',$repo,'--interval','15','--exit-status')
    # The deployed report's dataset differs from the local rebuild, so compare corpus counts.
    $expected = Get-Content -Raw -LiteralPath (Join-Path $stage 'dist/stats.json') | ConvertFrom-Json
    $live = Invoke-RestMethod -Uri ($site+'stats.json?update='+$sha)
    foreach ($key in @('records','pairs','original','english','metadataOnly')) {
        if ($live.$key -ne $expected.$key) { throw "Deployment finished but public $key differs. Check $site" }
    }
    # Add the tested build alongside existing datasets so an open preview keeps working.
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'dist') | Out-Null
    Copy-Item -Path (Join-Path $stage 'dist/*') -Destination (Join-Path $root 'dist') -Recurse -Force
    Write-Host "`nPublished successfully: $site" -ForegroundColor Green
    Write-Host "Deployment: https://github.com/$repo/actions/runs/$runId"
} catch {
    Write-Host "`nUPDATE STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Your source folders have not been changed. Resolve the reported error before retrying.'
    exit 1
} finally {
    Set-Location -LiteralPath $originalLocation
    if ($lock) { $lock.Dispose() }
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        $resolvedStage = [IO.Path]::GetFullPath($stage)
        $allowedParent = [IO.Path]::GetFullPath((Join-Path $root '.qa')) + [IO.Path]::DirectorySeparatorChar
        if ($resolvedStage.StartsWith($allowedParent,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStage) -match '^update-[a-f0-9]{32}$') {
            try { Remove-Item -LiteralPath $resolvedStage -Recurse -Force -ErrorAction Stop }
            catch { Write-Warning "Temporary snapshot could not be removed because Windows still has a file open: $resolvedStage" }
        }
    }
}
