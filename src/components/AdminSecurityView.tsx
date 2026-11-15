import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, ImagePlus, KeyRound, Laptop, Lock, RotateCcw, Shield, Trash2, Upload } from 'lucide-react';
import type { CompanyProfile, RoleCode, UserAccount } from '../core/types';
import { apiFetch, downloadBlobText } from '../lib/apiClient';

interface AdminSecurityViewProps {
  company: CompanyProfile;
  userRole: RoleCode;
  userTotpEnabled?: boolean;
  dark: boolean;
  textScale: 'standard' | 'comfort' | 'large';
  highContrast: boolean;
  onToggleDark: () => void;
  onChangeTextScale: (scale: 'standard' | 'comfort' | 'large') => void;
  onToggleHighContrast: () => void;
  onRefresh: () => Promise<void>;
  onLoggedOut: () => void;
}

interface ActiveSessionItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  lastActivityAt: string;
  expiresAt: string;
  userAgent: string;
  createdAt: string;
  isCurrent: boolean;
}

function resizeImageFileToPngDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      reject(new Error('Format refusé. Sélectionnez une image PNG, JPEG ou WebP.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image corrompue ou illisible.'));
      img.onload = () => {
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponible pour redimensionner le logo.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

export function AdminSecurityView({
  company,
  userRole,
  userTotpEnabled = false,
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

  // Profil entreprise + Logo + Sécurité + RGPD
  const [compName, setCompName] = useState(company.name);
  const [compSiret, setCompSiret] = useState(company.siret);
  const [compVat, setCompVat] = useState(company.vatNumber);
  const [compAddr, setCompAddr] = useState(company.address);
  const [compCity, setCompCity] = useState(company.city);
  const [compIban, setCompIban] = useState(company.iban);
  const [compLogo, setCompLogo] = useState<string | null>(company.logoDataUrl ?? null);
  const [sessionTimeoutMin, setSessionTimeoutMin] = useState(String(company.sessionTimeoutMinutes ?? 15));
  const [enforce2fa, setEnforce2fa] = useState(Boolean(company.enforce2fa));
  const [rgpdDpoName, setRgpdDpoName] = useState(company.rgpdDpoName ?? '');
  const [rgpdDpoEmail, setRgpdDpoEmail] = useState(company.rgpdDpoEmail ?? '');
  const [rgpdRetentionDays, setRgpdRetentionDays] = useState(String(company.rgpdRetentionDays ?? 3650));

  // Utilisateurs & Audit
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, string>>>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<RoleCode>('gestionnaire');
  const [newUserPass, setNewUserPass] = useState('');

  // TOTP 2FA, Mot de passe & Sessions actives
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);

  // Sauvegarde & Restauration chiffrée
  const [backupPass, setBackupPass] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [restoreFileText, setRestoreFileText] = useState('');

  // Réinitialisation entreprise (admin uniquement)
  const [resetPanelOpen, setResetPanelOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetTotpCode, setResetTotpCode] = useState('');
  const [resetting, setResetting] = useState(false);

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

  const loadSessions = useCallback(async () => {
    try {
      const list = await apiFetch<ActiveSessionItem[]>(`/security/sessions${isAdmin ? '?all=1' : ''}`);
      setSessions(list);
    } catch {
      // noop
    }
  }, [isAdmin]);

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
    void loadSessions();
  }, [isAdmin, loadSessions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Administration, Sécurité & Accessibilité
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Logo & profil entreprise · RBAC · 2FA TOTP sans SMS · Expiration & sessions · Sauvegardes AES-256-GCM
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {(
            [
              ['company', 'Entreprise & Confort'],
              ['security', 'Sécurité & Sessions'],
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

            {/* Logo de l'entreprise */}
            <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3 space-y-2 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Logo de l'entreprise (barre de gauche, devis & factures PDF)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    PNG, JPEG ou WebP — converti localement en PNG sécurisé
                  </p>
                </div>
                {compLogo && isAdmin && (
                  <button
                    type="button"
                    onClick={() => setCompLogo(null)}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:border-slate-700 dark:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                    Retirer
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-950">
                  {compLogo ? (
                    <img src={compLogo} alt="Aperçu logo entreprise" className="h-full w-full object-contain p-1" />
                  ) : (
                    <ImagePlus className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                {isAdmin && (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <ImagePlus className="h-3.5 w-3.5 text-[#0066FF]" />
                    Choisir un logo...
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setError(null);
                        try {
                          const dataUrl = await resizeImageFileToPngDataUrl(file);
                          setCompLogo(dataUrl);
                          setInfo('Logo prêt. Cliquez sur Enregistrer les paramètres pour l\'appliquer.');
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Politique d'expiration de session & RGPD */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div>
                <label htmlFor="comp-timeout" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Déconnexion inactivité (minutes)
                </label>
                <input
                  id="comp-timeout"
                  type="number"
                  min={1}
                  max={240}
                  disabled={!isAdmin}
                  value={sessionTimeoutMin}
                  onChange={(e) => setSessionTimeoutMin(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="comp-retention" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Conservation comptable RGPD (jours)
                </label>
                <input
                  id="comp-retention"
                  type="number"
                  min={30}
                  max={36500}
                  disabled={!isAdmin}
                  value={rgpdRetentionDays}
                  onChange={(e) => setRgpdRetentionDays(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="comp-dpo-name" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Référent RGPD / DPO
                </label>
                <input
                  id="comp-dpo-name"
                  disabled={!isAdmin}
                  placeholder="Nom du responsable"
                  value={rgpdDpoName}
                  onChange={(e) => setRgpdDpoName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="comp-dpo-email" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Courriel RGPD / DPO
                </label>
                <input
                  id="comp-dpo-email"
                  type="email"
                  disabled={!isAdmin}
                  placeholder="dpo@entreprise.fr"
                  value={rgpdDpoEmail}
                  onChange={(e) => setRgpdDpoEmail(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={enforce2fa}
                onChange={(e) => setEnforce2fa(e.target.checked)}
              />
              Recommander / imposer la double authentification TOTP à tous les comptes
            </label>

            {isAdmin && (
              <div>
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    setInfo(null);
                    try {
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
                          logoDataUrl: compLogo,
                          sessionTimeoutMinutes: Number(sessionTimeoutMin || 15),
                          enforce2fa,
                          rgpdDpoName,
                          rgpdDpoEmail,
                          rgpdRetentionDays: Number(rgpdRetentionDays || 3650),
                        }),
                      });
                      setInfo('Profil entreprise, logo et paramètres de sécurité mis à jour.');
                      await onRefresh();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Enregistrer les paramètres
                </button>
              </div>
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

          {isAdmin && (
            <div className="lg:col-span-2 rounded-lg border border-red-200 bg-red-50/60 p-5 space-y-4 dark:border-red-900/60 dark:bg-red-950/20">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display text-base font-bold text-red-900 dark:text-red-200">
                      Zone critique — Réinitialiser l'entreprise
                    </h2>
                    <p className="mt-1 text-xs text-red-800/90 dark:text-red-300/90 max-w-2xl">
                      Action réservée aux administrateurs. Supprime définitivement l'entreprise, tous les comptes utilisateurs, tiers, devis, factures, règlements, écritures comptables et justificatifs locaux pour repartir de l'assistant de premier lancement.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSubTab('backups')}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-200"
                  >
                    Exporter une sauvegarde .frbak avant
                  </button>
                  {!resetPanelOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setResetPanelOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Réinitialiser l'entreprise
                    </button>
                  )}
                </div>
              </div>

              {resetPanelOpen && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    setResetting(true);
                    try {
                      await apiFetch('/company/reset', {
                        method: 'POST',
                        body: JSON.stringify({
                          confirmText: resetConfirmText,
                          password: resetPassword,
                          totpCode: userTotpEnabled ? resetTotpCode : undefined,
                        }),
                      });
                      onLoggedOut();
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setResetting(false);
                    }
                  }}
                  className="rounded-md border border-red-200 bg-white p-4 space-y-3 dark:border-red-900/70 dark:bg-[#0D1B2E]"
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label htmlFor="reset-confirm-text" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Saisissez <span className="font-mono text-red-600 dark:text-red-400">REINITIALISER</span> pour confirmer *
                      </label>
                      <input
                        id="reset-confirm-text"
                        required
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        placeholder="REINITIALISER"
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="reset-admin-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Mot de passe administrateur actuel *
                      </label>
                      <input
                        id="reset-admin-password"
                        type="password"
                        required
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    {userTotpEnabled && (
                      <div>
                        <label htmlFor="reset-totp-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Code 2FA TOTP (6 chiffres) *
                        </label>
                        <input
                          id="reset-totp-code"
                          required
                          value={resetTotpCode}
                          onChange={(e) => setResetTotpCode(e.target.value)}
                          placeholder="123456"
                          className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setResetPanelOpen(false);
                        setResetConfirmText('');
                        setResetPassword('');
                        setResetTotpCode('');
                      }}
                      className="rounded-md border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={resetting}
                      className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {resetting ? 'Réinitialisation...' : 'Confirmer la réinitialisation définitive'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {subTab === 'security' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#0066FF]" />
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Double authentification TOTP (sans SMS)
              </h2>
            </div>
            {company.enforce2fa && !userTotpEnabled && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                La politique de l'entreprise exige l'activation de la 2FA TOTP sur votre compte.
              </div>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-300">
              État actuel : <strong>{userTotpEnabled ? 'Active et protégée' : 'Non activée'}</strong>. Utilisez KeePassXC, Bitwarden ou FreeOTP (RFC 6238).
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
                {userTotpEnabled ? 'Reconfigurer la clé secrète TOTP' : 'Générer une clé secrète TOTP'}
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
                        setTotpCode('');
                        await onRefresh();
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

          <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#0066FF]" />
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Modifier mon mot de passe
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Minimum 10 caractères combinant au moins 3 catégories (minuscules, majuscules, chiffres, symboles). Les autres sessions seront révoquées automatiquement.
            </p>
            <form
              className="space-y-2.5"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setInfo(null);
                if (newPassword !== confirmNewPassword) {
                  setError('La confirmation du nouveau mot de passe ne correspond pas.');
                  return;
                }
                try {
                  await apiFetch('/auth/change-password', {
                    method: 'POST',
                    body: JSON.stringify({ currentPassword, newPassword }),
                  });
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setInfo('Mot de passe mis à jour et autres sessions révoquées.');
                  await loadSessions();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <input
                aria-label="Mot de passe actuel"
                type="password"
                required
                placeholder="Mot de passe actuel"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <input
                aria-label="Nouveau mot de passe"
                type="password"
                required
                minLength={10}
                placeholder="Nouveau mot de passe (10+ car., 3 types)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <input
                aria-label="Confirmer nouveau mot de passe"
                type="password"
                required
                placeholder="Confirmer le nouveau mot de passe"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="rounded-md bg-[#081C3A] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-[#0066FF]"
              >
                Mettre à jour le mot de passe
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Laptop className="h-5 w-5 text-[#2DBE8D]" />
                <div>
                  <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                    Sessions actives ({sessions.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Expiration automatique après {company.sessionTimeoutMinutes ?? 15} min d'inactivité ou à la fermeture du navigateur.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch('/auth/logout-all', { method: 'POST' });
                  sessionStorage.removeItem('fr_window_session');
                  onLoggedOut();
                }}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
              >
                Déconnecter toutes mes sessions
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                    <th className="py-2 pr-3">Utilisateur</th>
                    <th className="py-2 pr-3">Dernière activité</th>
                    <th className="py-2 pr-3">Navigateur / Poste</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{s.userName}</span>
                        {s.isCurrent && (
                          <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#0066FF] dark:bg-blue-950/60">
                            Session actuelle
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono">{s.lastActivityAt.slice(0, 19).replace('T', ' ')}</td>
                      <td className="py-2 pr-3 text-slate-500 truncate max-w-[260px]">{s.userAgent || 'Navigateur local'}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/security/sessions/${s.id}`, { method: 'DELETE' });
                            if (s.isCurrent) {
                              sessionStorage.removeItem('fr_window_session');
                              onLoggedOut();
                            } else {
                              await loadSessions();
                            }
                          }}
                          className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                        >
                          Révoquer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
