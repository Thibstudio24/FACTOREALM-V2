#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  buildEnvFileContent,
  buildLinuxCliWrapper,
  buildLinuxStartScript,
  buildLinuxSystemdInstallScript,
  buildLinuxSystemdUnit,
  buildWindowsAddToPathPs1,
  buildWindowsRegisterTaskPs1,
  buildWindowsRemoveFromPathPs1,
  buildWindowsRemoveStartMenuShortcutPs1,
  buildWindowsStartCmd,
  buildWindowsStartMenuShortcutPs1,
  buildWindowsStartPs1,
  buildWindowsUnregisterTaskPs1,
  copyProjectFiles,
  lockfileNeedsPlatformReset,
  parseInstallerArgs,
  pruneUnnecessaryInstalledFiles,
  validateHost,
  validatePort,
} from './installerCore.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`
Factorealm — Installateur serveur autonome (Linux & Windows)

Utilisation :
  node installer/install.mjs [options]

Options principales :
  --yes, -y                    Mode non interactif (utilise les options/valeurs par défaut)
  --install-dir <chemin>       Dossier cible d'installation (défaut : dossier courant)
  --data-dir <chemin>          Dossier persistant SQLite + justificatifs (défaut : <install-dir>/data)
  --port <1-65535>             Port HTTP d'écoute (défaut : 3000)
  --host <adresse>             Interface d'écoute (défaut : 127.0.0.1 ; 0.0.0.0 pour LAN/VPN)
  --init-company               Initialiser l'entreprise et l'administrateur dès l'installation
  --no-init-company            Laisser l'initialisation pour le premier accès web
  --company-name <nom>         Raison sociale
  --legal-form <forme>         SAS, SASU, SARL, EURL, EI, Association (défaut : SAS)
  --siret <14 chiffres>        Numéro SIRET (contrôle Luhn)
  --vat-number <numéro>        N° TVA intracommunautaire (ex. FR40732829320)
  --vat-regime <régime>        reel_normal | reel_simplifie | franchise_base
  --address <adresse>          Adresse du siège
  --postal-code <cp>           Code postal
  --city <ville>               Ville
  --admin-name <nom>           Nom complet de l'administrateur
  --admin-email <courriel>     Courriel de l'administrateur
  --admin-password-env <VAR>   Nom de variable d'env contenant le mot de passe admin (min 10 car.)
  --skip-tests                 Ne pas exécuter la suite npm test pendant l'installation
  --skip-install               Ne pas exécuter npm install
  --skip-build                 Ne pas exécuter npm run build
  --skip-shortcuts             Ne pas créer le raccourci dans le menu Démarrer Windows
  --skip-path                  Ne pas ajouter la commande factorealm au PATH
  --omit-dev                   Installer uniquement les dépendances de production (dist/ requis)
  --runtime-only               Copier uniquement les fichiers utiles à l'exécution (exclut docs, tests, etc.)
  --install-service            Installer et activer le service systemd (Linux root uniquement)
  --help, -h                   Afficher cette aide
