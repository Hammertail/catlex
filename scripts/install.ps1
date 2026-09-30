#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Repo = "Hammertail/catlex"
$AssetName = "catlex-windows-x64.exe"
$InstallDir = Join-Path $env:LOCALAPPDATA "catlex\bin"
$BinaryPath = Join-Path $InstallDir "catlex.exe"

if ($env:CATLEX_VERSION) {
  $Version = $env:CATLEX_VERSION.TrimStart("v")
  $ReleaseBase = "https://github.com/$Repo/releases/download/v$Version"
  $DownloadUrl = "$ReleaseBase/$AssetName"
  $ChecksumsUrl = "$ReleaseBase/SHA256SUMS"
} else {
  $DownloadUrl = "https://github.com/$Repo/releases/latest/download/$AssetName"
  $ChecksumsUrl = "https://github.com/$Repo/releases/latest/download/SHA256SUMS"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$TempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("catlex-" + [guid]::NewGuid().ToString() + ".exe")
$ChecksumsFile = Join-Path ([System.IO.Path]::GetTempPath()) ("catlex-sha256sums-" + [guid]::NewGuid().ToString() + ".txt")
try {
  Write-Host "Downloading catlex (windows/x64) from $DownloadUrl..."
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFile -UseBasicParsing

  if ($env:CATLEX_SKIP_CHECKSUM -eq "1") {
    Write-Host "Skipping checksum verification (CATLEX_SKIP_CHECKSUM=1)."
  } else {
    try {
      Invoke-WebRequest -Uri $ChecksumsUrl -OutFile $ChecksumsFile -UseBasicParsing
      $ChecksumLine = Get-Content -Path $ChecksumsFile | Where-Object { $_ -match ("\s" + [regex]::Escape($AssetName) + "\s*$") } | Select-Object -First 1
      if (-not $ChecksumLine) {
        throw "Error: $AssetName is missing from SHA256SUMS"
      }
      $Expected = ($ChecksumLine -split "\s+")[0].ToLowerInvariant()
      $Actual = (Get-FileHash -Path $TempFile -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($Expected -ne $Actual) {
        throw "Error: checksum mismatch for $AssetName (expected $Expected, actual $Actual)"
      }
      Write-Host "Checksum verified for $AssetName."
    } catch {
      if ($env:CATLEX_REQUIRE_CHECKSUM -eq "1") {
        throw
      }
      if ($_.Exception.Message -like "Error:*") {
        throw
      }
      Write-Warning "SHA256SUMS not found at $ChecksumsUrl; skipping integrity check."
      Write-Warning "Set CATLEX_REQUIRE_CHECKSUM=1 in CI to fail closed once checksums are published."
    }
  }

  Move-Item -Force -Path $TempFile -Destination $BinaryPath
} finally {
  if (Test-Path $TempFile) {
    Remove-Item -Force $TempFile
  }
  if (Test-Path $ChecksumsFile) {
    Remove-Item -Force $ChecksumsFile
  }
}

Write-Host "Installed $BinaryPath"

$PathEntries = $env:PATH -split ";"
if ($PathEntries -notcontains $InstallDir) {
  Write-Host ""
  Write-Host "Warning: $InstallDir is not in your PATH."
  Write-Host "Add it for the current user, then restart your shell:"
  Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$InstallDir', 'User')"
}
