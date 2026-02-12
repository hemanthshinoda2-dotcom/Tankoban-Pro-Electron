param(
    [switch]$Force,
    [string]$Release = "latest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step {
    param([string]$Message)
    Write-Host "[mpv] $Message"
}

function Has-LibmpvDll {
    param([string]$Dir)
    if (Test-Path (Join-Path $Dir "libmpv-2.dll")) { return $true }
    if (Test-Path (Join-Path $Dir "mpv-2.dll")) { return $true }
    if (Test-Path (Join-Path $Dir "mpv-1.dll")) { return $true }
    return $false
}

function Has-MpvExe {
    param([string]$Dir)
    return (Test-Path (Join-Path $Dir "mpv.exe"))
}

function Has-MpvPayload {
    param([string]$Dir)
    return ((Has-MpvExe -Dir $Dir) -and (Has-LibmpvDll -Dir $Dir))
}

function Expand-AnyArchive {
    param(
        [string]$ArchivePath,
        [string]$DestinationDir
    )

    $ext = [System.IO.Path]::GetExtension($ArchivePath).ToLowerInvariant()
    if ($ext -eq ".zip") {
        Expand-Archive -Path $ArchivePath -DestinationPath $DestinationDir -Force
        return
    }

    $sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
    if ($sevenZip) {
        & $sevenZip.Source x $ArchivePath "-o$DestinationDir" -y | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "7z extraction failed with exit code $LASTEXITCODE."
        }
        return
    }

    $tarCmd = Get-Command tar -ErrorAction SilentlyContinue
    if ($tarCmd) {
        & $tarCmd.Source -xf $ArchivePath -C $DestinationDir
        if ($LASTEXITCODE -ne 0) {
            throw "tar extraction failed with exit code $LASTEXITCODE."
        }
        return
    }

    throw "No supported extractor found for '$ArchivePath'. Install 7-Zip or use Windows tar."
}

function Select-PreferredAsset {
    param(
        [array]$Assets,
        [string]$Pattern
    )

    $matches = @($Assets | Where-Object { $_.name -match $Pattern })
    if ($matches.Count -eq 0) { return $null }

    $nonV3 = @($matches | Where-Object { $_.name -notmatch "-v3-" })
    if ($nonV3.Count -gt 0) {
        return $nonV3[0]
    }
    return $matches[0]
}

function Download-And-Extract {
    param(
        [pscustomobject]$Asset,
        [string]$TempRoot,
        [string]$Name
    )

    $archivePath = Join-Path $TempRoot $Asset.name
    $extractRoot = Join-Path $TempRoot $Name
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

    Write-Step "Downloading '$($Asset.name)'..."
    Invoke-WebRequest -Uri $Asset.browser_download_url -Headers $script:headers -OutFile $archivePath

    Write-Step "Extracting '$($Asset.name)'..."
    Expand-AnyArchive -ArchivePath $archivePath -DestinationDir $extractRoot
    return $extractRoot
}

function Resolve-DirContaining {
    param(
        [string]$Root,
        [string]$FileName
    )

    $files = @(Get-ChildItem -Path $Root -Recurse -File -Filter $FileName -ErrorAction SilentlyContinue)
    if ($files.Count -eq 0) { return $null }
    return $files[0].Directory.FullName
}

Write-Step "Preparing MPV runtime directory..."
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$targetDir = Join-Path $repoRoot "app\resources\mpv\windows"
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

if ((-not $Force) -and (Has-MpvPayload -Dir $targetDir)) {
    Write-Step "MPV runtime already present at '$targetDir'."
    exit 0
}

$apiUrl = if ($Release -eq "latest") {
    "https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest"
} else {
    "https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/tags/$Release"
}

$script:headers = @{
    "User-Agent" = "tankoban-pro-electron"
    "Accept"     = "application/vnd.github+json"
}

Write-Step "Fetching release metadata..."
$releaseInfo = Invoke-RestMethod -Uri $apiUrl -Headers $script:headers
$assets = @($releaseInfo.assets)
if ($assets.Count -eq 0) {
    throw "Release '$Release' has no downloadable assets."
}

$runtimeAsset = Select-PreferredAsset -Assets $assets -Pattern "^mpv-x86_64-.*\.(7z|zip)$"
if (-not $runtimeAsset) {
    throw "Could not find an x64 runtime MPV asset in release '$($releaseInfo.tag_name)'."
}

$devAsset = Select-PreferredAsset -Assets $assets -Pattern "^mpv-dev-x86_64-.*\.(7z|zip)$"

$tempRoot = Join-Path $env:TEMP "tankoban-mpv-download"
if (Test-Path $tempRoot) {
    Remove-Item -Path $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$runtimeExtract = Download-And-Extract -Asset $runtimeAsset -TempRoot $tempRoot -Name "runtime"
$runtimeDir = Resolve-DirContaining -Root $runtimeExtract -FileName "mpv.exe"
if (-not $runtimeDir) {
    throw "Runtime archive does not contain mpv.exe."
}

Write-Step "Installing runtime files to '$targetDir'..."
$keepFiles = @(".gitkeep", "README.md")
Get-ChildItem -Path $targetDir -Force -ErrorAction SilentlyContinue |
    Where-Object { $keepFiles -notcontains $_.Name } |
    Remove-Item -Recurse -Force

Copy-Item -Path (Join-Path $runtimeDir "*") -Destination $targetDir -Recurse -Force

if (-not (Has-LibmpvDll -Dir $targetDir)) {
    if (-not $devAsset) {
        throw "Runtime archive does not include libmpv DLL and no dev archive is available."
    }

    $devExtract = Download-And-Extract -Asset $devAsset -TempRoot $tempRoot -Name "dev"
    $devDir = Resolve-DirContaining -Root $devExtract -FileName "libmpv-2.dll"
    if (-not $devDir) {
        throw "Dev archive does not contain libmpv-2.dll."
    }

    Write-Step "Adding libmpv files from dev archive..."
    Copy-Item -Path (Join-Path $devDir "libmpv-2.dll") -Destination $targetDir -Force

    if (Test-Path (Join-Path $devDir "libmpv.dll.a")) {
        Copy-Item -Path (Join-Path $devDir "libmpv.dll.a") -Destination $targetDir -Force
    }
    if (Test-Path (Join-Path $devDir "include")) {
        Copy-Item -Path (Join-Path $devDir "include") -Destination $targetDir -Recurse -Force
    }
}

if (-not (Has-MpvPayload -Dir $targetDir)) {
    throw "MPV payload validation failed after install."
}

Write-Step "MPV runtime is ready."
exit 0
