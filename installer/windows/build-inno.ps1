<#
.SYNOPSIS
  Compile l'installeur Windows Factorealm-Setup-x64.exe avec Inno Setup 6 (à exécuter sur Windows).
#>
$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

Write-Host "[1/3] Installation des dépendances et compilation du frontend..."
if ((Test-Path "package-lock.json") -and -not (Select-String -Path "package-lock.json" -Pattern '"node_modules/@esbuild/win32-x64"' -SimpleMatch -Quiet)) {
  Write-Host "      Réinitialisation du lockfile multi-OS pour Windows x64..."
  Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
}
& npm.cmd install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/3] Recherche du compilateur Inno Setup (ISCC.exe)..."
$Candidates = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path $_) }

$Iscc = $Candidates | Select-Object -First 1
if (-not $Iscc) {
  Write-Error "ISCC.exe introuvable. Installez Inno Setup 6 (https://jrsoftware.org/isdl.php) ou passez-le dans le PATH."
  exit 1
}

Write-Host "[3/3] Compilation de l'installeur .exe via $Iscc..."
& $Iscc "installer\windows\factorealm.iss"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Installeur généré dans dist-packages\."
