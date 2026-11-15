import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Download, ExternalLink, FileText, Lock, Scale, ShieldCheck, UserX } from 'lucide-react';
import type { CompanyProfile, Contact, RoleCode } from '../core/types';
import { apiFetch, downloadBlobText } from '../lib/apiClient';

interface ComplianceDocsViewProps {
  company: CompanyProfile;
  userRole: RoleCode;
  contacts: Contact[];
  initialTab?: 'guide' | 'rgpd' | 'legal';
  onRefresh: () => Promise<void>;
}

interface RgpdRegistryResponse {
  controller: {
    name: string;
    siret: string;
    address: string;
    dpoName: string;
    dpoEmail: string;
  };
  retentionDays: number;
  processingActivities: Array<{
    id: string;
    title: string;
    purpose: string;
    legalBasis: string;
    dataCategories: string;
    retention: string;
  }>;
  counts: {
    users: number;
    contacts: number;
    documents: number;
    tickets: number;
    activeSessions: number;
  };
}

const GUIDE_SECTIONS = [
  {
    id: 'start',
    title: '1. Premier démarrage & Clé de récupération',
    body: [
      'Lors du premier lancement, initialisez une entreprise réelle ou un espace de démonstration sans mot de passe par défaut.',
      'La clé de récupération entreprise (FRK-...) s\'affiche une unique fois. Conservez-la hors ligne pour pouvoir réinitialiser un accès administrateur perdu.',
      'Les mots de passe exigent au minimum 10 caractères combinant au moins 3 catégories (minuscules, majuscules, chiffres, symboles).',
    ],
  },
  {
    id: 'security',
    title: '2. Sécurité, Inactivité & Fermeture de fenêtre',
    body: [
      'Les sessions utilisent un cookie HttpOnly de session navigateur : la fermeture du navigateur requiert une nouvelle connexion.',
      'Un minuteur d\'inactivité (paramétrable dans Administration, 15 min par défaut) déconnecte automatiquement l\'utilisateur et purge la session côté serveur.',
      'Activez la double authentification TOTP (KeePassXC, Bitwarden, FreeOTP) et révoquez vos sessions actives à distance dans Administration > Sécurité.',
    ],
  },
  {
    id: 'logo',
    title: '3. Logo d\'entreprise & Identité documentaire',
    body: [
      'Dans Administration > Entreprise & Confort, importez le logo de votre entreprise (PNG, JPEG ou WebP).',
      'Une fois enregistré, le logo s\'affiche dans l\'en-tête de la barre d\'action de gauche, dans l\'aperçu des devis/factures et directement sur les PDF générés.',
    ],
  },
  {
    id: 'billing',
    title: '4. Devis, Facturation, Avoirs & Factur-X',
    body: [
      'Créez vos documents en brouillon puis cliquez sur Finaliser et numéroter pour verrouiller une séquence immuable (FAC-AAAA-XXXX) et générer automatiquement l\'écriture comptable de vente (VT).',
      'Convertissez un devis en facture ou en acompte (30 %) sans ressaisie, émettez des avoirs liés, consignez les règlements et exportez le PDF ou le XML Factur-X.',
    ],
  },
  {
    id: 'accounting',
    title: '5. Trésorerie, Achats & Comptabilité FEC',
    body: [
      'Importez vos relevés bancaires CSV avec déduplication et règles automatiques, contrôlez les doublons SHA-256 sur les justificatifs et validez les notes de frais.',
      'Consultez le récapitulatif de TVA, saisissez des opérations diverses équilibrées (Débit = Crédit), clôturez les périodes mensuelles et exportez le FEC (Art. A.47 A-1 du LPF).',
    ],
  },
  {
    id: 'tickets',
    title: '6. Support informatique interne (Tickets IT)',
    body: [
      'Tout utilisateur peut ouvrir un ticket (TCK-AAAA-XXXX) en précisant catégorie et priorité.',
      'Les administrateurs et gestionnaires assignent un technicien, mettent à jour le statut, consignent la note de résolution et échangent via commentaires publics ou notes internes.',
    ],
  },
  {
    id: 'cli',
    title: '7. Pilotage serveur (CLI factorealm)',
    body: [
      'Sur serveur Windows ou Linux installé via install.ps1, install.sh ou l\'installateur Inno Setup :',
      'factorealm start · factorealm status · factorealm restart · factorealm stop',
    ],
  },
];

