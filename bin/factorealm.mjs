#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fs.realpathSync(fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
export const DEFAULT_APP_ROOT = path.resolve(__dirname, '..');

function isValidFactorealmDir(dir) {
  return (
    fs.existsSync(path.join(dir, 'server.ts')) &&
    fs.existsSync(path.join(dir, 'node_modules', 'tsx', 'dist', 'cli.mjs'))
  );
}

export function resolveAppRoot() {
  const envHome = process.env.FACTOREALM_HOME?.trim();
  if (envHome && fs.existsSync(path.join(envHome, 'server.ts'))) {
    return path.resolve(envHome);
  }
  const cwd = process.cwd();
  if (isValidFactorealmDir(cwd) && !isValidFactorealmDir(DEFAULT_APP_ROOT)) {
    return cwd;
  }
  if (
    cwd !== DEFAULT_APP_ROOT &&
    fs.existsSync(path.join(cwd, 'server.ts')) &&
    fs.existsSync(path.join(cwd, 'package.json')) &&
    !fs.existsSync(path.join(DEFAULT_APP_ROOT, '.env'))
  ) {
    return cwd;
  }
  return DEFAULT_APP_ROOT;
}

export const APP_ROOT = resolveAppRoot();

export function loadDotEnv(appRoot = APP_ROOT) {
  const localEnvPath = path.join(appRoot, '.env');
  const systemEnvPath = '/etc/factorealm/factorealm.env';
  const envPath = fs.existsSync(localEnvPath)
    ? localEnvPath
    : process.platform === 'linux' && fs.existsSync(systemEnvPath)
      ? systemEnvPath
      : null;
  const vars = {};
  if (!envPath) return vars;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
    process.env[key] = val;
  }
  return vars;
}

export function getRuntimePaths(appRoot = APP_ROOT) {
  const vars = loadDotEnv(appRoot);
  const port = Number(vars.PORT ?? process.env.PORT ?? 3000);
  const host = vars.HOST ?? process.env.HOST ?? '127.0.0.1';
  const dbPathRaw = vars.FACTOREALM_DB_PATH ?? process.env.FACTOREALM_DB_PATH ?? './data/factorealm.sqlite';
  const dbPath = path.isAbsolute(dbPathRaw) ? dbPathRaw : path.resolve(appRoot, dbPathRaw);
  const dataDir = path.dirname(dbPath);
  return {
    appRoot,
    port,
    host,
    connectHost: host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host,
    dataDir,
    pidFile: path.join(dataDir, 'factorealm.pid'),
    logFile: path.join(dataDir, 'factorealm.log'),
  };
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(pidFile) {
  if (!fs.existsSync(pidFile)) return null;
  const raw = fs.readFileSync(pidFile, 'utf8').trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isSystemdServiceInstalled() {
  return process.platform === 'linux' && fs.existsSync('/etc/systemd/system/factorealm.service');
}

function isSystemdActive() {
  if (!isSystemdServiceInstalled()) return false;
  const res = spawnSync('systemctl', ['is-active', '--quiet', 'factorealm'], { stdio: 'ignore' });
  return res.status === 0;
}

async function probeStatus(connectHost, port) {
  try {
    const res = await fetch(`http://${connectHost}:${port}/api/v1/status`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cmdStart(cfg) {
  const existingPid = readPid(cfg.pidFile);
  if ((existingPid && isPidAlive(existingPid)) || isSystemdActive()) {
    const info = await probeStatus(cfg.connectHost, cfg.port);
    console.log(
      `Factorealm est déjà en cours d'exécution (${existingPid ? `PID ${existingPid}, ` : ''}http://${cfg.connectHost}:${cfg.port}).`,
    );
    if (info?.companyName) {
      console.log(`Entreprise : ${info.companyName}`);
    }
    return 0;
  }

  if (existingPid) {
    fs.rmSync(cfg.pidFile, { force: true });
  }

  if (isSystemdServiceInstalled()) {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      const res = spawnSync('systemctl', ['start', 'factorealm'], { stdio: 'inherit' });
      if (res.status !== 0) return res.status ?? 1;
      console.log(`Service systemd Factorealm démarré (http://${cfg.connectHost}:${cfg.port}).`);
      return 0;
    }
    console.error('Factorealm est géré par systemd. Utilisez : sudo factorealm start');
    return 1;
  }

  const tsxCli = path.join(cfg.appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxCli)) {
    console.error(
      `Dépendances manquantes : "${tsxCli}" est introuvable. Exécutez "npm install" dans "${cfg.appRoot}" ou définissez FACTOREALM_HOME.`,
    );
    return 1;
  }

  const hasBuiltDist = fs.existsSync(path.join(cfg.appRoot, 'dist', 'index.html'));
  const hasVite = fs.existsSync(path.join(cfg.appRoot, 'node_modules', 'vite', 'package.json'));
  if (!hasBuiltDist && !hasVite) {
    console.error(`Build frontend manquant ("dist/index.html" introuvable dans "${cfg.appRoot}"). Exécutez "npm run build".`);
    return 1;
  }

  const serverArgs = hasBuiltDist ? [tsxCli, 'server.ts', '--production'] : [tsxCli, 'server.ts'];
  const nodeEnvMode = hasBuiltDist ? 'production' : 'development';

  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const logFd = fs.openSync(cfg.logFile, 'a');
  const child = spawn(process.execPath, serverArgs, {
    cwd: cfg.appRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: nodeEnvMode,
    },
  });
  fs.writeFileSync(cfg.pidFile, `${child.pid}\n`, 'utf8');
  child.unref();
  fs.closeSync(logFd);

  // Attendre que le serveur HTTP réponde (max 10 s)
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    if (!isPidAlive(child.pid)) {
      fs.rmSync(cfg.pidFile, { force: true });
      console.error('Échec du démarrage du serveur Factorealm. Dernières lignes du journal :');
      if (fs.existsSync(cfg.logFile)) {
        const lines = fs.readFileSync(cfg.logFile, 'utf8').trim().split(/\r?\n/).slice(-15);
        console.error(lines.join('\n'));
      }
      return 1;
    }
    const st = await probeStatus(cfg.connectHost, cfg.port);
    if (st) {
      console.log(`Factorealm démarré (PID ${child.pid}, dossier ${cfg.appRoot}) : http://${cfg.connectHost}:${cfg.port}`);
      return 0;
    }
  }

  console.log(`Serveur lancé en arrière-plan (PID ${child.pid}). Journal : ${cfg.logFile}`);
  return 0;
}

async function cmdStop(cfg) {
  const pid = readPid(cfg.pidFile);
  if (pid && isPidAlive(pid)) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
      for (let i = 0; i < 30; i += 1) {
        await sleep(150);
        if (!isPidAlive(pid)) break;
      }
      if (isPidAlive(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
    }
    fs.rmSync(cfg.pidFile, { force: true });
    console.log(`Factorealm arrêté (PID ${pid}).`);
    return 0;
  }

  if (pid) {
    fs.rmSync(cfg.pidFile, { force: true });
  }

  if (isSystemdActive()) {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      const res = spawnSync('systemctl', ['stop', 'factorealm'], { stdio: 'inherit' });
      return res.status ?? 1;
    }
    console.error('Factorealm est géré par systemd. Utilisez : sudo systemctl stop factorealm');
    return 1;
  }

  console.log('Factorealm est déjà arrêté.');
  return 0;
}

