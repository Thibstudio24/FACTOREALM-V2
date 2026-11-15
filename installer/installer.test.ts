import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {
  buildEnvFileContent,
  buildLinuxCliWrapper,
  buildLinuxStartScript,
  buildLinuxSystemdUnit,
  buildWindowsAddToPathPs1,
  buildWindowsRegisterTaskPs1,
  buildWindowsRemoveFromPathPs1,
  buildWindowsRemoveStartMenuShortcutPs1,
  buildWindowsStartCmd,
  buildWindowsStartMenuShortcutPs1,
  copyProjectFiles,
  lockfileNeedsPlatformReset,
  parseInstallerArgs,
  validateHost,
  validatePort,
} from './installerCore.mjs';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

test('Validation port/hôte, parsing arguments et génération scripts Windows/Linux + PATH', () => {
  assert.equal(validatePort('8080'), 8080);
  assert.throws(() => validatePort('70000'));
  assert.throws(() => validatePort('abc'));

  assert.equal(validateHost('127.0.0.1'), '127.0.0.1');
  assert.throws(() => validateHost('127.0.0.1; rm -rf'));

  const parsed = parseInstallerArgs([
    '--yes',
    '--port=4500',
    '--host=0.0.0.0',
    '--install-dir=/opt/factorealm',
    '--data-dir=/var/lib/factorealm',
    '--init-company',
    '--company-name=Ma Société SAS',
    '--skip-tests',
    '--skip-path',
    '--omit-dev',
    '--runtime-only',
  ]);
  assert.equal(parsed.yes, true);
  assert.equal(parsed.port, 4500);
  assert.equal(parsed.host, '0.0.0.0');
  assert.equal(parsed.installDir, '/opt/factorealm');
  assert.equal(parsed.dataDir, '/var/lib/factorealm');
  assert.equal(parsed.initCompany, true);
  assert.equal(parsed.companyName, 'Ma Société SAS');
  assert.equal(parsed.skipTests, true);
  assert.equal(parsed.skipPath, true);
  assert.equal(parsed.omitDev, true);
  assert.equal(parsed.runtimeOnly, true);

  const env = buildEnvFileContent({
    port: 4500,
    host: '0.0.0.0',
    dbPath: 'C:\\Factorealm\\data\\factorealm.sqlite',
    uploadDir: 'C:\\Factorealm\\data\\uploads',
  });
  assert.match(env, /PORT=4500/);
  assert.match(env, /HOST=0\.0\.0\.0/);
  assert.match(env, /NODE_ENV=production/);

  const unit = buildLinuxSystemdUnit({
    installDir: '/opt/factorealm',
    envFilePath: '/opt/factorealm/.env',
    nodeBinPath: '/usr/bin/node',
    userName: 'factorealm',
  });
  assert.match(unit, /ExecStart=\/usr\/bin\/node \/opt\/factorealm\/node_modules\/tsx\/dist\/cli\.mjs server\.ts --production/);

  const startSh = buildLinuxStartScript({ installDir: '/opt/factorealm' });
  assert.match(startSh, /server\.ts --production/);

  const linuxCli = buildLinuxCliWrapper({ installDir: '/opt/factorealm' });
  assert.match(linuxCli, /\/opt\/factorealm\/bin\/factorealm\.mjs/);

  const winCmd = buildWindowsStartCmd({ installDir: 'C:\\Factorealm' });
  assert.match(winCmd, /npm\.cmd run start/);

  const winTask = buildWindowsRegisterTaskPs1({
    installDir: 'C:\\Factorealm',
    dataDir: 'C:\\ProgramData\\Factorealm\\data',
  });
  assert.match(winTask, /Register-ScheduledTask/);
  assert.match(winTask, /icacls\.exe/);

  const winShortcut = buildWindowsStartMenuShortcutPs1({
    installDir: 'C:\\Factorealm',
    port: 3000,
  });
  assert.match(winShortcut, /Lancer le serveur Factorealm\.lnk/);
  assert.match(winShortcut, /factorealm-start\.cmd/);

  const winRemoveShortcut = buildWindowsRemoveStartMenuShortcutPs1();
  assert.match(winRemoveShortcut, /CommonPrograms/);

  const winAddPath = buildWindowsAddToPathPs1({ binDir: 'C:\\Program Files\\Factorealm\\bin' });
  assert.match(winAddPath, /SetEnvironmentVariable/);
  assert.match(winAddPath, /Factorealm\\bin/);

  const winRemovePath = buildWindowsRemoveFromPathPs1({ binDir: 'C:\\Program Files\\Factorealm\\bin' });
  assert.match(winRemovePath, /SetEnvironmentVariable/);

  const tmpLock = path.join(os.tmpdir(), `factorealm-lock-test-${process.pid}.json`);
  try {
    fs.writeFileSync(
      tmpLock,
      JSON.stringify({
        packages: {
          'node_modules/@esbuild/linux-x64': { version: '0.28.2' },
        },
      }),
    );
    assert.equal(lockfileNeedsPlatformReset(tmpLock, 'linux', 'x64'), false);
    assert.equal(lockfileNeedsPlatformReset(tmpLock, 'win32', 'x64'), true);
    assert.equal(lockfileNeedsPlatformReset(tmpLock, 'linux', 'arm64'), true);
  } finally {
    fs.rmSync(tmpLock, { force: true });
  }
});