export function ComplianceDocsView({
  company,
  userRole,
  contacts,
  initialTab = 'guide',
  onRefresh,
}: ComplianceDocsViewProps) {
  const [subTab, setSubTab] = useState<'guide' | 'rgpd' | 'legal'>(initialTab);
  const [guideFilter, setGuideFilter] = useState('');
  const [registry, setRegistry] = useState<RgpdRegistryResponse | null>(null);
  const [selectedContactId, setSelectedContactId] = useState(contacts[0]?.id ?? '');
  const [anonymizeConfirm, setAnonymizeConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canManageRgpd = userRole === 'admin';

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const loadRegistry = useCallback(async () => {
    try {
      const data = await apiFetch<RgpdRegistryResponse>('/rgpd/registry');
      setRegistry(data);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'rgpd') {
      void loadRegistry();
    }
  }, [subTab, loadRegistry]);

  const filteredGuide = GUIDE_SECTIONS.filter((sec) => {
    if (!guideFilter.trim()) return true;
    const q = guideFilter.trim().toLowerCase();
    return sec.title.toLowerCase().includes(q) || sec.body.some((p) => p.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            RGPD, Documentation & Mentions légales
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Guide d'utilisation, registre des traitements Article 30, portabilité des données et licence GNU AGPL-3.0
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <button
            type="button"
            onClick={() => setSubTab('guide')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              subTab === 'guide' ? 'bg-[#0066FF] text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
          </button>
          <button
            type="button"
            onClick={() => setSubTab('rgpd')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              subTab === 'rgpd' ? 'bg-[#0066FF] text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Conformité RGPD
          </button>
          <button
            type="button"
            onClick={() => setSubTab('legal')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              subTab === 'legal' ? 'bg-[#0066FF] text-white' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            Licence & Confidentialité
          </button>
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

      {subTab === 'guide' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <label htmlFor="guide-search" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Rechercher dans le manuel d'utilisation
            </label>
            <input
              id="guide-search"
              value={guideFilter}
              onChange={(e) => setGuideFilter(e.target.value)}
              placeholder="Ex. facture, logo, FEC, TOTP, factorealm start, RGPD..."
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredGuide.map((sec) => (
              <section
                key={sec.id}
                className="rounded-lg border border-slate-200 bg-white p-5 space-y-2.5 dark:border-slate-800 dark:bg-[#0D1B2E]"
              >
                <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                  {sec.title}
                </h2>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300 list-disc pl-4">
                  {sec.body.map((paragraph, i) => (
                    <li key={i}>{paragraph}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {subTab === 'rgpd' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-2 dark:border-slate-800 dark:bg-[#0D1B2E]">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Responsable de traitement & DPO
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Entreprise : <strong>{registry?.controller.name || company.name}</strong>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Référent RGPD / DPO : <strong>{registry?.controller.dpoName || 'Non désigné'}</strong>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Contact DPO : <span className="font-mono">{registry?.controller.dpoEmail || company.email || '—'}</span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Durée légale paramétrée : <strong>{registry?.retentionDays ?? company.rgpdRetentionDays} jours</strong>
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Portabilité personnelle (Art. 15 & 20)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Téléchargez l'ensemble des données liées à votre compte (profil, notes de frais, temps saisis, tickets IT et actions récentes) au format JSON structuré.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  try {
                    const data = await apiFetch<Record<string, unknown>>('/rgpd/export/me');
                    downloadBlobText(
                      `factorealm-rgpd-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`,
                      JSON.stringify(data, null, 2),
                      'application/json;charset=utf-8',
                    );
                    setInfo('Export personnel RGPD téléchargé.');
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Download className="h-3.5 w-3.5" />
                Exporter mes données personnelles (JSON)
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-2 dark:border-slate-800 dark:bg-[#0D1B2E]">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Périmètre stocké localement
              </h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-900">
                  <span className="text-slate-500">Utilisateurs</span>
                  <p className="font-mono font-bold text-base">{registry?.counts.users ?? '—'}</p>
                </div>
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-900">
                  <span className="text-slate-500">Tiers actifs</span>
                  <p className="font-mono font-bold text-base">{registry?.counts.contacts ?? '—'}</p>
                </div>
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-900">
                  <span className="text-slate-500">Documents</span>
                  <p className="font-mono font-bold text-base">{registry?.counts.documents ?? '—'}</p>
                </div>
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-900">
                  <span className="text-slate-500">Tickets IT</span>
                  <p className="font-mono font-bold text-base">{registry?.counts.tickets ?? '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Registre Art. 30 */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Registre des activités de traitement (Article 30 du RGPD)
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {registry?.processingActivities.map((act) => (
                <div
                  key={act.id}
                  className="rounded-md border border-slate-200 p-4 space-y-1.5 dark:border-slate-700"
                >
                  <h3 className="text-sm font-bold text-[#081C3A] dark:text-white">{act.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong>Finalité :</strong> {act.purpose}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong>Base légale :</strong> {act.legalBasis}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong>Catégories :</strong> {act.dataCategories}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <strong>Conservation :</strong> {act.retention}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Exercice des droits sur un tiers (admin) */}
          {canManageRgpd && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Gestion des demandes RGPD d'un tiers (Administrateur)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Exportez le dossier d'un contact (Art. 15/20) ou anonymisez ses coordonnées personnelles (Art. 17) tout en préservant l'intégrité comptable des factures déjà émises (Art. L123-22).
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <select
                  aria-label="Sélectionner un tiers pour action RGPD"
                  value={selectedContactId || contacts[0]?.id || ''}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {contacts.length === 0 && <option value="">Aucun tiers actif</option>}
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.email || 'sans courriel'})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedContactId && !contacts[0]?.id}
                  onClick={async () => {
                    const target = selectedContactId || contacts[0]?.id;
                    if (!target) return;
                    setError(null);
                    try {
                      const data = await apiFetch<Record<string, unknown>>(`/rgpd/export/contact/${target}`);
                      downloadBlobText(
                        `factorealm-rgpd-tiers-${target}.json`,
                        JSON.stringify(data, null, 2),
                        'application/json;charset=utf-8',
                      );
                      setInfo('Dossier RGPD du tiers téléchargé.');
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exporter dossier tiers (JSON)
                </button>
                <div className="flex gap-2">
                  <input
                    aria-label="Confirmation anonymisation RGPD"
                    placeholder="Taper ANONYMISER"
                    value={anonymizeConfirm}
                    onChange={(e) => setAnonymizeConfirm(e.target.value)}
                    className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={anonymizeConfirm.trim().toUpperCase() !== 'ANONYMISER'}
                    onClick={async () => {
                      const target = selectedContactId || contacts[0]?.id;
                      if (!target) return;
                      setError(null);
                      try {
                        await apiFetch(`/rgpd/anonymize-contact/${target}`, { method: 'POST' });
                        setAnonymizeConfirm('');
                        setInfo('Données personnelles du tiers anonymisées conformément à l\'article 17 du RGPD.');
                        await loadRegistry();
                        await onRefresh();
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40 whitespace-nowrap"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    Anonymiser
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'legal' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-[#2DBE8D]" />
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Politique de confidentialité & Souveraineté
              </h2>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Factorealm fonctionne en circuit fermé sur votre propre serveur Windows ou Linux. Aucune donnée financière, comptable ou personnelle n'est transmise à un éditeur tiers.
            </p>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
              <li>Base SQLite locale avec écritures auditées et sauvegardes chiffrées AES-256-GCM (`.frbak`).</li>
              <li>Cookies strictement techniques (`fr_session` HttpOnly SameSite=Lax) : aucun cookie publicitaire ou de suivi.</li>
              <li>Expiration automatique de session sur inactivité + déconnexion à la fermeture du navigateur.</li>
              <li>Protection anti-CSRF par contrôle d'origine, verrouillage après échecs de connexion et hachage `scrypt`.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#0066FF]" />
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Licence libre GNU AGPL-3.0 & Auteur
              </h2>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <strong>Factorealm</strong> · by{' '}
              <a
                href="https://github.com/Thibstudio24"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#0066FF] hover:underline"
              >
                Thibstudio
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700 max-h-60 overflow-y-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              GNU AFFERO GENERAL PUBLIC LICENSE (AGPL-3.0) — Version 3, 19 November 2007.
              Copyright (C) 2026 Thibstudio (https://github.com/Thibstudio24).
              Ce programme est un logiciel libre : vous pouvez le redistribuer et/ou le modifier selon les termes de la Licence Publique Générale GNU Affero telle que publiée par la Free Software Foundation, version 3 ou ultérieure.
              Toute version modifiée accessible via un réseau doit mettre son code source correspondant à disposition des utilisateurs (Section 13).
              Le texte complet figure dans le fichier LICENSE à la racine du dépôt.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
