import fs from 'node:fs';
import path from 'node:path';

export function validatePort(raw) {
  const num = Number(String(raw ?? '').trim());
  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    throw new Error(`Port invalide (${raw}). Indiquez un entier entre 1 et 65535.`);
  }
  return num;
}

export function validateHost(raw) {
  const host = String(raw ?? '').trim();
  if (!host || /[\s\r\n"'`;$]/.test(host)) {
    throw new Error(`Adresse d'écoute invalide (${raw}). Exemple : 127.0.0.1 ou 0.0.0.0.`);
  }
  return host;
}

export function parseInstallerArgs(argv) {
  const opts = {
    help: false,
    yes: false,
    installDir: null,
    dataDir: null,
    port: null,
    host: null,
    initCompany: null,
    companyName: null,
    legalForm: 'SAS',
    siret: '',
    vatNumber: '',
    vatRegime: 'reel_normal',
    address: '',
    postalCode: '',
    city: '',
    adminName: null,
    adminEmail: null,
    adminPasswordEnv: null,
    skipTests: false,
    skipInstall: false,
    skipBuild: false,
    skipShortcuts: false,
    installService: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--init-company') opts.initCompany = true;
    else if (arg === '--no-init-company') opts.initCompany = false;
    else if (arg === '--skip-tests') opts.skipTests = true;
    else if (arg === '--skip-install') opts.skipInstall = true;
    else if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--skip-shortcuts') opts.skipShortcuts = true;
    else if (arg === '--install-service') opts.installService = true;
    else if (arg.startsWith('--install-dir=')) opts.installDir = arg.slice('--install-dir='.length);
    else if (arg === '--install-dir' && argv[i + 1]) opts.installDir = argv[++i];
    else if (arg.startsWith('--data-dir=')) opts.dataDir = arg.slice('--data-dir='.length);
    else if (arg === '--data-dir' && argv[i + 1]) opts.dataDir = argv[++i];
    else if (arg.startsWith('--port=')) opts.port = validatePort(arg.slice('--port='.length));
    else if (arg === '--port' && argv[i + 1]) opts.port = validatePort(argv[++i]);
    else if (arg.startsWith('--host=')) opts.host = validateHost(arg.slice('--host='.length));
    else if (arg === '--host' && argv[i + 1]) opts.host = validateHost(argv[++i]);
    else if (arg.startsWith('--company-name=')) opts.companyName = arg.slice('--company-name='.length);
    else if (arg === '--company-name' && argv[i + 1]) opts.companyName = argv[++i];
    else if (arg.startsWith('--legal-form=')) opts.legalForm = arg.slice('--legal-form='.length);
    else if (arg.startsWith('--siret=')) opts.siret = arg.slice('--siret='.length);
    else if (arg.startsWith('--vat-number=')) opts.vatNumber = arg.slice('--vat-number='.length);
    else if (arg.startsWith('--vat-regime=')) opts.vatRegime = arg.slice('--vat-regime='.length);
    else if (arg.startsWith('--address=')) opts.address = arg.slice('--address='.length);
    else if (arg.startsWith('--postal-code=')) opts.postalCode = arg.slice('--postal-code='.length);
    else if (arg.startsWith('--city=')) opts.city = arg.slice('--city='.length);
    else if (arg.startsWith('--admin-name=')) opts.adminName = arg.slice('--admin-name='.length);
    else if (arg.startsWith('--admin-email=')) opts.adminEmail = arg.slice('--admin-email='.length);
    else if (arg.startsWith('--admin-password-env=')) opts.adminPasswordEnv = arg.slice('--admin-password-env='.length);
  }
  return opts;
}

function escapeEnvValue(value) {
  const s = String(value ?? '').replace(/[\r\n]/g, '');
  if (/[\s#"']/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

export function buildEnvFileContent({ port, host, dbPath, uploadDir }) {
  const cleanPort = validatePort(port);
  const cleanHost = validateHost(host);
  return [
    '# Configuration générée par l\'installateur Factorealm',
    `NODE_ENV=production`,
    `PORT=${cleanPort}`,
    `HOST=${escapeEnvValue(cleanHost)}`,
    `FACTOREALM_DB_PATH=${escapeEnvValue(dbPath)}`,
    `FACTOREALM_UPLOAD_DIR=${escapeEnvValue(uploadDir)}`,
    '',
  ].join('\n');
}

export function buildLinuxStartScript({ installDir }) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `cd "${installDir}"`,
    'if [ -f .env ]; then set -a; source .env; set +a; fi',
    'exec ./node_modules/.bin/tsx server.ts --production',
    '',
  ].join('\n');
}

export function buildLinuxSystemdUnit({ installDir, envFilePath, nodeBinPath, userName }) {
  const tsxCli = path.posix.join(installDir.replace(/\\/g, '/'), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return [
    '[Unit]',
    'Description=Factorealm — Gestion commerciale et comptabilité',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `User=${userName || 'factorealm'}`,
    `WorkingDirectory=${installDir}`,
    `EnvironmentFile=${envFilePath}`,
    `ExecStart=${nodeBinPath} ${tsxCli} server.ts --production`,
    'Restart=on-failure',
    'RestartSec=5',
    'NoNewPrivileges=true',
    'PrivateTmp=true',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
}

export function buildLinuxSystemdInstallScript({ installDir }) {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'if [ "$(id -u)" -ne 0 ]; then',
    '  echo "Exécutez ce script en root (sudo bash install-systemd.sh)." >&2',
    '  exit 1',
    'fi',
    'if ! id -u factorealm >/dev/null 2>&1; then',
    '  useradd --system --no-create-home --shell /usr/sbin/nologin factorealm',
    'fi',
    `chown -R factorealm:factorealm "${installDir}"`,
    `cp "${installDir}/factorealm.service" /etc/systemd/system/factorealm.service`,
    'systemctl daemon-reload',
    'systemctl enable --now factorealm.service',
    'systemctl status factorealm.service --no-pager',
    '',
  ].join('\n');
}

export function buildWindowsStartCmd({ installDir }) {
  return [
    '@echo off',
    'setlocal',
    'title Factorealm Serveur',
    `cd /d "${installDir}"`,
    'call npm.cmd run start',
    'if errorlevel 1 (',
    '  echo.',
    '  echo [Factorealm] Le serveur s est arrete avec une erreur.',
    '  pause',
    ')',
    '',
  ].join('\r\n');
}

export function buildWindowsStartPs1({ installDir }) {
  return [
    '$ErrorActionPreference = "Stop"',
    `Set-Location "${installDir}"`,
    '& "$PSScriptRoot\\node_modules\\.bin\\tsx.cmd" server.ts --production',
    '',
  ].join('\r\n');
}

export function buildWindowsRegisterTaskPs1({ installDir, dataDir, taskName = 'FactorealmServer' }) {
  const effectiveDataDir = dataDir || `${installDir}\\data`;
  return [
    '# Exécuter dans PowerShell en tant qu\'Administrateur',
    '$ErrorActionPreference = "Stop"',
    `$TaskName = "${taskName}"`,
    `$InstallDir = "${installDir}"`,
    `$DataDir = "${effectiveDataDir}"`,
    `$ScriptPath = "$InstallDir\\factorealm-start.ps1"`,
    'New-Item -ItemType Directory -Force -Path $DataDir | Out-Null',
    '& icacls.exe $InstallDir /grant "NT AUTHORITY\\NETWORK SERVICE:(OI)(CI)RX" /T /C | Out-Null',
    '& icacls.exe $DataDir /grant "NT AUTHORITY\\NETWORK SERVICE:(OI)(CI)M" /T /C | Out-Null',
    '$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""',
    '$Trigger = New-ScheduledTaskTrigger -AtStartup',
    '$Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\\NETWORK SERVICE" -LogonType ServiceAccount -RunLevel Highest',
    '$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)',
    'Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null',
    'Start-ScheduledTask -TaskName $TaskName',
    'Write-Host "Service / tâche planifiée $TaskName installé et démarré."',
    '',
  ].join('\r\n');
}

export function buildWindowsUnregisterTaskPs1({ taskName = 'FactorealmServer' }) {
  return [
    '# Exécuter dans PowerShell en tant qu\'Administrateur',
    `$TaskName = "${taskName}"`,
    'if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {',
    '  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue',
    '  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false',
    '  Write-Host "Tâche $TaskName arrêtée et supprimée."',
    '} else {',
    '  Write-Host "Aucune tâche $TaskName trouvée."',
    '}',
    '',
  ].join('\r\n');
}

export function buildWindowsStartMenuShortcutPs1({ installDir, port }) {
  const cleanPort = validatePort(port);
  return [
    '$ErrorActionPreference = "Stop"',
    `$InstallDir = "${installDir}"`,
    `$Port = "${cleanPort}"`,
    '$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    '$ProgramsRoot = if ($IsAdmin) { [Environment]::GetFolderPath("CommonPrograms") } else { [Environment]::GetFolderPath("Programs") }',
    '$MenuDir = Join-Path $ProgramsRoot "Factorealm"',
    'New-Item -ItemType Directory -Force -Path $MenuDir | Out-Null',
    '$Shell = New-Object -ComObject WScript.Shell',
    '$LaunchShortcut = $Shell.CreateShortcut((Join-Path $MenuDir "Lancer le serveur Factorealm.lnk"))',
    '$LaunchShortcut.TargetPath = Join-Path $InstallDir "factorealm-start.cmd"',
    '$LaunchShortcut.WorkingDirectory = $InstallDir',
    '$LaunchShortcut.Description = "Demarrer le serveur Factorealm (port $Port)"',
    '$LaunchShortcut.Save()',
    '$UrlFile = Join-Path $MenuDir "Ouvrir Factorealm (navigateur).url"',
    'Set-Content -Path $UrlFile -Value "[InternetShortcut]`r`nURL=http://127.0.0.1:$Port`r`n" -Encoding ASCII',
    'Write-Host "Raccourcis du menu Demarrer crees dans : $MenuDir"',
    '',
  ].join('\r\n');
}

export function buildWindowsRemoveStartMenuShortcutPs1() {
  return [
    'foreach ($Root in @([Environment]::GetFolderPath("CommonPrograms"), [Environment]::GetFolderPath("Programs"))) {',
    '  if ($Root) {',
    '    $MenuDir = Join-Path $Root "Factorealm"',
    '    if (Test-Path $MenuDir) { Remove-Item -Recurse -Force $MenuDir }',
    '  }',
    '}',
    'Write-Host "Raccourcis Factorealm supprimes du menu Demarrer."',
    '',
  ].join('\r\n');
}

const EXCLUDED_COPY_ENTRIES = new Set([
  'node_modules',
  'data',
  'dist',
  '.git',
  '.playwright-cli',
  '.env',
  '.env.local',
]);

export function copyProjectFiles(sourceDir, targetDir) {
  const srcAbs = path.resolve(sourceDir);
  const dstAbs = path.resolve(targetDir);
  if (srcAbs === dstAbs) return;

  fs.mkdirSync(dstAbs, { recursive: true });
  const entries = fs.readdirSync(srcAbs, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_COPY_ENTRIES.has(entry.name)) continue;
    const srcPath = path.join(srcAbs, entry.name);
    const dstPath = path.join(dstAbs, entry.name);
    if (entry.isDirectory()) {
      copyProjectFiles(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
