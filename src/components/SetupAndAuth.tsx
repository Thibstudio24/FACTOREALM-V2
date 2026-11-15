import { useState } from 'react';
import { Copy, Check, ExternalLink, KeyRound, ShieldCheck, Sun, Moon, X } from 'lucide-react';
import { apiFetch, downloadBlobText } from '../lib/apiClient';
import { LogoMark } from './LogoMark';

interface SetupAndAuthProps {
  initialized: boolean;
  companyName: string | null;
  dark: boolean;
  onToggleDark: () => void;
  onAuthenticated: () => void;
}

export function SetupAndAuth({
  initialized,
  companyName,
  dark,
  onToggleDark,
  onAuthenticated,
}: SetupAndAuthProps) {
  const [setupMode, setSetupMode] = useState<'real' | 'demo'>('real');
  const [authTab, setAuthTab] = useState<'login' | 'recover'>('login');
  const [legalModal, setLegalModal] = useState<'rgpd' | 'license' | null>(null);

  // Setup fields
  const [compName, setCompName] = useState('');
  const [legalForm, setLegalForm] = useState('SAS');
  const [siret, setSiret] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [vatRegime, setVatRegime] = useState('reel_normal');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Recovery key shown once after init
  const [issuedRecoveryKey, setIssuedRecoveryKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  // Recovery fields
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverNewPassword, setRecoverNewPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSetupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = setupMode === 'demo' ? '/setup/demo' : '/setup/init';
      const payload =
        setupMode === 'demo'
          ? { adminName, adminEmail, adminPassword }
          : {
              companyName: compName,
              legalForm,
              siret,
              vatNumber,
              address,
              postalCode,
              city,
              vatRegime,
              adminName,
              adminEmail,
              adminPassword,
            };
      const res = await apiFetch<{ recoveryKey: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      sessionStorage.setItem('fr_window_session', '1');
      setIssuedRecoveryKey(res.recoveryKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ ok?: boolean; requires2fa?: boolean; requires2faSetup?: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          totpCode: requires2fa ? totpCode : undefined,
        }),
      });
      if (res.requires2fa) {
        setRequires2fa(true);
        setInfo('Saisissez le code à 6 chiffres généré par votre application TOTP.');
        return;
      }
      sessionStorage.setItem('fr_window_session', '1');
      onAuthenticated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecoverSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/recover', {
        method: 'POST',
        body: JSON.stringify({
          recoveryKey: recoveryKeyInput,
          adminEmail: recoverEmail,
          newPassword: recoverNewPassword,
        }),
      });
      setInfo('Mot de passe administrateur réinitialisé et sessions précédentes révoquées. Vous pouvez vous connecter.');
      setAuthTab('login');
      setLoginEmail(recoverEmail);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (issuedRecoveryKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 dark:bg-[#071120]">
        <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="mb-6 flex items-center justify-between">
            <LogoMark />
            <button
              type="button"
              onClick={onToggleDark}
              aria-label="Changer de thème"
              className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-start gap-3 mb-4">
            <ShieldCheck className="h-6 w-6 text-[#2DBE8D] shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Clé de récupération entreprise générée
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Conservez cette clé hors ligne (coffre-fort ou papier sécurisé). Elle ne sera plus affichée et aucune copie centrale n'existe.
              </p>
            </div>
          </div>

          <div className="my-5 rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm font-semibold tracking-wide text-[#081C3A] break-all dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {issuedRecoveryKey}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(issuedRecoveryKey);
                setCopiedKey(true);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {copiedKey ? <Check className="h-4 w-4 text-[#2DBE8D]" /> : <Copy className="h-4 w-4" />}
              {copiedKey ? 'Copiée' : 'Copier la clé'}
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBlobText(
                  'factorealm-cle-recuperation.txt',
                  `FACTOREALM — CLÉ DE RÉCUPÉRATION ENTREPRISE\nDate : ${new Date().toISOString()}\nClé : ${issuedRecoveryKey}\n\nÀ conserver en lieu sûr. Aucune copie centrale.\n`,
                )
              }
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Télécharger (.txt)
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem('fr_window_session', '1');
                onAuthenticated();
              }}
              className="ml-auto rounded-md bg-[#0066FF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Accéder à Factorealm
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-slate-50 px-4 py-6 dark:bg-[#071120]">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <LogoMark />
          <button
            type="button"
            onClick={onToggleDark}
            aria-label={dark ? 'Activer le thème clair' : 'Activer le thème sombre'}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#0D1B2E] dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? 'Thème clair' : 'Thème sombre'}
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 md:p-6 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {!initialized ? (
            <>
              <div className="mb-6">
                <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
                  Initialisation de votre instance Factorealm
                </h1>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                  Une entreprise par installation · Données locales sans serveur central · Aucun mot de passe administrateur prédéfini.
                </p>
              </div>

              <div className="mb-6 flex flex-col sm:inline-flex sm:flex-row w-full sm:w-auto gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setSetupMode('real')}
                  className={`rounded px-3.5 py-1.5 text-xs font-semibold text-center transition-colors ${
                    setupMode === 'real'
                      ? 'bg-white text-[#081C3A] shadow-sm dark:bg-[#0066FF] dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Nouvelle entreprise réelle
                </button>
                <button
                  type="button"
                  onClick={() => setSetupMode('demo')}
                  className={`rounded px-3.5 py-1.5 text-xs font-semibold text-center transition-colors ${
                    setupMode === 'demo'
                      ? 'bg-white text-[#081C3A] shadow-sm dark:bg-[#0066FF] dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Espace de démonstration (données fictives)
                </button>
              </div>

              {error && (
                <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleSetupSubmit} className="space-y-4">
                {setupMode === 'real' ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="setup-company" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Raison sociale *
                      </label>
                      <input
                        id="setup-company"
                        required
                        value={compName}
                        onChange={(e) => setCompName(e.target.value)}
                        placeholder="Ex. Atelier Horizon SAS"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-form" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Forme juridique
                      </label>
                      <select
                        id="setup-form"
                        value={legalForm}
                        onChange={(e) => setLegalForm(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="SAS">SAS</option>
                        <option value="SASU">SASU</option>
                        <option value="SARL">SARL</option>
                        <option value="EURL">EURL</option>
                        <option value="EI">Entrepreneur individuel</option>
                        <option value="Association">Association</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="setup-vat-regime" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Régime de TVA
                      </label>
                      <select
                        id="setup-vat-regime"
                        value={vatRegime}
                        onChange={(e) => setVatRegime(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="reel_normal">Réel normal</option>
                        <option value="reel_simplifie">Réel simplifié</option>
                        <option value="franchise_base">Franchise en base (art. 293 B)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="setup-siret" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        SIRET (14 chiffres)
                      </label>
                      <input
                        id="setup-siret"
                        value={siret}
                        onChange={(e) => setSiret(e.target.value)}
                        placeholder="73282932000074"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-tva" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        TVA intracommunautaire
                      </label>
                      <input
                        id="setup-tva"
                        value={vatNumber}
                        onChange={(e) => setVatNumber(e.target.value)}
                        placeholder="FR40732829320"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="setup-addr" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Adresse du siège
                      </label>
                      <input
                        id="setup-addr"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="18 rue de la République"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-cp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Code postal
                      </label>
                      <input
                        id="setup-cp"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="69002"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-city" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Ville
                      </label>
                      <input
                        id="setup-city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Lyon"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                    Cet espace crée une entreprise fictive « Atelier Horizon SAS (DÉMO) » avec devis, factures, justificatifs et écritures pour évaluer Factorealm sans altérer une comptabilité réelle.
                  </p>
                )}

                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <h2 className="mb-3 text-sm font-semibold text-[#081C3A] dark:text-white">
                    Premier compte administrateur (mot de passe défini par vous)
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="setup-admin-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Nom complet *
                      </label>
                      <input
                        id="setup-admin-name"
                        required
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="Camille Moreau"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-admin-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Courriel administrateur *
                      </label>
                      <input
                        id="setup-admin-email"
                        type="email"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@entreprise.fr"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="setup-admin-pass" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Mot de passe (10 caractères minimum) *
                      </label>
                      <input
                        id="setup-admin-pass"
                        type="password"
                        required
                        minLength={10}
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-md bg-[#0066FF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting
                      ? 'Initialisation...'
                      : setupMode === 'demo'
                      ? 'Créer l\'espace de démonstration'
                      : 'Initialiser l\'entreprise'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
                    Connexion — {companyName ?? 'Factorealm'}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Accès local protégé par session HttpOnly et contrôle des permissions par rôle.
                  </p>
                </div>
              </div>

              <div className="mb-5 flex gap-4 border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAuthTab('login')}
                  className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${
                    authTab === 'login'
                      ? 'border-[#0066FF] text-[#0066FF]'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                >
                  Identifiants
                </button>
                <button
                  type="button"
                  onClick={() => setAuthTab('recover')}
                  className={`inline-flex items-center gap-1.5 pb-2.5 text-sm font-semibold border-b-2 transition-colors ${
                    authTab === 'recover'
                      ? 'border-[#0066FF] text-[#0066FF]'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Récupération par clé
                </button>
              </div>

              {error && (
                <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              )}
              {info && (
                <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {info}
                </div>
              )}

              {authTab === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Courriel
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Mot de passe
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  {requires2fa && (
                    <div>
                      <label htmlFor="login-totp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Code TOTP (6 chiffres)
                      </label>
                      <input
                        id="login-totp"
                        required
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        placeholder="123456"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-[#0066FF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Connexion...' : 'Se connecter'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRecoverSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="rec-key" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Clé de récupération entreprise (FRK-...)
                    </label>
                    <input
                      id="rec-key"
                      required
                      value={recoveryKeyInput}
                      onChange={(e) => setRecoveryKeyInput(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="rec-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Courriel du compte administrateur
                    </label>
                    <input
                      id="rec-email"
                      type="email"
                      required
                      value={recoverEmail}
                      onChange={(e) => setRecoverEmail(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="rec-pass" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nouveau mot de passe (10 caractères minimum)
                    </label>
                    <input
                      id="rec-pass"
                      type="password"
                      required
                      minLength={10}
                      value={recoverNewPassword}
                      onChange={(e) => setRecoverNewPassword(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-md bg-[#081C3A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-[#0066FF]"
                  >
                    Réinitialiser le mot de passe administrateur
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Factorealm · by{' '}
            <a
              href="https://github.com/Thibstudio24"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[#0066FF] hover:underline"
            >
              Thibstudio
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setLegalModal('rgpd')} className="hover:underline">
              Confidentialité & RGPD
            </button>
            <button type="button" onClick={() => setLegalModal('license')} className="hover:underline">
              Licence AGPL-3.0
            </button>
          </div>
        </footer>
      </div>

      {legalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={legalModal === 'rgpd' ? 'Politique de confidentialité et RGPD' : 'Licence GNU AGPL-3.0'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl space-y-3 dark:border-slate-700 dark:bg-[#0D1B2E]">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#081C3A] dark:text-white">
                {legalModal === 'rgpd' ? 'Confidentialité & Conformité RGPD' : 'Licence libre GNU AGPL-3.0'}
              </h2>
              <button
                type="button"
                aria-label="Fermer la fenêtre légale"
                onClick={() => setLegalModal(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {legalModal === 'rgpd' ? (
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  Factorealm héberge vos données exclusivement sur votre serveur local sans télémétrie ni transfert tiers.
                </p>
                <p>
                  Un cookie de session HttpOnly strictement technique (<code>fr_session</code>) assure l'authentification et expire automatiquement à la fermeture du navigateur ou après inactivité.
                </p>
                <p>
                  Une fois connecté, le module <strong>RGPD & Documentation</strong> permet l'export JSON (Art. 15/20), la consultation du registre Article 30 et l'anonymisation des contacts (Art. 17).
                </p>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  Copyright (C) 2026 <strong>Thibstudio</strong> —{' '}
                  <a
                    href="https://github.com/Thibstudio24"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0066FF] hover:underline"
                  >
                    https://github.com/Thibstudio24
                  </a>
                </p>
                <p>
                  Distribué sous licence <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong>. Vous êtes libre d'utiliser, d'étudier, de modifier et de redistribuer ce logiciel sous les mêmes termes.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
