<#
.SYNOPSIS
  Compile l'installeur Windows Factorealm-Setup-x64.exe avec Inno Setup 6 (a executer sur Windows).
#>
param(
  [string]$IsccPath = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

Write-Host "[1/3] Installation des dependances et compilation du frontend..."
$RequiredNative = @(
  "node_modules\@esbuild\win32-x64",
  "node_modules\@rolldown\binding-win32-x64-msvc",
  "node_modules\@tailwindcss\oxide-win32-x64-msvc",
  "node_modules\@typescript\typescript-win32-x64"
)
$MissingNative = $RequiredNative | Where-Object { -not (Test-Path $_) }
if ((Test-Path "package-lock.json") -or $MissingNative.Count -gt 0) {
  Write-Host "      Reinitialisation propre (suppression package-lock.json / node_modules) pour Windows x64..."
  Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
}
& npm.cmd install --include=optional
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/3] Recherche du compilateur Inno Setup (ISCC.exe)..."
function Find-InnoSetupCompiler {
  param([string]$ExplicitPath)

  $Candidates = New-Object System.Collections.Generic.List[string]
  if ($ExplicitPath) { $Candidates.Add($ExplicitPath) }
  if ($env:INNO_ISCC_PATH) { $Candidates.Add($env:INNO_ISCC_PATH) }

  # Chemins standards (installation par utilisateur dans LocalAppData ou machine dans Program Files)
  @(
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe" }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Inno Setup 6\ISCC.exe" }),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe" }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe" }),
    $(if ($env:ProgramW6432) { Join-Path $env:ProgramW6432 "Inno Setup 6\ISCC.exe" }),
    "C:\Inno Setup 6\ISCC.exe",
    $(if ($env:USERPROFILE) { Join-Path $env:USERPROFILE "scoop\apps\innosetup\current\ISCC.exe" }),
    $(if ($env:ProgramData) { Join-Path $env:ProgramData "chocolatey\lib\innosetup\tools\ISCC.exe" })
  ) | Where-Object { $_ } | ForEach-Object { $Candidates.Add($_) }

  # PATH (ISCC.exe ou Compil32.exe situe dans le meme dossier)
  $CmdIscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
  if ($CmdIscc) { $Candidates.Add($CmdIscc) }
  $CmdCompil = Get-Command Compil32.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
  if ($CmdCompil) { $Candidates.Add((Join-Path (Split-Path $CmdCompil -Parent) "ISCC.exe")) }

  # Cles Uninstall du Registre (HKCU / HKLM / WOW6432Node)
  $UninstallRoots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($Root in $UninstallRoots) {
    Get-ItemProperty -Path $Root -ErrorAction SilentlyContinue | Where-Object {
      $_.PSChildName -like "Inno Setup 6*" -or $_.DisplayName -like "Inno Setup*6*"
    } | ForEach-Object {
      if ($_.InstallLocation) {
        $Candidates.Add((Join-Path $_.InstallLocation "ISCC.exe"))
      }
      if ($_.InnoSetupAppPath) {
        $Candidates.Add((Join-Path $_.InnoSetupAppPath "ISCC.exe"))
      }
    }
  }

  # Association de fichier .iss et App Paths
  $ClassKeys = @(
    "HKCU:\Software\Classes\InnoSetupScriptFile\shell\Compile\command",
    "HKCU:\Software\Classes\InnoSetupScriptFile\shell\open\command",
    "HKLM:\SOFTWARE\Classes\InnoSetupScriptFile\shell\Compile\command",
    "HKLM:\SOFTWARE\Classes\InnoSetupScriptFile\shell\open\command"
  )
  foreach ($Key in $ClassKeys) {
    $Val = (Get-ItemProperty -Path $Key -ErrorAction SilentlyContinue).'(default)'
    if ($Val -and $Val -match '"([^"]+\.exe)"') {
      $Candidates.Add((Join-Path (Split-Path $Matches[1] -Parent) "ISCC.exe"))
    }
  }

  $AppPathKeys = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Compil32.exe",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Compil32.exe"
  )
  foreach ($Key in $AppPathKeys) {
    $Exe = (Get-ItemProperty -Path $Key -ErrorAction SilentlyContinue).'(default)'
    if ($Exe) {
      $Candidates.Add((Join-Path (Split-Path $Exe -Parent) "ISCC.exe"))
    }
  }

  return ($Candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}

$Iscc = Find-InnoSetupCompiler -ExplicitPath $IsccPath
if (-not $Iscc) {
  Write-Host ""
  Write-Host "ISCC.exe (Inno Setup 6) est introuvable automatiquement." -ForegroundColor Yellow
  Write-Host "Options :"
  Write-Host "  1. Installer Inno Setup 6 via winget :"
  Write-Host "     winget install --id JRSoftware.InnoSetup -e"
  Write-Host "  2. Ou indiquer le chemin manuel :"
  Write-Host "     powershell -ExecutionPolicy Bypass -File .\installer\windows\build-inno.ps1 -IsccPath `"C:\chemin\vers\ISCC.exe`""
  Write-Host "  3. Note : dist\ est deja compile - vous pouvez aussi ouvrir installer\windows\factorealm.iss dans Inno Setup Compiler et cliquer sur Compile."
  exit 1
}

Write-Host "[3/3] Compilation de l'installeur .exe via $Iscc..."
& $Iscc "installer\windows\factorealm.iss"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Installeur genere dans dist-packages\."
