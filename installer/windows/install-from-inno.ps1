param(
  [string]$InstallDir = "",
  [string]$DataDir = "",
  [string]$Port = "",
  [string]$ListenHost = "",
  [string]$InitCompany = "",
  [string]$CompanyName = "",
  [string]$Siret = "",
  [string]$AdminName = "",
  [string]$AdminEmail = "",
  [string]$RegisterTask = ""
)

$ErrorActionPreference = "Continue"

function Pick-Val([string]$ParamVal, [string]$EnvVal, [string]$DefaultVal = "") {
  if ($ParamVal -and $ParamVal.Trim() -ne "") { return $ParamVal.Trim() }
  if ($EnvVal -and $EnvVal.Trim() -ne "") { return $EnvVal.Trim() }
  return $DefaultVal
}

$InstallDir = Pick-Val $InstallDir $env:FACTOREALM_INNO_INSTALL_DIR (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$DataDir = Pick-Val $DataDir $env:FACTOREALM_INNO_DATA_DIR (Join-Path $env:ProgramData "Factorealm\data")
$Port = Pick-Val $Port $env:FACTOREALM_INNO_PORT "3000"
$ListenHost = Pick-Val $ListenHost $env:FACTOREALM_INNO_HOST "127.0.0.1"
$InitCompany = Pick-Val $InitCompany $env:FACTOREALM_INNO_INIT_COMPANY "0"
$CompanyName = Pick-Val $CompanyName $env:FACTOREALM_INNO_COMPANY_NAME ""
$Siret = Pick-Val $Siret $env:FACTOREALM_INNO_SIRET ""
$AdminName = Pick-Val $AdminName $env:FACTOREALM_INNO_ADMIN_NAME ""
$AdminEmail = Pick-Val $AdminEmail $env:FACTOREALM_INNO_ADMIN_EMAIL ""
$RegisterTask = Pick-Val $RegisterTask $env:FACTOREALM_INNO_REGISTER_TASK "0"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$LogPath = Join-Path $DataDir "install.log"
Set-Content -Path $LogPath -Value @(
  "=== Installation Factorealm (Inno Setup) - $(Get-Date -Format o) ===",
  "InstallDir=$InstallDir",
  "DataDir=$DataDir",
  "Port=$Port Host=$ListenHost"
) -Encoding UTF8

try {
  # Rafraichir le PATH depuis le Registre + dossiers Node 64-bit / 32-bit / utilisateur
  $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $NodeCandidates = @(
    $(if ($env:ProgramW6432) { Join-Path $env:ProgramW6432 "nodejs" }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles "nodejs" }),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "nodejs" }),
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "Programs\nodejs" }),
    $(if ($env:NVM_SYMLINK) { $env:NVM_SYMLINK })
  ) | Where-Object { $_ -and (Test-Path $_) }

  $PathParts = @()
  $PathParts += $NodeCandidates
  if ($MachinePath) { $PathParts += $MachinePath }
  if ($UserPath) { $PathParts += $UserPath }
  $env:Path = ($PathParts -join ";")

  $NodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $NodeCmd) { $NodeCmd = Get-Command node -ErrorAction SilentlyContinue }
  if (-not $NodeCmd) {
    throw "Node.js v22+ reste introuvable apres l'etape prerequis. PATH=$env:Path"
  }
  $NodeExe = $NodeCmd.Source

  $NpmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $NpmCmd) {
    throw "npm.cmd reste introuvable dans le PATH ($env:Path)."
  }

  Set-Location $InstallDir

  # Toujours repartir sans package-lock.json herite d'un autre OS pour installer les binaires natifs Windows
  Remove-Item -Force (Join-Path $InstallDir "package-lock.json") -ErrorAction SilentlyContinue

  $ArgsList = @(
    "--no-warnings",
    "installer\install.mjs",
    "--yes",
    "--install-dir=$InstallDir",
    "--data-dir=$DataDir",
    "--port=$Port",
    "--host=$ListenHost",
    "--skip-tests",
    "--skip-shortcuts",
    "--skip-path"
  )

  if (Test-Path (Join-Path $InstallDir "dist\index.html")) {
    $ArgsList += "--skip-build"
    $ArgsList += "--omit-dev"
  }

  if ($InitCompany -eq "1") {
    $ArgsList += "--init-company"
    $ArgsList += "--company-name=$CompanyName"
    if ($Siret) { $ArgsList += "--siret=$Siret" }
    $ArgsList += "--admin-name=$AdminName"
    $ArgsList += "--admin-email=$AdminEmail"
    $ArgsList += "--admin-password-env=FACTOREALM_INNO_ADMIN_PASS"
  } else {
    $ArgsList += "--no-init-company"
  }

  # Capturer stdout + stderr sans declencher NativeCommandError (ErrorActionPreference = Continue)
  $RawLines = & $NodeExe @ArgsList 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) {
      $_.ToString()
    } else {
      [string]$_
    }
  }
  $NodeExitCode = $LASTEXITCODE
  $OutputText = ($RawLines -join "`r`n")

  # Masquer toute eventuelle ligne de cle de recuperation du fichier journal permanent
  $SafeLog = ($OutputText -split "`r?`n" | Where-Object { $_ -notmatch "FRK-" }) -join "`r`n"
  Add-Content -Path $LogPath -Value $SafeLog -Encoding UTF8

  if ($NodeExitCode -ne 0) {
    throw "Echec de l'installation Factorealm (code $NodeExitCode).`r`n$SafeLog"
  }

  $TsxCheck = Join-Path $InstallDir "node_modules\tsx\dist\cli.mjs"
  if (-not (Test-Path $TsxCheck)) {
    throw "Les dependances npm n'ont pas ete installees dans $InstallDir ($TsxCheck introuvable).`r`n$SafeLog"
  }

  if ($RegisterTask -eq "1") {
    $RegScript = Join-Path $InstallDir "register-windows-task.ps1"
    if (Test-Path $RegScript) {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RegScript | Out-Null
    }
  }

  # Si une cle de recuperation vient d'etre generee pendant l'installation, l'enregistrer une seule fois dans DataDir
  $KeyLine = ($OutputText -split "`r?`n" | Where-Object { $_ -match "FRK-[A-Z0-9-]+" } | Select-Object -First 1)
  if ($KeyLine) {
    $RecoveryFile = Join-Path $DataDir "CLE-RECUPERATION-A-CONSERVER-HORS-LIGNE.txt"
    @(
      "FACTOREALM - CLE DE RECUPERATION ENTREPRISE",
      "Date : $(Get-Date -Format o)",
      "$($KeyLine.Trim())",
      "",
      "Deplacez ce fichier vers un coffre-fort hors ligne puis supprimez-le du serveur."
    ) | Set-Content -Path $RecoveryFile -Encoding UTF8
  }
}
catch {
  $ErrMsg = $_.Exception.Message
  Add-Content -Path $LogPath -Value ("`r`nERREUR : " + $ErrMsg) -Encoding UTF8
  Write-Error $ErrMsg
  exit 1
}