async function cmdStatus(cfg) {
  const pid = readPid(cfg.pidFile);
  const pidAlive = pid ? isPidAlive(pid) : false;
  if (pid && !pidAlive) {
    fs.rmSync(cfg.pidFile, { force: true });
  }
  const sysActive = isSystemdActive();
  const health = await probeStatus(cfg.connectHost, cfg.port);
  const running = Boolean(health) || pidAlive || sysActive;

  console.log(`Factorealm — Statut : ${running ? 'EN COURS' : 'ARRÊTÉ'}`);
  if (pidAlive) console.log(`PID                 : ${pid}`);
  if (sysActive) console.log('Gestionnaire        : systemd (factorealm.service)');
  console.log(`Écoute configurée   : http://${cfg.host}:${cfg.port} (local : http://${cfg.connectHost}:${cfg.port})`);
  if (health) {
    console.log(
      `Instance            : ${health.initialized ? `initialisée (${health.companyName})` : 'non initialisée (assistant web prêt)'}`,
    );
  }
  console.log(`Dossier données     : ${cfg.dataDir}`);
  console.log(`Journal             : ${cfg.logFile}`);
  return running ? 0 : 3;
}

function cmdLogs(cfg) {
  if (!fs.existsSync(cfg.logFile)) {
    console.log(`Aucun journal trouvé (${cfg.logFile}).`);
    return 0;
  }
  const lines = fs.readFileSync(cfg.logFile, 'utf8').trim().split(/\r?\n/);
  console.log(lines.slice(-40).join('\n'));
  return 0;
}

function printHelp() {
  console.log(`
Factorealm — Gestion du serveur

Commandes disponibles :
  factorealm start      Démarre le serveur Factorealm en arrière-plan
  factorealm stop       Arrête le serveur Factorealm
  factorealm restart    Redémarre le serveur Factorealm
  factorealm status     Affiche l'état du serveur, le PID, le port et l'entreprise
  factorealm logs       Affiche les 40 dernières lignes du journal
  factorealm help       Affiche cette aide
`);
}

async function main() {
  const command = (process.argv[2] ?? 'help').toLowerCase();
  const cfg = getRuntimePaths(APP_ROOT);

  if (command === 'start') {
    process.exit(await cmdStart(cfg));
  } else if (command === 'stop') {
    process.exit(await cmdStop(cfg));
  } else if (command === 'restart') {
    if (isSystemdServiceInstalled()) {
      if (typeof process.getuid === 'function' && process.getuid() === 0) {
        const res = spawnSync('systemctl', ['restart', 'factorealm'], { stdio: 'inherit' });
        if (res.status === 0) {
          console.log(`Service systemd Factorealm redémarré (http://${cfg.connectHost}:${cfg.port}).`);
        }
        process.exit(res.status ?? 1);
      }
      console.error('Factorealm est géré par systemd. Utilisez : sudo factorealm restart');
      process.exit(1);
    }
    const stopCode = await cmdStop(cfg);
    if (stopCode !== 0) process.exit(stopCode);
    process.exit(await cmdStart(cfg));
  } else if (command === 'status') {
    process.exit(await cmdStatus(cfg));
  } else if (command === 'logs') {
    process.exit(cmdLogs(cfg));
  } else if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  } else {
    console.error(`Commande inconnue : "${command}".`);
    printHelp();
    process.exit(1);
  }
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === __filename;
  } catch {
    return path.resolve(process.argv[1]) === __filename;
  }
}

if (isExecutedDirectly()) {
  main().catch((err) => {
    console.error(`[Factorealm] Erreur : ${(err).message}`);
    process.exit(1);
  });
}
