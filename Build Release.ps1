# RoA2 Stream Tool — Release ZIP builder
# Run from the repo root. Outputs "RoA2 Stream Tool.zip" in the same directory.

Add-Type -Assembly System.IO.Compression.FileSystem

$repoRoot  = $PSScriptRoot
$sourceDir = Join-Path $repoRoot "Stream Tool"
$outZip    = Join-Path $repoRoot "RoA2 Stream Tool.zip"

if (Test-Path $outZip) {
    Remove-Item $outZip -Force
    Write-Host "Removed existing zip." -ForegroundColor DarkGray
}

$zip = [System.IO.Compression.ZipFile]::Open($outZip, 'Create')

$files = Get-ChildItem $sourceDir -Recurse -File | Where-Object {
    $_.Name -ne "app.properties.txt" -and
    $_.FullName -notlike "*\Player Info\*"
}

foreach ($file in $files) {
    $entryName = $file.FullName.Substring($repoRoot.Length).TrimStart('\')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $file.FullName, $entryName, 'Optimal'
    ) | Out-Null
}

# Add empty Player Info folder
$zip.CreateEntry("Stream Tool/Resources/Texts/Player Info/") | Out-Null

$zip.Dispose()

$sizeMB = [math]::Round((Get-Item $outZip).Length / 1MB, 1)
Write-Host "Done!  RoA2 Stream Tool.zip  ($sizeMB MB)  --  $($files.Count) files" -ForegroundColor Green
