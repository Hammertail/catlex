#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Repo = "Tamicktom/catlex"
$AssetName = "catlex-windows-x64.exe"
$InstallDir = Join-Path $env:LOCALAPPDATA "catlex\bin"
$BinaryPath = Join-Path $InstallDir "catlex.exe"

if ($env:CATLEX_VERSION) {
  $Version = $env:CATLEX_VERSION.TrimStart("v")
  $DownloadUrl = "https://github.com/$Repo/releases/download/v$Version/$AssetName"
} else {
  $DownloadUrl = "https://github.com/$Repo/releases/latest/download/$AssetName"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$TempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("catlex-" + [guid]::NewGuid().ToString() + ".exe")
try {
  Write-Host "Downloading catlex (windows/x64) from $DownloadUrl..."
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $TempFile -UseBasicParsing
  Move-Item -Force -Path $TempFile -Destination $BinaryPath
} finally {
  if (Test-Path $TempFile) {
    Remove-Item -Force $TempFile
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
