<#
.SYNOPSIS
  Installateur serveur Factorealm pour Windows 11 / Windows Server.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1
#>
[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$InstallerArgs
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js v22+ est requis mais introuvable. Exemple d'installation : winget install OpenJS.NodeJS.LTS"
  exit 1
}

$NodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($NodeMajor -lt 22) {
  Write-Error "Node.js v22+ est requis (version detectee : $(node -v))."
  exit 1
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Error "npm.cmd est introuvable dans le PATH."
  exit 1
}

& node "installer\install.mjs" @InstallerArgs
exit $LASTEXITCODE
