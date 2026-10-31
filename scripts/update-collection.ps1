[CmdletBinding()]
param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$repo = $null
$site = $null
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
$repacked = $false
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
    $branch = Run $git @('-C', $root, 'rev-parse', '--abbrev-ref', 'HEAD')
    if ($branch -ne 'main') { throw 'Switch this repository to main before updating.' }
    $remote = Run $git @('-C', $root, 'remote', 'get-url', 'origin')
    # Publish to whichever GitHub repository this checkout's origin names.
    if ($remote -notmatch '^(?:https://github\.com/|git@github\.com:)([\w.-]+)/([\w.-]+?)(?:\.git)?/?$') { throw "Origin is not a GitHub repository: $remote" }
    $repo = "$($Matches[1])/$($Matches[2])"
    $site = "https://$($Matches[1].ToLowerInvariant()).github.io/$($Matches[2])/"
    # A renamed repository keeps redirecting Git, but its Pages address changes.
    $current = & $gh api "repos/$repo" --jq .full_name 2>$null
    if ($LASTEXITCODE -eq 0 -and "$current" -match '^([\w.-]+)/([\w.-]+)$' -and "$current" -ne $repo) {
        Write-Host "GitHub now calls this repository $current. Update this folder with: git remote set-url origin https://github.com/$current.git" -ForegroundColor Yellow
        $repo = "$current"
        $site = "https://$($Matches[1].ToLowerInvariant()).github.io/$($Matches[2])/"
    }
    foreach ($folder in @('original_texts - copy','translated_texts - copy')) {
        if (@(Get-ChildItem -LiteralPath (Join-Path $root $folder) -Filter '*.txt' -File).Count -eq 0) { throw "$folder contains no .txt files." }
    }
    if (@(Get-ChildItem -LiteralPath (Join-Path $root 'metadata - copy') -Filter '*.csv' -File).Count -ne 1) { throw 'Keep exactly one .csv file in metadata - copy.' }
    Write-Host "`n1/4 Checking GitHub access and syncing main..." -ForegroundColor Cyan
    Run $gh @('auth','status','--hostname','github.com')
    # One tool pull request at a time, so that two cannot change the same files.
    $openJson = & $gh pr list --repo $repo --state open --limit 100 --json number,url,title,headRefName
    if ($LASTEXITCODE -ne 0) { throw 'Could not list the open pull requests on GitHub.' }
    $open = @(($openJson | Out-String | ConvertFrom-Json) | Where-Object { $_.headRefName -match '^(maintenance|catalog)/' })
    if ($open.Count) { throw "A pull request from the maintenance tools is still open: #$($open[0].number) $($open[0].title) ($($open[0].url)). Merge or close it on GitHub first, so that two pull requests cannot change the same files." }
    Run $git @('-C',$root,'fetch','origin')
    $ahead = @(Run $git @('-C',$root,'log','--format=%H','origin/main..HEAD'))
    if ($ahead.Count) { throw 'There are unpublished local commits. Push or resolve them before running the updater.' }
    # Volume PDFs proposed by an earlier update stay in this folder as local
    # changes. Once that pull request is merged they match main on GitHub, so
    # they are handed back to Git (their bytes are identical) before syncing.
    $upstream = @(Run $git @('-C',$root,'-c','core.quotePath=false','diff','--name-only','HEAD','origin/main'))
    foreach ($file in $upstream) {
        $local = Join-Path $root $file
        if (-not (Test-Path -LiteralPath $local -PathType Leaf)) { continue }
        $remoteHash = & $git -C $root rev-parse --verify --quiet "origin/main:$file"
        if ($LASTEXITCODE -ne 0) { continue }
        if ((Run $git @('-C',$root,'hash-object','--',$file)) -ne $remoteHash) { continue }
        $tracked = & $git -C $root ls-files -- $file
        if ($tracked) { Run $git @('-C',$root,'checkout','HEAD','--',$file) } else { Remove-Item -LiteralPath $local -Force }
    }
    $dirty = @(Run $git @('-C', $root, '-c', 'core.quotePath=false', 'status', '--porcelain', '--untracked-files=no'))
    if ($dirty.Count) { throw "Commit or resolve tracked-file changes before updating (if they belong to a pull request that is still open, merge or close it on GitHub first): $(($dirty | Select-Object -First 5) -join '; '). Your source folders are ignored by Git and may contain your edits." }
    Run $git @('-C',$root,'merge','--ff-only','origin/main')
    Write-Host "`n2/4 Snapshotting publishable sources and filtered metadata..." -ForegroundColor Cyan
    # Build outside the project folder: a Dropbox folder would sync gigabytes of
    # throwaway output, and its sync client can lock files Git has just written.
    $jobs = Join-Path ([IO.Path]::GetTempPath()) 'pi-browser-jobs'
    New-Item -ItemType Directory -Force -Path $jobs | Out-Null
    $stage = Join-Path $jobs ('update-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    # Copy every build input; the source archive is regenerated below.
    foreach ($folder in @('src','scripts','tests','subject-summaries','study-guides')) { Copy-Item -LiteralPath (Join-Path $root $folder) -Destination $stage -Recurse }
    New-Item -ItemType Directory -Force -Path (Join-Path $stage 'data') | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $root 'data') -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stage 'data') }
    Get-ChildItem -LiteralPath $root -Filter '*.csv' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stage }
    Copy-Item -LiteralPath (Join-Path $root 'subjects - reference.docx') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $root 'pdf_volumes - copy') -Destination $stage -Recurse
    Run $python @((Join-Path $root 'scripts/archive-sources.py'),'--output',(Join-Path $stage 'data/collection'))
    Write-Host "`n3/4 Building and testing the exact upload snapshot..." -ForegroundColor Cyan
    Set-Location -LiteralPath $stage
    Run $node @('--max-old-space-size=6144','scripts/build.mjs')
    $tests = @(Get-ChildItem -LiteralPath (Join-Path $stage 'tests') -Filter '*.test.mjs' -File | ForEach-Object { $_.FullName })
    Run $node (@('--test') + $tests)
    Set-Location -LiteralPath $root
    if ($ValidateOnly) { Write-Host 'Validation passed. Nothing was uploaded.' -ForegroundColor Green; exit 0 }
    # Describe the update by catalog ID before the repository copy is re-packed.
    $body = Join-Path $stage 'pull-request.md'
    Run $python @((Join-Path $root 'scripts/describe-collection-update.py'),'--old',(Join-Path $root 'data/collection'),'--new',(Join-Path $stage 'data/collection'),'--stats',(Join-Path $stage 'dist/stats.json'),'--output',$body)
    # Only tested snapshot files are committed; source folders are never edited.
    # Re-pack into the repository copy so that only changed shards are rewritten.
    $repacked = $true
    Run $python @((Join-Path $root 'scripts/archive-sources.py'),'--from-archive',(Join-Path $stage 'data/collection'),'--output',(Join-Path $root 'data/collection'))
    Copy-Item -LiteralPath (Join-Path $stage 'build-report.json') -Destination (Join-Path $root 'build-report.json')
    Copy-Item -LiteralPath (Join-Path $stage 'subject-import-report.json') -Destination (Join-Path $root 'subject-import-report.json')
    # Install the tested preview under the collection lock and retire old datasets.
    Run $node @((Join-Path $root 'scripts/install-built-site.mjs'),(Join-Path $stage 'dist'))
    $paths = @('data/collection','build-report.json','subject-import-report.json','pdf_volumes - copy')
    $sources = @(Run $git (@('-C',$root,'-c','core.quotePath=false','status','--porcelain','--untracked-files=all','--','data/collection','pdf_volumes - copy')))
    if (-not $sources.Count) {
        Write-Host "`nNothing to propose: the sources and volume PDFs already match GitHub." -ForegroundColor Green
        exit 0
    }
    $pdfs = @($sources | Where-Object { $_.Substring(3).Trim('"') -like 'pdf_volumes - copy/*' } | ForEach-Object {
        $name = Split-Path -Leaf $_.Substring(3).Trim('"')
        switch -Regex ($_.Substring(0,2)) { '\?\?|A' { "added: $name" } 'D' { "removed: $name" } default { "replaced: $name" } }
    })
    if ($pdfs.Count) { Add-Content -LiteralPath $body -Encoding UTF8 -Value ("`nVolume PDFs (copied to the PDF site when this is merged):`n" + (($pdfs | ForEach-Object { "- $_" }) -join "`n")) }
    Write-Host "`n4/4 Opening a pull request for the tested update..." -ForegroundColor Cyan
    $account = (Run $gh @('api','user') | Out-String | ConvertFrom-Json)
    $title = 'Refresh collection sources ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
    # Commit through a separate index: this folder stays on main, untouched by Git.
    $env:GIT_INDEX_FILE = Join-Path $stage 'pull-request.index'
    try {
        Run $git @('-C',$root,'read-tree','HEAD')
        Run $git (@('-C',$root,'add','-A','--') + $paths)
        $tree = Run $git @('-C',$root,'write-tree')
        $sha = Run $git @('-C',$root,'-c',('user.name='+$account.login),'-c',('user.email='+$account.id+'+'+$account.login+'@users.noreply.github.com'),'commit-tree',$tree,'-p','HEAD','-m',$title)
    } finally { Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue }
    $files = @(Run $git @('-C',$root,'-c','core.quotePath=false','diff','--name-only','HEAD',$sha))
    Add-Content -LiteralPath $body -Encoding UTF8 -Value ("`nFiles changed:`n" + (($files | ForEach-Object { '- `' + $_ + '`' }) -join "`n") + "`n`nOpened by Update-Collection.cmd (maintenance folder). Merging this pull request publishes the change: the website rebuilds and is checked automatically.")
    # A new branch name: an ordinary push never overwrites remote history, and main does not move.
    $branch = 'maintenance/collection-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
    Run $git @('-C',$root,'push','origin',"${sha}:refs/heads/$branch")
    $url = @(Run $gh @('pr','create','--repo',$repo,'--base','main','--head',$branch,'--title',$title,'--body-file',$body))[-1]
    Write-Host "`nPull request: $url" -ForegroundColor Green
    Write-Host "Nothing is published until the pull request is merged on GitHub; the website then rebuilds automatically ($site)."
    Write-Host 'Keep added or replaced volume PDFs in pdf_volumes - copy; once the pull request is merged, the next update recognises them.'
} catch {
    Write-Host "`nUPDATE STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'No pull request was opened. Your source folders have not been changed. Resolve the reported error before retrying.'
    exit 1
} finally {
    Set-Location -LiteralPath $originalLocation
    if ($lock) { $lock.Dispose() }
    # The re-packed archive and reports are rebuilt on every run, and the pull
    # request carries them; keep this folder's copies matching main.
    if ($repacked) { & $git -C $root checkout HEAD -- data/collection build-report.json subject-import-report.json }
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        $resolvedStage = [IO.Path]::GetFullPath($stage)
        $allowedParent = [IO.Path]::GetFullPath($jobs) + [IO.Path]::DirectorySeparatorChar
        if ($resolvedStage.StartsWith($allowedParent,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedStage) -match '^update-[a-f0-9]{32}$') {
            try { Remove-Item -LiteralPath $resolvedStage -Recurse -Force -ErrorAction Stop }
            catch { Write-Warning "Temporary snapshot could not be removed because Windows still has a file open: $resolvedStage" }
        }
    }
}
