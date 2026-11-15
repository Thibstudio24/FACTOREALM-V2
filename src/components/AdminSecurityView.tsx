import { useEffect, useState } from 'react';
import { Download, KeyRound, Shield, Upload } from 'lucide-react';
import type { CompanyProfile, RoleCode, UserAccount } from '../core/types';
import { apiFetch, downloadBlobText } from '../lib/apiClient';

interface AdminSecurityViewProps {
  company: CompanyProfile;
  userRole: RoleCode;
  dark: boolean;
  textScale: 'standard' | 'comfort' | 'large';
  highContrast: boolean;
  onToggleDark: () => void;
  onChangeTextScale: (scale: 'standard' | 'comfort' | 'large') => void;
  onToggleHighContrast: () => void;
  onRefresh: () => Promise<void>;
  onLoggedOut: () => void;
}

export function AdminSecurityView({
  company,
  userRole,
  dark,
  textScale,
  highContrast,
  onToggleDark,
  onChangeTextScale,
  onToggleHighContrast,
  onRefresh,
  onLoggedOut,
}: AdminSecurityViewProps) {
  const [subTab, setSubTab] = useState<'company' | 'users' | 'security' | 'backups' | 'import' | 'audit'>('company');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Profil entreprise
  const [compName, setCompName] = useState(company.name);
  const [compSiret, setCompSiret] = useState(company.siret);
  const [compVat, setCompVat] = useState(company.vatNumber);
  const [compAddr, setCompAddr] = useState(company.address);
  const [compCity, setCompCity] = useState(company.city);
  const [compIban, setCompIban] = useState(company.iban);

  // Utilisateurs & Audit
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, string>>>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<RoleCode>('gestionnaire');
  const [newUserPass, setNewUserPass] = useState('');

  // TOTP 2FA
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');

  // Sauvegarde & Restauration chiffrée
  const [backupPass, setBackupPass] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [restoreFileText, setRestoreFileText] = useState('');

  // Import historique factures CSV (Tiime / générique)
  const [histCsv, setHistCsv] = useState(
    'Numero;Client;Date;TotalHT;TotalTTC\nEXT-2025-088;Maison Valmont Architectes;2025-12-10;1000,00;1200,00',
  );
  const [histResult, setHistResult] = useState<{
    dryRun: boolean;
    imported: number;
    skippedDuplicates: number;
    errors: Array<{ row: number; reason: string }>;
  } | null>(null);

  const isAdmin = userRole === 'admin';

  async function loadAdminExtras() {
    if (isAdmin) {
      try {
        const [u, a] = await Promise.all([
          apiFetch<UserAccount[]>('/users'),
          apiFetch<Array<Record<string, string>>>('/audit'),
        ]);
        setUsers(u);
        setAuditLogs(a);
      } catch {
        // ignore if restricted
      }
    }
  }

  useEffect(() => {
    void loadAdminExtras();
  }, [isAdmin]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Administration, Sécurité & Accessibilité
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Paramètres entreprise · RBAC · 2FA TOTP sans SMS · Sauvegardes chiffrées AES-256-GCM · Audit
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {(
            [
              ['company', 'Entreprise & Confort'],
              ['security', '2FA TOTP'],
              ...(isAdmin
                ? [
                    ['users', 'Comptes & Rôles'],
                    ['backups', 'Sauvegardes chiffrées'],
                    ['import', 'Import historique'],
                    ['audit', 'Journal d\'audit'],
                  ]
                : []),
            ] as Array<[typeof subTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                subTab === id ? 'bg-[#0066FF] text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {info}
        </div>
      )}

      {subTab === 'company' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Profil légal de l'entreprise
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Raison sociale</label>
              <input
                disabled={!isAdmin}
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">SIRET</label>
                <input
                  disabled={!isAdmin}
                  value={compSiret}
                  onChange={(e) => setCompSiret(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">N° TVA</label>
                <input
                  disabled={!isAdmin}
                  value={compVat}
                  onChange={(e) => setCompVat(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Adresse</label>
                <input
                  disabled={!isAdmin}
                  value={compAddr}
                  onChange={(e) => setCompAddr(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Ville</label>
                <input
                  disabled={!isAdmin}
                  value={compCity}
                  onChange={(e) => setCompCity(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">IBAN de règlement</label>
              <input
                disabled={!isAdmin}
                value={compIban}
                onChange={(e) => setCompIban(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={async () => {
                  await apiFetch('/company', {
                    method: 'PUT',
                    body: JSON.stringify({
                      ...company,
                      name: compName,
                      siret: compSiret,
                      vatNumber: compVat,
                      address: compAddr,
                      city: compCity,
                      iban: compIban,
                    }),
                  });
                  setInfo('Profil entreprise mis à jour.');
                  await onRefresh();
                }}
                className="rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Enregistrer les paramètres
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Thème, accessibilité & ergonomie
            </h2>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium">Apparence de l'interface</p>
                <p className="text-xs text-slate-500">Thème clair ou thème sombre haute lisibilité</p>
              </div>
              <button
                type="button"
                onClick={onToggleDark}
                className="rounded-md border border-slate-300 px-3.5 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                {dark ? 'Passer en thème clair' : 'Passer en thème sombre'}
              </button>
            </div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium">Taille du texte</p>
                <p className="text-xs text-slate-500">Ajustement typographique global</p>
              </div>
              <select
                aria-label="Taille du texte"
                value={textScale}
                onChange={(e) => onChangeTextScale(e.target.value as typeof textScale)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="standard">Standard (16px)</option>
                <option value="comfort">Confort (17px)</option>
                <option value="large">Grand (18.5px)</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Contraste renforcé</p>
                <p className="text-xs text-slate-500">Accentue les contrastes de texte et bordures</p>
              </div>
              <button
                type="button"
                onClick={onToggleHighContrast}
                className="rounded-md border border-slate-300 px-3.5 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                {highContrast ? 'Désactiver' : 'Activer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === 'security' && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 max-w-xl space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#0066FF]" />
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Double authentification TOTP (sans SMS)
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Utilisez une application d'authentification standard (KeePassXC, Bitwarden, FreeOTP) compatible RFC 6238.
          </p>
          {!totpSetup ? (
            <button
              type="button"
              onClick={async () => {
                const res = await apiFetch<{ secret: string; otpauthUrl: string }>('/auth/totp/setup', {
                  method: 'POST',
                });
                setTotpSetup(res);
              }}
              className="rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white"
            >
              Générer une clé secrète TOTP
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs break-all dark:border-slate-700 dark:bg-slate-900">
                Secret Base32 : <strong>{totpSetup.secret}</strong>
              </div>
              <div className="flex gap-2">
                <input
                  aria-label="Code TOTP à 6 chiffres"
                  placeholder="Code à 6 chiffres"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    try {
                      await apiFetch('/auth/totp/verify', {
                        method: 'POST',
                        body: JSON.stringify({ code: totpCode }),
                      });
                      setInfo('Double authentification TOTP activée.');
                      setTotpSetup(null);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="rounded-md bg-[#2DBE8D] px-4 py-1.5 text-xs font-semibold text-[#081C3A]"
                >
                  Activer la 2FA
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'users' && isAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Créer un compte utilisateur
            </h2>
            <input
              aria-label="Nom complet utilisateur"
              placeholder="Nom complet"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              aria-label="Courriel utilisateur"
              type="email"
              placeholder="courriel@entreprise.fr"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <select
              aria-label="Rôle utilisateur"
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as RoleCode)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="gestionnaire">Gestionnaire</option>
              <option value="salarie">Salarié</option>
              <option value="comptable">Comptable</option>
              <option value="admin">Administrateur</option>
            </select>
            <input
              aria-label="Mot de passe initial"
              type="password"
              placeholder="Mot de passe (min 10 car.)"
              value={newUserPass}
              onChange={(e) => setNewUserPass(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  await apiFetch('/users', {
                    method: 'POST',
                    body: JSON.stringify({
                      email: newUserEmail,
                      fullName: newUserName,
                      role: newUserRole,
                      password: newUserPass,
                    }),
                  });
                  setNewUserEmail('');
                  setNewUserName('');
                  setNewUserPass('');
                  setInfo('Compte créé.');
                  await loadAdminExtras();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              className="w-full rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white"
            >
              Ajouter l'utilisateur
            </button>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="mb-3 font-display text-base font-bold text-[#081C3A] dark:text-white">
              Utilisateurs ({users.length})
            </h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-3">Nom & Courriel</th>
                  <th className="py-2 pr-3">Rôle</th>
                  <th className="py-2 pr-3">2FA</th>
                  <th className="py-2 text-right">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{u.fullName}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs font-semibold">{u.role}</td>
                    <td className="py-2 pr-3 text-xs">{u.totpEnabled ? 'Active' : 'Inactive'}</td>
                    <td className="py-2 text-right text-xs">
                      {u.isActive ? 'Actif' : 'Désactivé'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'backups' && isAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#2DBE8D]" />
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Exporter une sauvegarde chiffrée (.frbak)
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Regroupe la base SQLite et les justificatifs compressés, chiffrés avec AES-256-GCM (dérivation scrypt). Aucun fichier intermédiaire en clair sur le client.
            </p>
            <input
              aria-label="Phrase secrète de chiffrement"
              type="password"
              placeholder="Phrase secrète (10 caractères min.)"
              value={backupPass}
              onChange={(e) => setBackupPass(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  const env = await apiFetch<Record<string, unknown>>('/backups/export', {
                    method: 'POST',
                    body: JSON.stringify({ passphrase: backupPass }),
                  });
                  downloadBlobText(
                    `factorealm-backup-${new Date().toISOString().slice(0, 10)}.frbak`,
                    JSON.stringify(env, null, 2),
                    'application/json;charset=utf-8',
                  );
                  setInfo('Sauvegarde chiffrée téléchargée.');
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              className="inline-flex items-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Générer et télécharger (.frbak)
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Restaurer une sauvegarde chiffrée
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Vérifie les empreintes SHA-256, remplace les données transactionnellement et révoque toutes les sessions actives.
            </p>
            <input
              type="file"
              accept=".frbak,.json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setRestoreFileText(await f.text());
              }}
              className="text-xs"
            />
            <input
              aria-label="Phrase secrète de déchiffrement"
              type="password"
              placeholder="Phrase secrète de la sauvegarde"
              value={restorePass}
              onChange={(e) => setRestorePass(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  const envelope = JSON.parse(restoreFileText);
                  await apiFetch('/backups/restore', {
                    method: 'POST',
                    body: JSON.stringify({ envelope, passphrase: restorePass }),
                  });
                  onLoggedOut();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              className="inline-flex items-center gap-2 rounded-md bg-[#081C3A] px-4 py-2 text-xs font-semibold text-white dark:bg-red-700"
            >
              <Upload className="h-3.5 w-3.5" />
              Restaurer et réinitialiser les sessions
            </button>
          </div>
        </div>
      )}

      {subTab === 'import' && isAdmin && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
            Import historique de factures (ex. export CSV Tiime ou logiciel précédent)
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Conserve les références d'origine sans renumérotation arbitraire et distingue l'historique des émissions Factorealm.
          </p>
          <textarea
            aria-label="CSV factures historiques"
            rows={5}
            value={histCsv}
            onChange={(e) => setHistCsv(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={async () => {
                const preview = await apiFetch<{ headers: string[] }>('/import/csv/preview', {
                  method: 'POST',
                  body: JSON.stringify({ csvText: histCsv }),
                });
                const res = await apiFetch<typeof histResult>('/import/csv/commit', {
                  method: 'POST',
                  body: JSON.stringify({
                    kind: 'historical_invoices',
                    csvText: histCsv,
                    provenance: 'import_historique_csv',
                    dryRun: true,
                    mapping: {
                      number: preview.headers[0],
                      clientName: preview.headers[1],
                      issueDate: preview.headers[2],
                      totalHt: preview.headers[3],
                      totalTtc: preview.headers[4],
                    },
                  }),
                });
                setHistResult(res);
              }}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
            >
              Simuler l'import historique
            </button>
            <button
              type="button"
              onClick={async () => {
                const preview = await apiFetch<{ headers: string[] }>('/import/csv/preview', {
                  method: 'POST',
                  body: JSON.stringify({ csvText: histCsv }),
                });
                const res = await apiFetch<typeof histResult>('/import/csv/commit', {
                  method: 'POST',
                  body: JSON.stringify({
                    kind: 'historical_invoices',
                    csvText: histCsv,
                    provenance: 'import_historique_csv',
                    dryRun: false,
                    mapping: {
                      number: preview.headers[0],
                      clientName: preview.headers[1],
                      issueDate: preview.headers[2],
                      totalHt: preview.headers[3],
                      totalTtc: preview.headers[4],
                    },
                  }),
                });
                setHistResult(res);
                await onRefresh();
              }}
              className="rounded bg-[#0066FF] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Importer définitivement
            </button>
          </div>
          {histResult && (
            <p className="text-xs font-medium">
              {histResult.dryRun ? 'Simulation :' : 'Exécution :'} {histResult.imported} facture(s), {histResult.skippedDuplicates} doublon(s), {histResult.errors.length} erreur(s).
            </p>
          )}
        </div>
      )}

      {subTab === 'audit' && isAdmin && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <h2 className="mb-3 font-display text-base font-bold text-[#081C3A] dark:text-white">
            Journal des actions sensibles ({auditLogs.length})
          </h2>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-3">Horodatage</th>
                  <th className="py-2 pr-3">Acteur</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 pr-3 font-mono">{l.created_at?.slice(0, 19).replace('T', ' ')}</td>
                    <td className="py-1.5 pr-3">{l.actor_name}</td>
                    <td className="py-1.5 pr-3 font-mono font-semibold">{l.action}</td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-300">{l.detail || l.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
