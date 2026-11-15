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
    skipPath: false,
    omitDev: false,
    runtimeOnly: false,
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
    else if (arg === '--skip-path') opts.skipPath = true;
    else if (arg === '--omit-dev') opts.omitDev = true;
    else if (arg === '--runtime-only') opts.runtimeOnly = true;
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

export function buildLinuxCliWrapper({ installDir }) {
  return [
    '#!/usr/bin/env bash',
    `exec node "${installDir}/bin/factorealm.mjs" "$@"`,
    '',
  ].join('\n');
}

export function buildWindowsAddToPathPs1({ binDir }) {
  return [
    '$ErrorActionPreference = "Stop"',
    `$BinDir = "${binDir}".TrimEnd('\\')`,
    '$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    '$Scope = if ($IsAdmin) { "Machine" } else { "User" }',
    '$Current = [Environment]::GetEnvironmentVariable("Path", $Scope)',
    '$Entries = @()',
    'if ($Current) { $Entries = $Current -split ";" | Where-Object { $_ -and $_.Trim() -ne "" } }',
    '$Exists = $false',
    'foreach ($Entry in $Entries) {',
    '  if ($Entry.Trim().TrimEnd("\\").ToLowerInvariant() -eq $BinDir.ToLowerInvariant()) { $Exists = $true; break }',
    '}',
    'if (-not $Exists) {',
    '  $Updated = ($Entries + $BinDir) -join ";"',
    '  [Environment]::SetEnvironmentVariable("Path", $Updated, $Scope)',
    '  Write-Host "PATH ($Scope) mis a jour : $BinDir"',
    '} else {',
    '  Write-Host "Deja present dans le PATH ($Scope) : $BinDir"',
    '}',
    'if ($env:Path -notlike "*$BinDir*") { $env:Path = "$env:Path;$BinDir" }',
    '',
  ].join('\r\n');
}

export function buildWindowsRemoveFromPathPs1({ binDir }) {
  return [
    '$ErrorActionPreference = "Stop"',
    `$BinDir = "${binDir}".TrimEnd('\\').ToLowerInvariant()`,
    'foreach ($Scope in @("Machine", "User")) {',
    '  try {',
    '    $Current = [Environment]::GetEnvironmentVariable("Path", $Scope)',
    '    if ($Current) {',
    '      $Filtered = $Current -split ";" | Where-Object { $_ -and $_.Trim().TrimEnd("\\").ToLowerInvariant() -ne $BinDir }',
    '      [Environment]::SetEnvironmentVariable("Path", ($Filtered -join ";"), $Scope)',
    '    }',
    '  } catch {}',
    '}',
    'Write-Host "Entree PATH Factorealm retiree."',
    '',
  ].join('\r\n');
}

const ALWAYS_EXCLUDED_NAMES = new Set([
  'node_modules',
  'data',
  'dist-packages',
  'coverage',
  '.git',
  '.aistudio',
  '.playwright-cli',
  '.vscode',
  '.idea',
  '.env',
  '.env.local',
  '.env.example',
  '.gitignore',
  'bun.lock',
  'docs',
  'README.md',
  'release.md',
  'metadata.json',
  'install.sh',
  'install.ps1',
]);

const ALWAYS_EXCLUDED_REL_PATHS = new Set([
  'installer/build-deb.sh',
  'installer/windows/factorealm.iss',
  'installer/windows/build-inno.ps1',
]);

const RUNTIME_ONLY_EXCLUDED_REL_PATHS = new Set([
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'public',
  'src/components',
  'src/lib',
  'src/App.tsx',
  'src/main.tsx',
  'src/index.css',
]);

function isTestFileName(name) {
  return /\.(test|spec)\.(ts|tsx|mjs|js)$/i.test(name);
}

export function copyProjectFiles(sourceDir, targetDir, options = {}, currentRel = '') {
  const { includeTests = false, runtimeOnly = false } = options;
  const srcAbs = path.resolve(sourceDir);
  const dstAbs = path.resolve(targetDir);
  if (srcAbs === dstAbs && currentRel === '') return;

  fs.mkdirSync(dstAbs, { recursive: true });
  const entries = fs.readdirSync(srcAbs, { withFileTypes: true });
  for (const entry of entries) {
    if (ALWAYS_EXCLUDED_NAMES.has(entry.name)) continue;
    if (entry.name === 'dist' && !runtimeOnly) continue;

    const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
    if (ALWAYS_EXCLUDED_REL_PATHS.has(relPath)) continue;
    if (runtimeOnly && RUNTIME_ONLY_EXCLUDED_REL_PATHS.has(relPath)) continue;
    if (!includeTests && entry.isFile() && isTestFileName(entry.name)) continue;

    const srcPath = path.join(srcAbs, entry.name);
    const dstPath = path.join(dstAbs, entry.name);
    if (entry.isDirectory()) {
      copyProjectFiles(srcPath, dstPath, options, relPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

export function pruneUnnecessaryInstalledFiles(targetDir, { removeFrontendSources = false } = {}) {
  const absTarget = path.resolve(targetDir);

  function walkAndDeleteTests(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'data' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndDeleteTests(fullPath);
      } else if (entry.isFile() && isTestFileName(entry.name)) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }

  walkAndDeleteTests(absTarget);

  if (removeFrontendSources) {
    for (const rel of RUNTIME_ONLY_EXCLUDED_REL_PATHS) {
      fs.rmSync(path.join(absTarget, rel), { recursive: true, force: true });
    }
  }
}

export function lockfileNeedsPlatformReset(
  lockfilePath,
  platform = process.platform,
  arch = process.arch,
) {
  if (!fs.existsSync(lockfilePath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
    const pkgKeys = Object.keys(parsed?.packages ?? {});
    const esbuildPlatformKeys = pkgKeys.filter((k) => k.includes('node_modules/@esbuild/'));
    if (esbuildPlatformKeys.length === 0) return false;
    const expectedSuffix = `node_modules/@esbuild/${platform}-${arch}`;
    return !esbuildPlatformKeys.some((k) => k.endsWith(expectedSuffix));
  } catch {
    return false;
  }
}
