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
if ($Version -cnotmatch '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?\z') {
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

# Read and write the persistent user PATH from the registry, never the merged
# process PATH, so machine entries are not copied into it and %VARIABLE%
# references stay unexpanded. Callers may predefine these functions.
if (-not (Get-Command Get-CatlexUserPath -CommandType Function -ErrorAction SilentlyContinue)) {
  function Get-CatlexUserPath {
    $Key = Get-Item -Path 'HKCU:\Environment'
    $Key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  }
}
if (-not (Get-Command Set-CatlexUserPath -CommandType Function -ErrorAction SilentlyContinue)) {
  function Set-CatlexUserPath {
    param([string]$Value)
    Set-ItemProperty -Path 'HKCU:\Environment' -Name 'Path' -Value $Value -Type ExpandString
    # Tell Explorer and other top-level windows that the environment changed.
    try {
      if (-not ('Catlex.NativeMethods' -as [type])) {
        Add-Type -Namespace Catlex -Name NativeMethods -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
      }
      $Result = [UIntPtr]::Zero
      [void][Catlex.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$Result)
    } catch {
      Write-Verbose "Could not broadcast the environment change: $_"
    }
  }
}

function Format-CatlexPathEntry {
  param([string]$Entry)
  [Environment]::ExpandEnvironmentVariables($Entry.Trim().Trim('"')).TrimEnd('\')
}

function Test-CatlexPathContains {
  param([string]$PathValue, [string]$Directory)
  $Wanted = Format-CatlexPathEntry $Directory
  foreach ($Entry in ($PathValue -split ';')) {
    if ($Entry -and ((Format-CatlexPathEntry $Entry) -ieq $Wanted)) { return $true }
  }
  return $false
}

function Write-CatlexManualPathHelp {
  Write-Host "Run catlex with its full path: $BinaryPath"
  Write-Host "Or add $InstallDir to your user PATH in System Properties > Environment Variables."
}

if (-not (Test-CatlexPathContains $env:PATH $InstallDir)) {
  # The installer runs in the caller's process, so this session can use catlex right away.
  $env:PATH = "$InstallDir;$env:PATH"
}

$UserPathError = $null
$UserPath = $null
try { $UserPath = Get-CatlexUserPath } catch { $UserPathError = $_ }

if (-not $UserPathError -and (Test-CatlexPathContains $UserPath $InstallDir)) {
  # Already configured; nothing to change.
} elseif ($env:CATLEX_NO_MODIFY_PATH -eq '1' -or $env:CI) {
  Write-Host ""
  Write-Host "Warning: $InstallDir is not in your user PATH; leaving it unchanged."
  Write-CatlexManualPathHelp
} else {
  try {
    if ($UserPathError) { throw $UserPathError }
    $Trimmed = if ($UserPath) { $UserPath.TrimEnd(';') } else { '' }
    $NewUserPath = if ($Trimmed) { "$Trimmed;$InstallDir" } else { $InstallDir }
    Set-CatlexUserPath $NewUserPath
    Write-Host ""
    Write-Host "Added $InstallDir to your user PATH."
    Write-Host "catlex works in this PowerShell session now. Other open terminals keep their old PATH:"
    Write-Host "open a new terminal, and restart VS Code (or Windows Terminal) completely if you use its terminal."
  } catch {
    Write-Host ""
    Write-Warning "Could not add $InstallDir to your user PATH: $_"
    Write-CatlexManualPathHelp
  }
}
