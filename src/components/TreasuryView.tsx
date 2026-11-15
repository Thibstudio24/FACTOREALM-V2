import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  BankAccount,
  BankTransaction,
  CommercialDocument,
  ForecastAssumption,
} from '../core/types';
import { formatEurCents } from '../core/money';
import { apiFetch } from '../lib/apiClient';

interface TreasuryViewProps {
  bankAccounts: BankAccount[];
  transactions: BankTransaction[];
  forecasts: ForecastAssumption[];
  documents: CommercialDocument[];
  onRefresh: () => Promise<void>;
}

export function TreasuryView({
  bankAccounts,
  transactions,
  forecasts,
  documents,
  onRefresh,
}: TreasuryViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [accName, setAccName] = useState('');
  const [accKind, setAccKind] = useState<'banque' | 'caisse'>('banque');
  const [accInitEur, setAccInitEur] = useState('0,00');

  const [csvBankId, setCsvBankId] = useState(bankAccounts[0]?.id ?? '');
  const [csvText, setCsvText] = useState(
    'Date;Libelle;Montant\n2026-11-12;VIR CLIENT REEL;1200,00\n2026-11-13;FRAIS BANCAIRES;-18,50',
  );

  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleCategory, setRuleCategory] = useState('Frais bancaires');

  const [fctLabel, setFctLabel] = useState('');
  const [fctKind, setFctKind] = useState<'encaissement' | 'decaissement'>('encaissement');
  const [fctMonthlyEur, setFctMonthlyEur] = useState('1500,00');
  const [fctNote, setFctNote] = useState('');

  const certainBalanceCents = bankAccounts.reduce((s, a) => s + a.currentBalanceCents, 0);
  const monthlyForecastNetCents = forecasts.reduce(
    (s, f) => s + (f.kind === 'encaissement' ? f.monthlyCents : -f.monthlyCents),
    0,
  );

  const finalizedInvoices = documents.filter(
    (d) => d.kind === 'facture' && d.status !== 'brouillon',
  );

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/bank-accounts', {
        method: 'POST',
        body: JSON.stringify({ name: accName, kind: accKind, initialBalanceEur: accInitEur }),
      });
      setAccName('');
      setInfo('Compte ajouté.');
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleImportBankCsv(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const preview = await apiFetch<{ headers: string[] }>('/import/csv/preview', {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      });
      const res = await apiFetch<{ imported: number; duplicates: number }>(
        '/bank-transactions/import-csv',
        {
          method: 'POST',
          body: JSON.stringify({
            bankAccountId: csvBankId || bankAccounts[0]?.id,
            csvText,
            dateCol: preview.headers[0],
            labelCol: preview.headers[1],
            amountCol: preview.headers[2],
          }),
        },
      );
      setInfo(`Relevé importé : ${res.imported} mouvement(s) ajouté(s), ${res.duplicates} doublon(s) ignoré(s).`);
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
          Banque, Rapprochement & Prévisions
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Suivi manuel sans agrégateur externe · Distinction stricte entre soldes certains et hypothèses prévisionnelles
        </p>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Solde certain cumulé (réel)
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#081C3A] dark:text-white">
            {formatEurCents(certainBalanceCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Calculé uniquement sur mouvements enregistrés</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Impact mensuel des hypothèses
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#0066FF]">
            {monthlyForecastNetCents >= 0 ? '+' : ''}
            {formatEurCents(monthlyForecastNetCents)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Non certain · Basé sur {forecasts.length} hypothèse(s)</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Projection indicative à 3 mois
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#2DBE8D]">
            {formatEurCents(certainBalanceCents + monthlyForecastNetCents * 3)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Solde certain + 3 mois d'hypothèses</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <form
            onSubmit={handleCreateAccount}
            className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]"
          >
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Comptes banque & caisse
            </h2>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {bankAccounts.map((a) => (
                <li key={a.id} className="flex justify-between py-2">
                  <span>{a.name} <span className="text-xs text-slate-500">({a.kind})</span></span>
                  <span className="font-mono tabular-nums font-semibold">{formatEurCents(a.currentBalanceCents)}</span>
                </li>
              ))}
            </ul>
            <input
              aria-label="Nom du compte bancaire ou caisse"
              required
              placeholder="Ex. Compte épargne trésorerie"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Type de compte"
                value={accKind}
                onChange={(e) => setAccKind(e.target.value as typeof accKind)}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="banque">Banque</option>
                <option value="caisse">Caisse</option>
              </select>
              <input
                aria-label="Solde initial en euros"
                value={accInitEur}
                onChange={(e) => setAccInitEur(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-[#081C3A] px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-[#0066FF]"
            >
              Ajouter le compte
            </button>
          </form>

          <form
            onSubmit={handleImportBankCsv}
            className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]"
          >
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Import relevé bancaire CSV
            </h2>
            <select
              aria-label="Compte cible du relevé"
              value={csvBankId || bankAccounts[0]?.id || ''}
              onChange={(e) => setCsvBankId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <textarea
              aria-label="Contenu CSV du relevé bancaire"
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-[#0066FF] px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Importer le relevé CSV
            </button>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-2.5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-sm font-bold text-[#081C3A] dark:text-white">
              Règle de catégorisation automatique
            </h2>
            <div className="flex gap-2">
              <input
                aria-label="Mot-clé de libellé"
                placeholder="Mot-clé (ex. URSSAF)"
                value={ruleKeyword}
                onChange={(e) => setRuleKeyword(e.target.value)}
                className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <input
                aria-label="Catégorie associée"
                placeholder="Catégorie"
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
                className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!ruleKeyword.trim()) return;
                await apiFetch('/bank-rules', {
                  method: 'POST',
                  body: JSON.stringify({ keyword: ruleKeyword, category: ruleCategory }),
                });
                setRuleKeyword('');
                setInfo('Règle enregistrée pour les prochains imports.');
              }}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
            >
              Enregistrer la règle
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="mb-4 font-display text-base font-bold text-[#081C3A] dark:text-white">
              Mouvements bancaires & Rapprochement manuel ({transactions.length})
            </h2>
            {transactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Aucun mouvement enregistré.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Libellé & Catégorie</th>
                      <th className="py-2 pr-3 text-right">Montant</th>
                      <th className="py-2 text-right">Rapprochement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 pr-3 font-mono text-xs">{t.txDate}</td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{t.label}</div>
                          <div className="text-xs text-slate-500">{t.category}</div>
                        </td>
                        <td
                          className={`py-2 pr-3 text-right font-mono tabular-nums font-semibold ${
                            t.amountCents >= 0 ? 'text-[#2DBE8D]' : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {t.amountCents >= 0 ? '+' : ''}
                          {formatEurCents(t.amountCents)}
                        </td>
                        <td className="py-2 text-right">
                          {t.reconciledEntityId ? (
                            <span className="text-xs font-semibold text-[#2DBE8D]">Rapproché</span>
                          ) : (
                            <select
                              aria-label={`Rapprocher ${t.label}`}
                              defaultValue=""
                              onChange={async (e) => {
                                if (!e.target.value) return;
                                await apiFetch(`/bank-transactions/${t.id}/reconcile`, {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    entityType: 'facture',
                                    entityId: e.target.value,
                                  }),
                                });
                                await onRefresh();
                              }}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                              <option value="">Rapprocher à...</option>
                              {finalizedInvoices.map((inv) => (
                                <option key={inv.id} value={inv.id}>
                                  {inv.number} ({formatEurCents(inv.totalTtcCents)})
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Hypothèses prévisionnelles (séparées du solde certain)
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input
                aria-label="Libellé de l'hypothèse"
                placeholder="Ex. Contrat récurrent"
                value={fctLabel}
                onChange={(e) => setFctLabel(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <select
                aria-label="Sens prévisionnel"
                value={fctKind}
                onChange={(e) => setFctKind(e.target.value as typeof fctKind)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="encaissement">Encaissement</option>
                <option value="decaissement">Décaissement</option>
              </select>
              <input
                aria-label="Montant mensuel estimé"
                value={fctMonthlyEur}
                onChange={(e) => setFctMonthlyEur(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!fctLabel.trim()) return;
                  await apiFetch('/forecasts', {
                    method: 'POST',
                    body: JSON.stringify({
                      label: fctLabel,
                      kind: fctKind,
                      monthlyEur: fctMonthlyEur,
                      hypothesisNote: fctNote || 'Hypothèse manuelle',
                    }),
                  });
                  setFctLabel('');
                  setFctNote('');
                  await onRefresh();
                }}
                className="inline-flex items-center justify-center gap-1 rounded bg-[#0066FF] px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>
            </div>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {forecasts.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-medium">{f.label}</span>
                    <span className="ml-2 text-xs text-slate-500">· {f.hypothesisNote}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono tabular-nums font-semibold">
                      {f.kind === 'encaissement' ? '+' : '-'}
                      {formatEurCents(f.monthlyCents)} / mois
                    </span>
                    <button
                      type="button"
                      aria-label={`Supprimer l'hypothèse ${f.label}`}
                      onClick={async () => {
                        await apiFetch(`/forecasts/${f.id}`, { method: 'DELETE' });
                        await onRefresh();
                      }}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
