#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Repo = "Hammertail/catlex"
$AssetName = "catlex-windows-x64.exe"
$InstallDir = if ($env:CATLEX_INSTALL_DIR) { $env:CATLEX_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "catlex\bin" }
$BinaryPath = Join-Path $InstallDir "catlex.exe"

$Version = $env:CATLEX_VERSION
if (-not $Version -or $Version -eq "latest") {
  $Release = Invoke-WebRequest -Uri "https://github.com/$Repo/releases/latest" -Method Head -MaximumRedirection 10 -UseBasicParsing
  # Windows PowerShell 5 uses ResponseUri; PowerShell 7 uses RequestMessage.
  $ReleaseUri = if ($Release.BaseResponse.ResponseUri) { $Release.BaseResponse.ResponseUri } else { $Release.BaseResponse.RequestMessage.RequestUri }
  $Version = $ReleaseUri.AbsolutePath.Split('/')[-1]
}
$Version = $Version -creplace '^v', ''
if ($Version -cnotmatch '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$') {
  throw "Invalid release version: $Version"
}
$BaseUrl = "https://github.com/$Repo/releases/download/v$Version"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("catlex-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $TempDir | Out-Null
$TempFile = Join-Path $TempDir $AssetName
try {
  Write-Host "Downloading catlex (windows/x64) $Version..."
  Invoke-WebRequest -Uri "$BaseUrl/$AssetName" -OutFile $TempFile -UseBasicParsing
  $ManifestPath = Join-Path $TempDir "SHA256SUMS"
  Invoke-WebRequest -Uri "$BaseUrl/SHA256SUMS" -OutFile $ManifestPath -UseBasicParsing
  $Entries = @(Get-Content $ManifestPath | Where-Object { $_ -cmatch "^[0-9a-fA-F]{64}  $([regex]::Escape($AssetName))$" })
  if ($Entries.Count -ne 1) { throw "Missing or ambiguous checksum for $AssetName" }
  $ExpectedHash = ($Entries[0] -split ' ')[0]
  $ActualHash = (Get-FileHash -Algorithm SHA256 $TempFile).Hash
  if ($ActualHash -ine $ExpectedHash) { throw "Checksum verification failed for $AssetName" }
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Move-Item -Force -Path $TempFile -Destination $BinaryPath
} finally {
  Remove-Item -Recurse -Force $TempDir
}

Write-Host "Installed $BinaryPath"

$PathEntries = $env:PATH -split ";"
if ($PathEntries -notcontains $InstallDir) {
  Write-Host ""
  Write-Host "Warning: $InstallDir is not in your PATH."
  Write-Host "Add it for the current user, then restart your shell:"
  Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$InstallDir', 'User')"
}