test('Installateur bout-en-bout : copie allégée, .env, PATH et CLI start/status/restart/stop', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'factorealm-installer-'));
  const targetDir = path.join(tmpRoot, 'server-install');
  const dataDir = path.join(tmpRoot, 'server-data');
  const binDir = path.join(tmpRoot, 'usr-bin');
  const port = await getFreePort();

  try {
    // 1. Préparer une copie allégée sans docs, tests, fichiers packaging ni fichiers inutiles
    copyProjectFiles(process.cwd(), targetDir, { includeTests: false, runtimeOnly: false });
    assert.equal(fs.existsSync(path.join(targetDir, 'docs')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'README.md')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'release.md')), false);
    assert.equal(fs.existsSync(path.join(targetDir, '.env.example')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'bun.lock')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'install.sh')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'installer', 'build-deb.sh')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'installer', 'windows', 'factorealm.iss')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'src', 'core', 'core.test.ts')), false);
    assert.equal(fs.existsSync(path.join(targetDir, 'bin', 'factorealm.mjs')), true);

    fs.symlinkSync(path.join(process.cwd(), 'node_modules'), path.join(targetDir, 'node_modules'), 'dir');

    // Simuler un dist/ déjà compilé pour tester --production avec la CLI factorealm
    fs.mkdirSync(path.join(targetDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'dist', 'index.html'), '<!doctype html><html><body>Factorealm</body></html>');

    // 2. Exécuter install.mjs avec FACTOREALM_BIN_DIR isolé
    const res = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'installer', 'install.mjs'),
        '--yes',
        `--install-dir=${targetDir}`,
        `--data-dir=${dataDir}`,
        `--port=${port}`,
        '--host=127.0.0.1',
        '--init-company',
        '--company-name=Install Test SAS',
        '--legal-form=SAS',
        '--siret=73282932000074',
        '--admin-name=Paul Durand',
        '--admin-email=paul@install-test.fr',
        '--admin-password-env=FR_TEST_ADMIN_PASS',
        '--skip-install',
        '--skip-build',
        '--skip-tests',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          FR_TEST_ADMIN_PASS: 'InstallPassRobust2026!',
          FACTOREALM_BIN_DIR: binDir,
        },
      },
    );

    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);
    assert.match(res.stdout, /FRK-/);
    assert.match(res.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}`));
    assert.match(res.stdout, /factorealm start/);

    // 3. Vérifier .env, scripts OS appropriés et wrapper PATH
    const envContent = fs.readFileSync(path.join(targetDir, '.env'), 'utf8');
    assert.match(envContent, new RegExp(`PORT=${port}`));
    assert.match(envContent, /HOST=127\.0\.0\.1/);

    if (process.platform === 'win32') {
      assert.equal(fs.existsSync(path.join(targetDir, 'factorealm-start.cmd')), true);
      assert.equal(fs.existsSync(path.join(targetDir, 'add-to-path.ps1')), true);
      assert.equal(fs.existsSync(path.join(targetDir, 'factorealm.service')), false);
    } else {
      assert.equal(fs.existsSync(path.join(targetDir, 'factorealm-start.sh')), true);
      assert.equal(fs.existsSync(path.join(targetDir, 'factorealm.service')), true);
      assert.equal(fs.existsSync(path.join(targetDir, 'install-systemd.sh')), true);
      assert.equal(fs.existsSync(path.join(targetDir, 'factorealm-start.cmd')), false);

      const cliBin = path.join(binDir, 'factorealm');
      assert.equal(fs.existsSync(cliBin), true);
      assert.match(fs.readFileSync(cliBin, 'utf8'), /bin\/factorealm\.mjs/);

      // 4. Tester réellement factorealm status -> start -> status -> restart -> stop -> status via PATH
      const cliEnv = {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      };

      const stStopped = spawnSync('factorealm', ['status'], { encoding: 'utf8', env: cliEnv });
      assert.equal(stStopped.status, 3);
      assert.match(stStopped.stdout, /ARRÊTÉ/);

      const started = spawnSync('factorealm', ['start'], { encoding: 'utf8', env: cliEnv });
      assert.equal(started.status, 0, `start failed: ${started.stderr}\n${started.stdout}`);
      assert.match(started.stdout, /démarré/i);

      const stRunning = spawnSync('factorealm', ['status'], { encoding: 'utf8', env: cliEnv });
      assert.equal(stRunning.status, 0, `status failed: ${stRunning.stderr}\n${stRunning.stdout}`);
      assert.match(stRunning.stdout, /EN COURS/);
      assert.match(stRunning.stdout, /Install Test SAS/);

      const pidBeforeRestart = fs.readFileSync(path.join(dataDir, 'factorealm.pid'), 'utf8').trim();
      const restarted = spawnSync('factorealm', ['restart'], { encoding: 'utf8', env: cliEnv });
      assert.equal(restarted.status, 0, `restart failed: ${restarted.stderr}\n${restarted.stdout}`);
      const pidAfterRestart = fs.readFileSync(path.join(dataDir, 'factorealm.pid'), 'utf8').trim();
      assert.notEqual(pidBeforeRestart, pidAfterRestart);

      const stopped = spawnSync('factorealm', ['stop'], { encoding: 'utf8', env: cliEnv });
      assert.equal(stopped.status, 0, `stop failed: ${stopped.stderr}\n${stopped.stdout}`);
      assert.match(stopped.stdout, /arrêté/i);

      const stAfterStop = spawnSync('factorealm', ['status'], { encoding: 'utf8', env: cliEnv });
      assert.equal(stAfterStop.status, 3);
      assert.match(stAfterStop.stdout, /ARRÊTÉ/);
    }

    // 5. Vérifier la base SQLite créée dans dataDir
    assert.equal(fs.existsSync(path.join(dataDir, 'factorealm.sqlite')), true);
    assert.equal(fs.existsSync(path.join(dataDir, 'uploads')), true);
  } finally {
    // S'assurer qu'aucun processus orphelin ne reste actif si une assertion échoue
    const pidPath = path.join(dataDir, 'factorealm.pid');
    if (fs.existsSync(pidPath)) {
      const pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