`);
}

async function checkPrerequisites() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    throw new Error(
      `Node.js v22+ requis (version détectée : v${process.versions.node}). Installez Node.js 22 LTS.`,
    );
  }
  try {
    await import('node:sqlite');
  } catch {
    throw new Error('Le module intégré node:sqlite est indisponible dans cette build de Node.js.');
  }

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npmCheck = spawnSync(npmCmd, ['--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (npmCheck.status !== 0) {
    throw new Error('npm est introuvable dans le PATH.');
  }
  return { npmCmd, npmVersion: String(npmCheck.stdout ?? '').trim() };
}

function runCmd(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    throw new Error(`Échec de la commande : ${cmd} ${args.join(' ')}`);
  }
}

async function askWithDefault(rl, question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = (await rl.question(`${question}${suffix} : `)).trim();
  return answer || defaultValue;
}

async function askYesNo(rl, question, defaultYes = false) {
  const hint = defaultYes ? 'O/n' : 'o/N';
  const answer = (await rl.question(`${question} (${hint}) : `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === 'o' || answer === 'oui' || answer === 'y' || answer === 'yes';
}

async function askPasswordMasked(question) {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await rl.question(`${question} : `)).trim();
    } finally {
      rl.close();
    }
  }

  return await new Promise((resolve) => {
    process.stdout.write(`${question} : `);
    const stdin = process.stdin;
    const prevRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';

    const onData = (buf) => {
      const str = buf.toString('utf8');
      for (const ch of str) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(Boolean(prevRaw));
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(Boolean(prevRaw));
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          value += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const opts = parseInstallerArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  console.log('============================================================');
  console.log('  FACTOREALM — Installateur serveur (Windows / Linux)');
  console.log('============================================================\n');

  const { npmCmd, npmVersion } = await checkPrerequisites();
  const isWin = process.platform === 'win32';
  console.log(
    `Environnement détecté : ${os.platform()} ${os.arch()} · Node v${process.versions.node} · npm ${npmVersion}\n`,
  );

  const rl = opts.yes
    ? null
    : readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // 1. Dossier d'installation
    const defaultInstallDir = SOURCE_ROOT;
    const installDir = path.resolve(
      opts.installDir ??
        (rl
          ? await askWithDefault(rl, 'Dossier d\'installation sur le serveur', defaultInstallDir)
          : defaultInstallDir),
    );

    // 2. Dossier des données persistantes
    const defaultDataDir = path.join(installDir, 'data');
    const dataDir = path.resolve(
      opts.dataDir ??
        (rl
          ? await askWithDefault(rl, 'Dossier des données (base SQLite + justificatifs)', defaultDataDir)
          : defaultDataDir),
    );

    // 3. Port & Interface réseau
    let port = opts.port;
    while (!port) {
      const rawPort = rl ? await askWithDefault(rl, 'Port HTTP d\'écoute', '3000') : '3000';
      try {
        port = validatePort(rawPort);
      } catch (err) {
        console.error((err).message);
      }
    }

    let host = opts.host;
    while (!host) {
      if (rl) {
        const lan = await askYesNo(
          rl,
          'Exposer sur le réseau local/VPN (0.0.0.0) au lieu de 127.0.0.1 uniquement ?',
          false,
        );
        host = validateHost(lan ? '0.0.0.0' : '127.0.0.1');
      } else {
        host = '127.0.0.1';
      }
    }

    // 4. Configuration de l'entreprise & premier administrateur
    let initCompany = opts.initCompany;
    if (initCompany === null) {
      initCompany = rl
        ? await askYesNo(rl, 'Configurer l\'entreprise et le premier compte admin maintenant ?', true)
        : false;
    }

    let companyConfig = null;
    if (initCompany) {
      const companyName =
        opts.companyName ?? (rl ? await askWithDefault(rl, 'Raison sociale *', '') : '');
      if (!companyName.trim()) {
        throw new Error('La raison sociale est obligatoire pour initialiser l\'entreprise.');
      }

      const legalForm =
        opts.companyName && opts.yes
          ? opts.legalForm
          : rl
          ? await askWithDefault(rl, 'Forme juridique (SAS, SASU, SARL, EURL, EI, Association)', opts.legalForm)
          : opts.legalForm;
      const vatRegime =
        opts.companyName && opts.yes
          ? opts.vatRegime
          : rl
          ? await askWithDefault(rl, 'Régime TVA (reel_normal, reel_simplifie, franchise_base)', opts.vatRegime)
          : opts.vatRegime;
      const siret =
        opts.siret || (rl ? await askWithDefault(rl, 'SIRET (14 chiffres, optionnel)', '') : '');
      const vatNumber =
        opts.vatNumber || (rl ? await askWithDefault(rl, 'N° TVA intracommunautaire (optionnel)', '') : '');
      const address =
        opts.address || (rl ? await askWithDefault(rl, 'Adresse du siège (optionnel)', '') : '');
      const postalCode =
        opts.postalCode || (rl ? await askWithDefault(rl, 'Code postal (optionnel)', '') : '');
      const city = opts.city || (rl ? await askWithDefault(rl, 'Ville (optionnel)', '') : '');

      const adminName =
        opts.adminName ?? (rl ? await askWithDefault(rl, 'Nom complet administrateur *', '') : '');
      if (!adminName.trim()) {
        throw new Error('Le nom complet de l\'administrateur est obligatoire.');
      }
      const adminEmail =
        opts.adminEmail ?? (rl ? await askWithDefault(rl, 'Courriel administrateur *', '') : '');
      if (!adminEmail.includes('@')) {
        throw new Error('Le courriel administrateur est invalide.');
      }

      let adminPassword = '';
      if (opts.adminPasswordEnv) {
        adminPassword = process.env[opts.adminPasswordEnv] ?? '';
      } else if (rl) {
        rl.pause();
        while (adminPassword.length < 10) {
          adminPassword = await askPasswordMasked('Mot de passe administrateur (10 caractères min.) *');
          if (adminPassword.length < 10) {
            console.error('Le mot de passe doit contenir au moins 10 caractères.');
            continue;
          }
          if (process.stdin.isTTY) {
            const confirmPw = await askPasswordMasked('Confirmez le mot de passe administrateur');
            if (confirmPw !== adminPassword) {
              console.error('Les mots de passe ne correspondent pas.');
              adminPassword = '';
            }
          }
        }
        rl.resume();
      }

      if (adminPassword.length < 10) {
        throw new Error(
          'Mot de passe administrateur invalide ou absent (10 caractères minimum requis).',
        );
      }

      companyConfig = {
        companyName: companyName.trim(),
        legalForm,
        vatRegime,
        siret,
        vatNumber,
        address,
        postalCode,
        city,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
      };
    }

    const runTests = opts.skipTests
      ? false
      : rl
      ? await askYesNo(rl, 'Exécuter les tests automatisés après compilation ?', true)
      : true;

    let installService = opts.installService;
    if (!installService && rl && !isWin && typeof process.getuid === 'function' && process.getuid() === 0) {
      installService = await askYesNo(
        rl,
        'Installer et démarrer le service systemd factorealm.service maintenant ?',
        false,
      );
    }

    rl?.close();

    const isDistinctTarget = path.resolve(SOURCE_ROOT) !== installDir;
    const hasPrebuiltDist = fs.existsSync(path.join(SOURCE_ROOT, 'dist', 'index.html'));
    const runtimeOnly = opts.runtimeOnly || (opts.skipBuild && hasPrebuiltDist);

    // 5. Copie des fichiers si dossier cible distinct (sans docs, dépôts de packaging ni fichiers inutiles)
    console.log(`\n[1/5] Préparation du dossier d'installation : ${installDir}`);
    if (isDistinctTarget) {
      copyProjectFiles(SOURCE_ROOT, installDir, {
        includeTests: runTests,
        runtimeOnly,
      });
      console.log(
        runtimeOnly
          ? '      Fichiers d\'exécution copiés (docs, sources frontend et tests exclus).'
          : '      Fichiers applicatifs copiés (docs, exemples et scripts de packaging exclus).',
      );
    }
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'factorealm.sqlite');
    const uploadDir = path.join(dataDir, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    // 6. Génération .env
    console.log('[2/5] Écriture de la configuration (.env)...');
    const envPath = path.join(installDir, '.env');
    fs.writeFileSync(
      envPath,
      buildEnvFileContent({ port, host, dbPath, uploadDir }),
      { mode: 0o600 },
    );

    // 7. Installation dépendances & build
    if (!opts.skipInstall) {
      const lockPath = path.join(installDir, 'package-lock.json');
      if (lockfileNeedsPlatformReset(lockPath)) {
        console.log(
          `      Lockfile d'une autre plateforme détecté : réinitialisation pour ${process.platform}-${process.arch}...`,
        );
        fs.rmSync(lockPath, { force: true });
        fs.rmSync(path.join(installDir, 'node_modules'), { recursive: true, force: true });
      }
      const useOmitDev = opts.omitDev && (opts.skipBuild || fs.existsSync(path.join(installDir, 'dist', 'index.html'))) && !runTests;
      console.log(
        useOmitDev
          ? '[3/5] Installation des dépendances de production (npm install --omit=dev)...'
          : '[3/5] Installation des dépendances npm...',
      );
      runCmd(npmCmd, useOmitDev ? ['install', '--omit=dev'] : ['install'], installDir);
    } else {
      console.log('[3/5] Installation npm ignorée (--skip-install).');
    }

    if (!opts.skipBuild) {
      console.log('[4/5] Compilation frontend (vite build)...');
      runCmd(npmCmd, ['run', 'build'], installDir);
    } else {
      console.log('[4/5] Compilation ignorée (--skip-build).');
    }

    if (runTests) {
      console.log('      Exécution des tests automatisés (npm test)...');
      runCmd(npmCmd, ['test'], installDir);
    }

    if (isDistinctTarget) {
      const hasCompiledDist = fs.existsSync(path.join(installDir, 'dist', 'index.html'));
      if (opts.omitDev && !opts.skipInstall && !opts.skipBuild && hasCompiledDist) {
        runCmd(npmCmd, ['prune', '--omit=dev'], installDir);
      }
      pruneUnnecessaryInstalledFiles(installDir, {
        removeFrontendSources: Boolean(opts.omitDev && hasCompiledDist),
      });
    }

    // 8. Initialisation base + entreprise si demandée
    let recoveryResult = null;
    if (companyConfig) {
      console.log('[5/5] Initialisation SQLite de l\'entreprise et du compte administrateur...');
      const tsxCli = path.join(installDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
      const bootstrapScript = path.join(installDir, 'installer', 'bootstrap-company.ts');
      const res = spawnSync(process.execPath, [tsxCli, bootstrapScript], {
        cwd: installDir,
        input: JSON.stringify({
          ...companyConfig,
          dbPath,
          uploadDir,
        }),
        encoding: 'utf8',
      });
      if (res.status !== 0) {
        throw new Error(`Erreur initialisation entreprise : ${res.stderr || res.stdout}`);
      }
      recoveryResult = JSON.parse(res.stdout);
    } else {
      console.log('[5/5] Initialisation entreprise reportée au premier accès web.');
    }

    // 9. Génération des lanceurs, service OS et enregistrement dans le PATH
    let installedPathTarget = null;
    let pathNeedsReload = false;

    if (!isWin) {
      const cliEntry = path.join(installDir, 'bin', 'factorealm.mjs');
      if (fs.existsSync(cliEntry)) {
        fs.chmodSync(cliEntry, 0o755);
      }

      const linuxStartPath = path.join(installDir, 'factorealm-start.sh');
      fs.writeFileSync(linuxStartPath, buildLinuxStartScript({ installDir }), { mode: 0o755 });
      fs.writeFileSync(
        path.join(installDir, 'factorealm.service'),
        buildLinuxSystemdUnit({
          installDir,
          envFilePath: envPath,
          nodeBinPath: process.execPath,
          userName: os.userInfo().username,
        }),
      );
      fs.writeFileSync(
        path.join(installDir, 'install-systemd.sh'),
        buildLinuxSystemdInstallScript({ installDir }),
        { mode: 0o755 },
      );

      if (!opts.skipPath) {
        const wrapperContent = buildLinuxCliWrapper({ installDir });
        const customBinDir = process.env.FACTOREALM_BIN_DIR?.trim();
        const candidateDirs = customBinDir
          ? [customBinDir]
          : ['/usr/local/bin', path.join(os.homedir(), '.local', 'bin')];

        for (const binDir of candidateDirs) {
          try {
            fs.mkdirSync(binDir, { recursive: true });
            const targetBin = path.join(binDir, 'factorealm');
            fs.writeFileSync(targetBin, wrapperContent, { mode: 0o755 });
            installedPathTarget = targetBin;
            if (!customBinDir && binDir !== '/usr/local/bin') {
              const pathParts = (process.env.PATH ?? '').split(':');
              if (!pathParts.includes(binDir)) {
                const exportLine = 'export PATH="$HOME/.local/bin:$PATH"';
                for (const rcName of ['.bashrc', '.profile']) {
                  const rcPath = path.join(os.homedir(), rcName);
                  if (fs.existsSync(rcPath) || rcName === '.profile') {
                    const currentRc = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, 'utf8') : '';
                    if (!currentRc.includes('.local/bin')) {
                      fs.appendFileSync(rcPath, `\n# Ajouté par l'installateur Factorealm\n${exportLine}\n`);
                    }
                  }
                }
                pathNeedsReload = true;
              }
            }
            break;
          } catch {
            // Essayer le dossier suivant (ex. ~/.local/bin si /usr/local/bin non inscriptible)
          }
        }
      }
    } else {
      fs.writeFileSync(path.join(installDir, 'factorealm-start.cmd'), buildWindowsStartCmd({ installDir }));
      fs.writeFileSync(path.join(installDir, 'factorealm-start.ps1'), buildWindowsStartPs1({ installDir }));
      fs.writeFileSync(
        path.join(installDir, 'register-windows-task.ps1'),
        buildWindowsRegisterTaskPs1({ installDir, dataDir }),
      );
      fs.writeFileSync(
        path.join(installDir, 'unregister-windows-task.ps1'),
        buildWindowsUnregisterTaskPs1({}),
      );
      const createShortcutPath = path.join(installDir, 'create-start-menu-shortcut.ps1');
      fs.writeFileSync(
        createShortcutPath,
        buildWindowsStartMenuShortcutPs1({ installDir, port }),
      );
      fs.writeFileSync(
        path.join(installDir, 'remove-start-menu-shortcut.ps1'),
        buildWindowsRemoveStartMenuShortcutPs1(),
      );

      const binDir = path.join(installDir, 'bin');
      const addToPathScript = path.join(installDir, 'add-to-path.ps1');
      fs.writeFileSync(addToPathScript, buildWindowsAddToPathPs1({ binDir }));
      fs.writeFileSync(
        path.join(installDir, 'remove-from-path.ps1'),
        buildWindowsRemoveFromPathPs1({ binDir }),
      );

      if (!opts.skipShortcuts) {
        try {
          runCmd(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', createShortcutPath],
            installDir,
          );
        } catch (shortcutErr) {
          console.warn(`Avertissement raccourci menu Démarrer : ${(shortcutErr).message}`);
        }
      }

      if (!opts.skipPath) {
        try {
          runCmd(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', addToPathScript],
            installDir,
          );
          installedPathTarget = binDir;
          pathNeedsReload = true;
        } catch (pathErr) {
          console.warn(`Avertissement ajout au PATH Windows : ${(pathErr).message}`);
        }
      }
    }

    if (installService && !isWin) {
      console.log('\nInstallation du service systemd factorealm.service...');
      runCmd('bash', [path.join(installDir, 'install-systemd.sh')], installDir);
    }

    const displayUrlHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log('\n============================================================');
    console.log('  INSTALLATION TERMINÉE');
    console.log('============================================================');
    console.log(`  Dossier         : ${installDir}`);
    console.log(`  Données         : ${dataDir}`);
    console.log(`  Configuration   : ${envPath}`);
    console.log(`  URL locale      : http://${displayUrlHost}:${port}`);
    if (installedPathTarget) {
      console.log(`  CLI PATH        : ${installedPathTarget}`);
    }

    if (recoveryResult?.alreadyInitialized) {
      console.log(`  Entreprise      : déjà initialisée (${recoveryResult.companyName})`);
    } else if (recoveryResult?.recoveryKey) {
      console.log(`  Entreprise      : ${recoveryResult.companyName}`);
      console.log(`  Admin           : ${recoveryResult.adminEmail}`);
      console.log('');
      console.log('  CLÉ DE RÉCUPÉRATION ENTREPRISE (AFFICHÉE UNE SEULE FOIS) :');
      console.log(`  >>> ${recoveryResult.recoveryKey} <<<`);
      console.log('  Notez cette clé hors ligne dès maintenant.');
    }

    console.log('\n  Commandes disponibles (depuis un terminal) :');
    console.log('    factorealm start    — Démarrer le serveur en arrière-plan');
    console.log('    factorealm stop     — Arrêter le serveur');
    console.log('    factorealm restart  — Redémarrer le serveur');
    console.log('    factorealm status   — Vérifier l\'état, le PID et le port');
    if (pathNeedsReload) {
      console.log(
        isWin
          ? '  Note : ouvrez un nouveau terminal PowerShell/CMD pour recharger le PATH.'
          : '  Note : ouvrez un nouveau terminal (ou lancez `source ~/.profile`) pour activer ~/.local/bin.',
      );
    }
    if (!isWin) {
      console.log(`  Service systemd : sudo bash "${installDir}/install-systemd.sh"`);
    } else {
      console.log('  Service Windows : (Admin PowerShell) .\\register-windows-task.ps1');
    }
    console.log('============================================================\n');
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error(`\n[ERREUR] ${(err).message}`);
  process.exit(1);
});
