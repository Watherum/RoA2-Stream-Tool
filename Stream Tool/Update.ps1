# RoA2 Stream Tool Updater
# Place this script in the "Stream Tool" folder and run it to check for updates.

$repo = "Watherum/RoA2-Stream-Tool"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"
$scriptDir = $PSScriptRoot

function Pause-Exit($code) {
    Write-Host "`nPress any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit $code
}

Write-Host "=============================" -ForegroundColor Cyan
Write-Host "  RoA2 Stream Tool Updater   " -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

# --- Determine current version from exe filename ---
$exe = Get-ChildItem -Path $scriptDir -Filter "RoA2 Stream Tool *.exe" | Select-Object -First 1
if (-not $exe) {
    Write-Host "ERROR: Could not find 'RoA2 Stream Tool *.exe' in this folder." -ForegroundColor Red
    Write-Host "Make sure Update.ps1 is inside the 'Stream Tool' folder."
    Pause-Exit 1
}

$currentVersion = $exe.BaseName -replace "^RoA2 Stream Tool\s+", ""
Write-Host "Current version : $currentVersion"

# --- Fetch latest release from GitHub API ---
Write-Host "Checking for updates..."
try {
    $headers = @{ "User-Agent" = "RoA2-Stream-Tool-Updater" }
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -ErrorAction Stop
} catch {
    Write-Host "ERROR: Could not reach GitHub API. Check your internet connection." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Pause-Exit 1
}

$latestTag    = $release.tag_name -replace "^v", ""
$releaseNotes = $release.body
Write-Host "Latest version  : $latestTag"
Write-Host ""

# --- Compare ---
try {
    $current = [version]$currentVersion
    $latest  = [version]$latestTag
} catch {
    Write-Host "ERROR: Could not parse version numbers ('$currentVersion' vs '$latestTag')." -ForegroundColor Red
    Pause-Exit 1
}

if ($latest -le $current) {
    Write-Host "You are already up to date!" -ForegroundColor Green
    Pause-Exit 0
}

Write-Host "Update available: $currentVersion  ->  $latestTag" -ForegroundColor Yellow
if ($releaseNotes) {
    Write-Host ""
    Write-Host "--- Release Notes ---" -ForegroundColor DarkCyan
    Write-Host ($releaseNotes -split "`n" | Select-Object -First 20 | Out-String).Trim()
    Write-Host "---------------------" -ForegroundColor DarkCyan
}
Write-Host ""

# --- Find zip asset ---
$zipAsset = $release.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
if (-not $zipAsset) {
    Write-Host "ERROR: No .zip asset found attached to the latest release." -ForegroundColor Red
    Pause-Exit 1
}
Write-Host "Release asset   : $($zipAsset.name)  ($([math]::Round($zipAsset.size / 1MB, 1)) MB)"
Write-Host ""

$confirm = Read-Host "Download and install this update? (y/n)"
if ($confirm.Trim().ToLower() -ne "y") {
    Write-Host "Update cancelled."
    Pause-Exit 0
}
Write-Host ""

# --- Set up temp working directory ---
$tempBase = [System.IO.Path]::GetTempPath()
$tempDir  = Join-Path $tempBase ("RoA2ST_Update_" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tempDir | Out-Null

# --- Backup user data ---
$userDataPaths = @(
    "Resources\Texts\GUI Settings.json",
    "Resources\Texts\Player Info",
    "Resources\Texts\Commentator Info",
    "Resources\Texts\Plugin List.json"
)

$backupDir = Join-Path $tempDir "backup"
New-Item -ItemType Directory -Path $backupDir | Out-Null
Write-Host "Backing up user data..."

foreach ($rel in $userDataPaths) {
    $src  = Join-Path $scriptDir $rel
    $dest = Join-Path $backupDir $rel
    if (Test-Path $src) {
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Force -Path $destParent | Out-Null }
        Copy-Item -Recurse -Force -Path $src -Destination $dest
        Write-Host "  Backed up: $rel" -ForegroundColor DarkGray
    }
}

# --- Download ---
$zipPath = Join-Path $tempDir "update.zip"
Write-Host "Downloading update..."
try {
    Invoke-WebRequest -Uri $zipAsset.browser_download_url -OutFile $zipPath -ErrorAction Stop
} catch {
    Write-Host "ERROR: Download failed." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Remove-Item -Recurse -Force $tempDir
    Pause-Exit 1
}

# --- Extract ---
$extractDir = Join-Path $tempDir "extracted"
Write-Host "Extracting..."
try {
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -ErrorAction Stop
} catch {
    Write-Host "ERROR: Extraction failed." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Remove-Item -Recurse -Force $tempDir
    Pause-Exit 1
}

# Detect zip structure: either extracted/Stream Tool/* or extracted/*
$streamToolDir = Join-Path $extractDir "Stream Tool"
if (-not (Test-Path $streamToolDir)) {
    # Zip may extract contents directly (no "Stream Tool" wrapper)
    $streamToolDir = $extractDir
}

# --- Delete old exe before copying new one ---
Write-Host "Removing old executable..."
try {
    Remove-Item -Force -Path $exe.FullName -ErrorAction Stop
} catch {
    Write-Host "WARNING: Could not remove old exe. The app may still be running." -ForegroundColor Yellow
    Write-Host "Close RoA2 Stream Tool and try again."
    Remove-Item -Recurse -Force $tempDir
    Pause-Exit 1
}

# --- Copy new files ---
Write-Host "Installing new files..."
Copy-Item -Recurse -Force -Path (Join-Path $streamToolDir "*") -Destination $scriptDir

# --- Restore user data ---
Write-Host "Restoring user data..."
foreach ($rel in $userDataPaths) {
    $backupPath = Join-Path $backupDir $rel
    if (Test-Path $backupPath) {
        $dest       = Join-Path $scriptDir $rel
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Force -Path $destParent | Out-Null }
        if ((Get-Item $backupPath).PSIsContainer) {
            if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
            Copy-Item -Recurse -Force -Path (Join-Path $backupPath "*") -Destination $dest
        } else {
            Copy-Item -Recurse -Force -Path $backupPath -Destination $dest
        }
        Write-Host "  Restored: $rel" -ForegroundColor DarkGray
    }
}

# --- Cleanup ---
Remove-Item -Recurse -Force $tempDir

Write-Host ""
Write-Host "=============================" -ForegroundColor Green
Write-Host "  Update complete!  v$latestTag  " -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green
Pause-Exit 0
