param([string]$Reference = 'subjects - reference.docx')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName System.IO.Compression.FileSystem
function SubjectKey([string]$value) {
    return [regex]::Replace($value.Normalize([Text.NormalizationForm]::FormKC).ToLowerInvariant(), '[^\p{L}\p{N}]', '')
}
$referencePath = Join-Path $root $Reference
$archive = [IO.Compression.ZipFile]::OpenRead($referencePath)
try {
    $reader = [IO.StreamReader]::new($archive.GetEntry('word/document.xml').Open())
    try { [xml]$document = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $ns = [Xml.XmlNamespaceManager]::new($document.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $positions = @{}
    $sections = @{}
    $headings = [Collections.Generic.List[object]]::new()
    $heading = $null
    $position = 0
    foreach ($paragraph in $document.SelectNodes('//w:body//w:p', $ns)) {
        $text = ($paragraph.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.InnerText }) -join ''
        if ($text -match '^\s*([IVX]+\.[A-Z]\.)\s+(.+)$') {
            $heading = $Matches[1]
            $headings.Add([pscustomobject]@{ id = $heading; title = ($text.Trim() -replace '\s+', ' ') })
        }
        $key = SubjectKey $text
        if ($key -and !$positions.ContainsKey($key)) {
            $positions[$key] = $position
            $sections[$key] = $heading
        }
        $position++
    }
} finally { $archive.Dispose() }
$row = 0
$ordered = @(Import-Csv (Join-Path $root '14-colors_and_hyperlinks.csv') -Encoding UTF8 | ForEach-Object {
    $key = SubjectKey $_.subject
    if (!$positions.ContainsKey($key)) { throw "Subject missing from reference: $($_.subject)" }
    [pscustomobject]@{ name = $_.subject.Trim(); position = $positions[$key]; row = $row++ }
} | Sort-Object position, row | ForEach-Object { $_.name })
$output = [ordered]@{
    reference = $Reference
    sha256 = (Get-FileHash $referencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    subjects = $ordered
    groups = @($headings | ForEach-Object {
        $sectionId = $_.id
        [ordered]@{ id = $sectionId; title = $_.title; subjects = @($ordered | Where-Object { $sections[(SubjectKey $_)] -eq $sectionId }) }
    })
}
$json = $output | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $root 'src/subject-order.json'), $json + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Recorded thematic order for $($ordered.Count) subjects in $($headings.Count) sections."
