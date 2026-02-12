param(
    [switch]$Force,
    [string]$Release = "latest",
    [string]$ArchivePath,
    [string]$ArchiveSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step {
    param([string]$Message)
    Write-Host "[mpv] $Message"
}

function Write-FallbackInstructions {
    param([string]$TargetDir)

    Write-Host "[mpv] Fallback: place MPV runtime files manually in '$TargetDir'."
    Write-Host "[mpv] Required files: mpv.exe and one of libmpv-2.dll / mpv-2.dll / mpv-1.dll."
    Write-Host "[mpv] You can also rerun with a local archive:"
    Write-Host "[mpv]   powershell -File scripts/windows/download_mpv_windows.ps1 -ArchivePath C:\path\to\mpv-x86_64-*.7z"
    Write-Host "[mpv] Or set env vars before running ensure_mpv_windows.bat:"
    Write-Host "[mpv]   set TANKOBAN_MPV_ARCHIVE_PATH=C:\path\to\archive_or_folder"
    Write-Host "[mpv]   set TANKOBAN_MPV_ARCHIVE_SHA256=<optional_sha256>"
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

function Normalize-Sha256 {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    return $Value.Trim().ToLowerInvariant()
}

function Read-Sha256FromFile {
    param(
        [string]$FilePath,
        [string]$FileName
    )

    if (-not (Test-Path $FilePath)) { return $null }
    foreach ($line in Get-Content -Path $FilePath) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^([a-fA-F0-9]{64})\s+\*?(.+)$') {
            $hash = $matches[1].ToLowerInvariant()
            $name = [System.IO.Path]::GetFileName($matches[2].Trim())
            if ($name -ieq $FileName) {
                return $hash
            }
        }
    }

    return $null
}

function Resolve-ChecksumAsset {
    param([array]$Assets)
    return ($Assets | Where-Object { $_.name -match '(sha256|checksums?)' -and $_.name -match '\.(txt|sha256|sha256sum)$' } | Select-Object -First 1)
}

function Get-ExpectedSha256 {
    param(
        [pscustomobject]$Asset,
        [array]$AllAssets,
        [string]$TempRoot,
        [string]$ExplicitSha256
    )

    $normalizedExplicit = Normalize-Sha256 -Value $ExplicitSha256
    if ($normalizedExplicit) {
        if ($normalizedExplicit -notmatch '^[a-f0-9]{64}$') {
            throw "Provided checksum '$ExplicitSha256' is not a valid SHA256 hex string."
        }
        return $normalizedExplicit
    }

    $checksumAsset = Resolve-ChecksumAsset -Assets $AllAssets
    if (-not $checksumAsset) { return $null }

    $checksumsPath = Join-Path $TempRoot $checksumAsset.name
    Write-Step "Downloading checksum manifest '$($checksumAsset.name)'..."
    Invoke-WebRequest -Uri $checksumAsset.browser_download_url -Headers $script:headers -OutFile $checksumsPath
    return Read-Sha256FromFile -FilePath $checksumsPath -FileName $Asset.name
}

function Verify-Checksum {
    param(
        [string]$ArchivePath,
        [string]$ExpectedSha256,
        [string]$AssetName
    )

    if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
        Write-Step "No checksum found for '$AssetName'; skipping checksum verification."
        return
    }

    $actual = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
        throw "Checksum mismatch for '$AssetName'. Expected '$ExpectedSha256' but got '$actual'."
    }

    Write-Step "Checksum verified for '$AssetName'."
}

function Download-And-Extract {
    param(
        [pscustomobject]$Asset,
        [string]$TempRoot,
        [string]$Name,
        [array]$AllAssets,
        [string]$ExplicitSha256
    )

    $archivePath = Join-Path $TempRoot $Asset.name
    $extractRoot = Join-Path $TempRoot $Name
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

    Write-Step "Downloading '$($Asset.name)'..."
    Invoke-WebRequest -Uri $Asset.browser_download_url -Headers $script:headers -OutFile $archivePath

    $expectedHash = Get-ExpectedSha256 -Asset $Asset -AllAssets $AllAssets -TempRoot $TempRoot -ExplicitSha256 $ExplicitSha256
    Verify-Checksum -ArchivePath $archivePath -ExpectedSha256 $expectedHash -AssetName $Asset.name

    Write-Step "Extracting '$($Asset.name)'..."
    Expand-AnyArchive -ArchivePath $archivePath -DestinationDir $extractRoot
    return $extractRoot
}

function Resolve-ArchivePathInput {
    param([string]$ArchivePathArg)

    if (-not [string]::IsNullOrWhiteSpace($ArchivePathArg)) {
        return $ArchivePathArg
    }

    if (-not [string]::IsNullOrWhiteSpace($env:TANKOBAN_MPV_ARCHIVE_PATH)) {
        return $env:TANKOBAN_MPV_ARCHIVE_PATH
    }

    if (-not [string]::IsNullOrWhiteSpace($env:MPV_ARCHIVE_PATH)) {
        return $env:MPV_ARCHIVE_PATH
    }

    return $null
}

