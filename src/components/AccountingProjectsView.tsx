import { useEffect, useState } from 'react';
import { Download, Lock, Plus } from 'lucide-react';
import type { Contact, JournalEntry, ProjectRecord, TimeEntry } from '../core/types';
import { formatEurCents } from '../core/money';
import { apiFetch } from '../lib/apiClient';

interface AccountingProjectsViewProps {
  contacts: Contact[];
  projects: ProjectRecord[];
  timeEntries: TimeEntry[];
  onRefresh: () => Promise<void>;
}

export function AccountingProjectsView({
  contacts,
  projects,
  timeEntries,
  onRefresh,
}: AccountingProjectsViewProps) {
  const [subTab, setSubTab] = useState<'vat' | 'entries' | 'fec' | 'projects'>('vat');
  const [vat, setVat] = useState<{
    salesHtCents: number;
    purchasesHtCents: number;
    vatCollectedCents: number;
    vatDeductibleCents: number;
    vatDueCents: number;
  } | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [fecPreview, setFecPreview] = useState<{
    content: string;
    lineCount: number;
    totalDebitCents: number;
    totalCreditCents: number;
  } | null>(null);
  const [periods, setPeriods] = useState<Array<{ period_key: string; closed_at: string | null }>>([]);

  // Saisie écriture équilibrée OD
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [pieceRef, setPieceRef] = useState('');
  const [debitAcc, setDebitAcc] = useState('627000');
  const [creditAcc, setCreditAcc] = useState('512000');
  const [entryAmtEur, setEntryAmtEur] = useState('18,50');
  const [entryLabel, setEntryLabel] = useState('Frais bancaires mensuels');

  // Clôture période
  const [closePeriodKey, setClosePeriodKey] = useState(new Date().toISOString().slice(0, 7));

  // Projet & temps
  const [prjName, setPrjName] = useState('');
  const [prjClientId, setPrjClientId] = useState(contacts[0]?.id ?? '');
  const [prjRateEur, setPrjRateEur] = useState('90,00');
  const [timeProjectId, setTimeProjectId] = useState(projects[0]?.id ?? '');
  const [timeMinutes, setTimeMinutes] = useState('120');
  const [timeDesc, setTimeDesc] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function loadAccountingData() {
    try {
      const [v, e, f, p] = await Promise.all([
        apiFetch<typeof vat>('/accounting/vat-summary'),
        apiFetch<JournalEntry[]>('/accounting/entries'),
        apiFetch<typeof fecPreview>('/accounting/fec'),
        apiFetch<typeof periods>('/accounting/periods'),
      ]);
      setVat(v);
      setEntries(e);
      setFecPreview(f);
      setPeriods(p);
    } catch {
      // certains rôles (ex: salarié) n'ont pas accès comptable
    }
  }

  useEffect(() => {
    void loadAccountingData();
  }, []);

  async function handleCreateEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      await apiFetch('/accounting/entries', {
        method: 'POST',
        body: JSON.stringify({
          journalCode: 'OD',
          journalLabel: 'Opérations diverses',
          entryDate,
          pieceRef: pieceRef || `OD-${entryDate}`,
          lines: [
            {
              accountNum: debitAcc,
              accountLabel: 'Compte débité',
              label: entryLabel,
              debitEur: entryAmtEur,
              creditEur: '0',
            },
            {
              accountNum: creditAcc,
              accountLabel: 'Compte crédité',
              label: entryLabel,
              debitEur: '0',
              creditEur: entryAmtEur,
            },
          ],
        }),
      });
      setInfo('Écriture comptable équilibrée enregistrée.');
      await loadAccountingData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Comptabilité, TVA, FEC & Projets
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Synthèse préparatoire TVA · Partie double équilibrée · Export FEC à valider par votre expert-comptable
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {(
            [
              ['vat', 'TVA & Marges'],
              ['entries', 'Partie double & Clôture'],
              ['fec', 'Export FEC'],
              ['projects', 'Projets & Temps'],
            ] as const
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

      {subTab === 'vat' && vat && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs text-slate-500">Ventes HT comptabilisées</p>
            <p className="mt-2 font-mono text-xl font-bold tabular-nums">{formatEurCents(vat.salesHtCents)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs text-slate-500">TVA collectée (ventes)</p>
            <p className="mt-2 font-mono text-xl font-bold tabular-nums text-[#0066FF]">
              {formatEurCents(vat.vatCollectedCents)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs text-slate-500">TVA déductible (achats & frais)</p>
            <p className="mt-2 font-mono text-xl font-bold tabular-nums text-[#2DBE8D]">
              {formatEurCents(vat.vatDeductibleCents)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs text-slate-500">TVA nette préparatoire à décaisser</p>
            <p className="mt-2 font-mono text-xl font-bold tabular-nums text-[#081C3A] dark:text-white">
              {formatEurCents(vat.vatDueCents)}
            </p>
          </div>
        </div>
      )}

      {subTab === 'entries' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <form
              onSubmit={handleCreateEntry}
              className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]"
            >
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Saisir une écriture équilibrée (OD)
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Date écriture"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <input
                  aria-label="Référence pièce"
                  placeholder="Réf. pièce"
                  value={pieceRef}
                  onChange={(e) => setPieceRef(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Compte débité</label>
                  <input
                    value={debitAcc}
                    onChange={(e) => setDebitAcc(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Compte crédité</label>
                  <input
                    value={creditAcc}
                    onChange={(e) => setCreditAcc(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <input
                aria-label="Libellé de l'écriture"
                value={entryLabel}
                onChange={(e) => setEntryLabel(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <input
                aria-label="Montant en euros"
                value={entryAmtEur}
                onChange={(e) => setEntryAmtEur(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Valider l'écriture équilibrée
              </button>
            </form>

            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
              <h2 className="font-display text-sm font-bold text-[#081C3A] dark:text-white">
                Clôture de période mensuelle
              </h2>
              <div className="flex gap-2">
                <input
                  aria-label="Période à clôturer (AAAA-MM)"
                  value={closePeriodKey}
                  onChange={(e) => setClosePeriodKey(e.target.value)}
                  className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setError(null);
                    try {
                      await apiFetch(`/accounting/periods/${closePeriodKey}/close`, { method: 'POST' });
                      setInfo(`Période ${closePeriodKey} clôturée.`);
                      await loadAccountingData();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded bg-[#081C3A] px-3 py-1.5 text-xs font-semibold text-white dark:bg-[#0066FF]"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Clôturer
                </button>
              </div>
              {periods.length > 0 && (
                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  {periods.map((p) => (
                    <li key={p.period_key}>
                      <span className="font-mono font-semibold">{p.period_key}</span> · Clôturée le {p.closed_at?.slice(0, 10)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="mb-4 font-display text-base font-bold text-[#081C3A] dark:text-white">
              Journaux & Écritures ({entries.length})
            </h2>
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded border border-slate-200 p-3 text-xs dark:border-slate-800"
                >
                  <div className="flex justify-between font-semibold mb-1.5">
                    <span>
                      <span className="font-mono">{entry.entryNumber}</span> · {entry.journalLabel} · Pièce {entry.pieceRef}
                    </span>
                    <span className="font-mono">{entry.entryDate}</span>
                  </div>
                  <table className="w-full text-left">
                    <tbody>
                      {entry.lines.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800/70">
                          <td className="py-1 font-mono w-20">{l.accountNum}</td>
                          <td className="py-1">{l.label}</td>
                          <td className="py-1 text-right font-mono tabular-nums w-28">
                            {l.debitCents > 0 ? formatEurCents(l.debitCents) : ''}
                          </td>
                          <td className="py-1 text-right font-mono tabular-nums w-28">
                            {l.creditCents > 0 ? formatEurCents(l.creditCents) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {entries.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">Aucune écriture comptable enregistrée.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'fec' && fecPreview && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Export FEC (structure Article A.47 A-1 LPF)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {fecPreview.lineCount} ligne(s) · Débit total {formatEurCents(fecPreview.totalDebitCents)} · Crédit total {formatEurCents(fecPreview.totalCreditCents)} · Revue professionnelle indispensable avant remise fiscale.
              </p>
            </div>
            <a
              href="/api/v1/accounting/fec?download=1"
              className="inline-flex items-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              Télécharger le FEC (.txt)
            </a>
          </div>
          <pre className="max-h-80 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] dark:border-slate-800 dark:bg-slate-900">
            {fecPreview.content}
          </pre>
        </div>
      )}

      {subTab === 'projects' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Nouveau projet
              </h2>
              <input
                aria-label="Nom du projet"
                placeholder="Nom du projet"
                value={prjName}
                onChange={(e) => setPrjName(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <select
                aria-label="Client du projet"
                value={prjClientId || contacts[0]?.id || ''}
                onChange={(e) => setPrjClientId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
              <input
                aria-label="Taux horaire HT (€)"
                value={prjRateEur}
                onChange={(e) => setPrjRateEur(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!prjName.trim()) return;
                  await apiFetch('/projects', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: prjName,
                      clientId: prjClientId || contacts[0]?.id,
                      hourlyRateEur: prjRateEur,
                    }),
                  });
                  setPrjName('');
                  await onRefresh();
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-[#0066FF] px-3 py-2 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Créer le projet
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
              <h2 className="font-display text-sm font-bold text-[#081C3A] dark:text-white">
                Saisir du temps facturable
              </h2>
              <select
                aria-label="Projet imputé"
                value={timeProjectId || projects[0]?.id || ''}
                onChange={(e) => setTimeProjectId(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Durée en minutes"
                  type="number"
                  value={timeMinutes}
                  onChange={(e) => setTimeMinutes(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <input
                  aria-label="Description tâche"
                  placeholder="Tâche effectuée"
                  value={timeDesc}
                  onChange={(e) => setTimeDesc(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const pid = timeProjectId || projects[0]?.id;
                  if (!pid) return;
                  await apiFetch('/time-entries', {
                    method: 'POST',
                    body: JSON.stringify({
                      projectId: pid,
                      minutes: Number(timeMinutes),
                      description: timeDesc || 'Prestation projet',
                    }),
                  });
                  setTimeDesc('');
                  await onRefresh();
                }}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
              >
                Enregistrer le temps
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="mb-4 font-display text-base font-bold text-[#081C3A] dark:text-white">
              Projets & Facturation du temps passé ({projects.length})
            </h2>
            <div className="space-y-3">
              {projects.map((p) => {
                const unbilledMins = timeEntries
                  .filter((t) => t.projectId === p.id && t.billable && !t.billedDocumentId)
                  .reduce((s, t) => s + t.minutes, 0);
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 p-3.5 text-sm dark:border-slate-800"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-xs text-slate-500">{p.code}</span> · {p.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.clientName || 'Sans client'} · {formatEurCents(p.hourlyRateCents)}/h · {unbilledMins} min non facturée(s)
                      </p>
                    </div>
                    {unbilledMins > 0 && p.clientId && (
                      <button
                        type="button"
                        onClick={async () => {
                          setError(null);
                          try {
                            await apiFetch(`/projects/${p.id}/bill-time`, { method: 'POST' });
                            setInfo('Facture brouillon créée depuis le temps passé du projet.');
                            await onRefresh();
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                        className="rounded bg-[#2DBE8D] px-3 py-1.5 text-xs font-semibold text-[#081C3A] hover:bg-emerald-400"
                      >
                        Facturer le temps
                      </button>
                    )}
                  </div>
                );
              })}
              {projects.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">Aucun projet actif.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
