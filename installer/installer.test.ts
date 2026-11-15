import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildEnvFileContent,
  buildLinuxStartScript,
  buildLinuxSystemdUnit,
  buildWindowsRegisterTaskPs1,
  buildWindowsStartCmd,
  copyProjectFiles,
  parseInstallerArgs,
  validateHost,
  validatePort,
} from './installerCore.mjs';

test('Validation port/hôte, parsing arguments et génération scripts Windows/Linux', () => {
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
  ]);
  assert.equal(parsed.yes, true);
  assert.equal(parsed.port, 4500);
  assert.equal(parsed.host, '0.0.0.0');
  assert.equal(parsed.installDir, '/opt/factorealm');
  assert.equal(parsed.dataDir, '/var/lib/factorealm');
  assert.equal(parsed.initCompany, true);
  assert.equal(parsed.companyName, 'Ma Société SAS');
  assert.equal(parsed.skipTests, true);

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

  const winCmd = buildWindowsStartCmd({ installDir: 'C:\\Factorealm' });
  assert.match(winCmd, /npm\.cmd run start/);

  const winTask = buildWindowsRegisterTaskPs1({
    installDir: 'C:\\Factorealm',
    dataDir: 'C:\\ProgramData\\Factorealm\\data',
  });
  assert.match(winTask, /Register-ScheduledTask/);
  assert.match(winTask, /icacls\.exe/);
});

test('Installateur bout-en-bout : copie propre, .env, scripts OS et initialisation entreprise SQLite', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'factorealm-installer-'));
  const targetDir = path.join(tmpRoot, 'server-install');
  const dataDir = path.join(tmpRoot, 'server-data');

  try {
    // 1. Préparer une copie cible et lier node_modules pour tester sans réinstaller via réseau
    copyProjectFiles(process.cwd(), targetDir);
    fs.symlinkSync(path.join(process.cwd(), 'node_modules'), path.join(targetDir, 'node_modules'), 'dir');

    // 2. Exécuter install.mjs en mode automatisé avec initialisation entreprise
    const res = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), 'installer', 'install.mjs'),
        '--yes',
        `--install-dir=${targetDir}`,
        `--data-dir=${dataDir}`,
        '--port=3888',
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
        },
      },
    );

    assert.equal(res.status, 0, `stderr: ${res.stderr}\nstdout: ${res.stdout}`);
    assert.match(res.stdout, /FRK-/);
    assert.match(res.stdout, /http:\/\/127\.0\.0\.1:3888/);

    // 3. Vérifier .env et scripts Linux + Windows générés
    const envContent = fs.readFileSync(path.join(targetDir, '.env'), 'utf8');
    assert.match(envContent, /PORT=3888/);
    assert.match(envContent, /HOST=127\.0\.0\.1/);
    assert.equal(fs.existsSync(path.join(targetDir, 'factorealm-start.sh')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'factorealm.service')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'install-systemd.sh')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'factorealm-start.cmd')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'factorealm-start.ps1')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'register-windows-task.ps1')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'unregister-windows-task.ps1')), true);

    // 4. Vérifier que la base SQLite a bien été créée dans dataDir
    assert.equal(fs.existsSync(path.join(dataDir, 'factorealm.sqlite')), true);
    assert.equal(fs.existsSync(path.join(dataDir, 'uploads')), true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