function Resolve-ArchiveSha256Input {
    param([string]$ArchiveShaArg)

    if (-not [string]::IsNullOrWhiteSpace($ArchiveShaArg)) {
        return $ArchiveShaArg
    }

    if (-not [string]::IsNullOrWhiteSpace($env:TANKOBAN_MPV_ARCHIVE_SHA256)) {
        return $env:TANKOBAN_MPV_ARCHIVE_SHA256
    }

    if (-not [string]::IsNullOrWhiteSpace($env:MPV_ARCHIVE_SHA256)) {
        return $env:MPV_ARCHIVE_SHA256
    }

    return $null
}

function Resolve-LocalArchive {
    param(
        [string]$ArchiveInput,
        [string]$Release,
        [string]$TempRoot
    )

    if ([string]::IsNullOrWhiteSpace($ArchiveInput)) { return $null }
    if (-not (Test-Path $ArchiveInput)) {
        throw "Archive path '$ArchiveInput' does not exist."
    }

    $resolved = (Resolve-Path $ArchiveInput).Path
    if (Test-Path $resolved -PathType Leaf) {
        return [pscustomobject]@{ Archive = $resolved; Name = [System.IO.Path]::GetFileName($resolved) }
    }

    $patterns = @('mpv-x86_64-*.7z', 'mpv-x86_64-*.zip')
    if ($Release -and $Release -ne 'latest') {
        $patterns = @("mpv-x86_64-$Release*.7z", "mpv-x86_64-$Release*.zip") + $patterns
    }

    $files = @()
    foreach ($pattern in $patterns) {
        $files += Get-ChildItem -Path $resolved -File -Filter $pattern -ErrorAction SilentlyContinue
    }

    if ($files.Count -eq 0) {
        throw "No runtime archive matching mpv-x86_64-*.7z|*.zip found in '$resolved'."
    }

    $selected = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Step "Using local archive '$($selected.FullName)'."
    $copyPath = Join-Path $TempRoot $selected.Name
    Copy-Item -Path $selected.FullName -Destination $copyPath -Force
    return [pscustomobject]@{ Archive = $copyPath; Name = $selected.Name }
}

function Extract-LocalArchive {
    param(
        [string]$ArchivePath,
        [string]$ArchiveName,
        [string]$TempRoot,
        [string]$ExpectedSha256
    )

    Verify-Checksum -ArchivePath $ArchivePath -ExpectedSha256 (Normalize-Sha256 -Value $ExpectedSha256) -AssetName $ArchiveName

    $extractRoot = Join-Path $TempRoot "runtime"
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Write-Step "Extracting local archive '$ArchiveName'..."
    Expand-AnyArchive -ArchivePath $ArchivePath -DestinationDir $extractRoot
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

try {
    $script:devExtract = $null

    if ((-not $Force) -and (Has-MpvPayload -Dir $targetDir)) {
        Write-Step "MPV runtime already present at '$targetDir'."
        exit 0
    }

    $archivePathInput = Resolve-ArchivePathInput -ArchivePathArg $ArchivePath
    $archiveShaInput = Resolve-ArchiveSha256Input -ArchiveShaArg $ArchiveSha256

    $tempRoot = Join-Path $env:TEMP "tankoban-mpv-download"
    if (Test-Path $tempRoot) {
        Remove-Item -Path $tempRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

    if ($archivePathInput) {
        $localArchive = Resolve-LocalArchive -ArchiveInput $archivePathInput -Release $Release -TempRoot $tempRoot
        $runtimeExtract = Extract-LocalArchive -ArchivePath $localArchive.Archive -ArchiveName $localArchive.Name -TempRoot $tempRoot -ExpectedSha256 $archiveShaInput
    } else {
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
        $runtimeExtract = Download-And-Extract -Asset $runtimeAsset -TempRoot $tempRoot -Name "runtime" -AllAssets $assets -ExplicitSha256 $archiveShaInput

        if ($devAsset) {
            $script:devExtract = Download-And-Extract -Asset $devAsset -TempRoot $tempRoot -Name "dev" -AllAssets $assets -ExplicitSha256 $null
        }
    }

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
        if (-not $script:devExtract) {
            throw "Runtime archive does not include libmpv DLL. Provide a full runtime archive that includes it, or place libmpv-2.dll manually in '$targetDir'."
        }

        $devDir = Resolve-DirContaining -Root $script:devExtract -FileName "libmpv-2.dll"
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
}
catch {
    Write-Host "[mpv] ERROR: $($_.Exception.Message)"
    Write-FallbackInstructions -TargetDir $targetDir
    exit 1
}
