param(
  [string]$InstallDir,
  [string]$DataDir,
  [string]$Port = "3000",
  [string]$ListenHost = "127.0.0.1",
  [string]$InitCompany = "0",
  [string]$CompanyName = "",
  [string]$Siret = "",
  [string]$AdminName = "",
  [string]$AdminEmail = "",
  [string]$RegisterTask = "0"
)

$ErrorActionPreference = "Stop"

# Assurer que Node.js nouvellement installé est présent dans le PATH du processus courant
$NodeDir = Join-Path $env:ProgramFiles "nodejs"
if ((Test-Path $NodeDir) -and ($env:Path -notlike "*$NodeDir*")) {
  $env:Path = "$NodeDir;$env:Path"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js v22+ reste introuvable après l'étape prérequis."
}

Set-Location $InstallDir

$ArgsList = @(
  "installer\install.mjs",
  "--yes",
  "--install-dir=$InstallDir",
  "--data-dir=$DataDir",
  "--port=$Port",
  "--host=$ListenHost",
  "--skip-tests"
)

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

$LogPath = Join-Path $DataDir "install.log"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$Output = & node @ArgsList 2>&1
$OutputText = ($Output | Out-String)
# Masquer toute éventuelle ligne de clé de récupération du fichier journal permanent ; l'afficher dans une fenêtre unique si générée
$SafeLog = ($OutputText -split "`r?`n" | Where-Object { $_ -notmatch "FRK-" }) -join "`r`n"
Set-Content -Path $LogPath -Value $SafeLog -Encoding UTF8

if ($LASTEXITCODE -ne 0) {
  throw "Échec de l'installation Factorealm. Consultez $LogPath.`n$SafeLog"
}

if ($RegisterTask -eq "1") {
  $RegScript = Join-Path $InstallDir "register-windows-task.ps1"
  if (Test-Path $RegScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $RegScript | Out-Null
  }
}

# Si une clé de récupération vient d'être générée pendant l'installation, l'enregistrer une seule fois dans un fichier restreint sur le Bureau de l'administrateur ou DataDir
$KeyLine = ($OutputText -split "`r?`n" | Where-Object { $_ -match "FRK-[A-Z0-9-]+" } | Select-Object -First 1)
if ($KeyLine) {
  $RecoveryFile = Join-Path $DataDir "CLE-RECUPERATION-A-CONSERVER-HORS-LIGNE.txt"
  @(
    "FACTOREALM — CLÉ DE RÉCUPÉRATION ENTREPRISE",
    "Date : $(Get-Date -Format o)",
    "$($KeyLine.Trim())",
    "",
    "Déplacez ce fichier vers un coffre-fort hors ligne puis supprimez-le du serveur."
  ) | Set-Content -Path $RecoveryFile -Encoding UTF8
}
