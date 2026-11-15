import { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  FileText,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { BankAccount, CatalogItem, CommercialDocument, Contact, DocumentKind } from '../core/types';
import { computeDocumentTotals, formatEurCents, parseDecimalToCents, parsePercentToBps, parseQuantityMilli } from '../core/money';
import { apiFetch } from '../lib/apiClient';

interface BillingViewProps {
  documents: CommercialDocument[];
  contacts: Contact[];
  catalog: CatalogItem[];
  bankAccounts: BankAccount[];
  companyName?: string;
  companyLogoDataUrl?: string | null;
  onRefresh: () => Promise<void>;
}

interface DraftLine {
  catalogItemId: string;
  label: string;
  description: string;
  quantity: string;
  unit: string;
  unitPriceEur: string;
  discountPct: string;
  vatRatePct: string;
}

const STATUS_LABELS: Record<string, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  accepte: 'Accepté',
  refuse: 'Refusé',
  finalise: 'Finalisée (immuable)',
  paye_partiel: 'Payée partiellement',
  paye: 'Payée',
  annule: 'Annulée',
};

export function BillingView({
  documents,
  contacts,
  catalog,
  bankAccounts,
  companyName,
  companyLogoDataUrl,
  onRefresh,
}: BillingViewProps) {
  const [kindFilter, setKindFilter] = useState<'tous' | DocumentKind>('tous');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(documents[0]?.id ?? null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Formulaire création document
  const [kind, setKind] = useState<DocumentKind>('devis');
  const [contactId, setContactId] = useState(contacts[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
  );
  const [vatExempt, setVatExempt] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState('Virement bancaire à 30 jours');
  const [recurrenceRule, setRecurrenceRule] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    {
      catalogItemId: '',
      label: 'Prestation de conseil',
      description: '',
      quantity: '1',
      unit: 'jour',
      unitPriceEur: '650,00',
      discountPct: '0',
      vatRatePct: '20',
    },
  ]);

  // Formulaire paiement
  const [payAmountEur, setPayAmountEur] = useState('');
  const [payMethod, setPayMethod] = useState<'virement' | 'carte' | 'cheque' | 'especes'>('virement');
  const [payRef, setPayRef] = useState('');
  const [payBankId, setPayBankId] = useState(bankAccounts[0]?.id ?? '');

  // Formulaire relance
  const [reminderNote, setReminderNote] = useState('');

  const clients = contacts.filter((c) => c.type === 'client' || c.type === 'les_deux');
  const visibleDocs = documents.filter((d) => kindFilter === 'tous' || d.kind === kindFilter);
  const activeDoc = documents.find((d) => d.id === selectedDocId) ?? visibleDocs[0] ?? null;

  // Aperçu calcul exact côté formulaire
  let previewTotals = { totalHtCents: 0, totalVatCents: 0, totalTtcCents: 0 };
  try {
    previewTotals = computeDocumentTotals(
      lines.map((l) => ({
        quantityMilli: parseQuantityMilli(l.quantity || '0'),
        unitPriceCents: parseDecimalToCents(l.unitPriceEur || '0'),
        discountBps: parsePercentToBps(l.discountPct || '0'),
        vatRateBps: parsePercentToBps(l.vatRatePct || '0'),
      })),
      0,
      vatExempt,
    );
  } catch {
    // saisie en cours
  }

  function applyCatalogItem(idx: number, itemId: string) {
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              catalogItemId: item.id,
              label: item.name,
              description: item.description,
              unit: item.unit,
              unitPriceEur: (item.unitPriceCents / 100).toFixed(2).replace('.', ','),
              vatRatePct: String(item.vatRateBps / 100),
            }
          : l,
      ),
    );
  }

  async function handleCreateDoc(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      const targetContactId = contactId || clients[0]?.id;
      if (!targetContactId) {
        throw new Error('Créez d\'abord un client dans Tiers & Catalogue.');
      }
      const created = await apiFetch<CommercialDocument>('/documents', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          contactId: targetContactId,
          title,
          issueDate,
          dueDate,
          vatExempt,
          paymentTerms,
          recurrenceRule: recurrenceRule || null,
          lines: lines.map((l) => ({
            catalogItemId: l.catalogItemId || null,
            label: l.label,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            unitPriceEur: l.unitPriceEur,
            discountBps: parsePercentToBps(l.discountPct || '0'),
            vatRateBps: parsePercentToBps(l.vatRatePct || '20'),
          })),
        }),
      });
      setShowCreateForm(false);
      setTitle('');
      setSelectedDocId(created.id);
      setInfo('Brouillon créé avec calculs exacts en centimes.');
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runDocAction(path: string, body?: unknown, successMsg = 'Opération effectuée.') {
    setError(null);
    setInfo(null);
    try {
      const updated = await apiFetch<CommercialDocument>(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (updated?.id) setSelectedDocId(updated.id);
      setInfo(successMsg);
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Devis, Facturation & Règlements
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Brouillons modifiables, finalisation transactionnelle séquentielle, acomptes, avoirs et PDF
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          {showCreateForm ? 'Fermer le formulaire' : 'Créer un devis / facture'}
        </button>
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

      {showCreateForm && (
        <form
          onSubmit={handleCreateDoc}
          className="rounded-lg border border-slate-200 bg-white p-6 space-y-5 dark:border-slate-800 dark:bg-[#0D1B2E]"
        >
          <h2 className="font-display text-lg font-bold text-[#081C3A] dark:text-white">
            Nouveau document (brouillon)
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label htmlFor="doc-kind" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Type
              </label>
              <select
                id="doc-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as DocumentKind)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="devis">Devis</option>
                <option value="facture">Facture</option>
              </select>
            </div>
            <div>
              <label htmlFor="doc-client" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Client *
              </label>
              <select
                id="doc-client"
                required
                value={contactId || clients[0]?.id || ''}
                onChange={(e) => setContactId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {clients.length === 0 && <option value="">Aucun client disponible</option>}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="doc-issue" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Date d'émission
              </label>
              <input
                id="doc-issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="doc-due" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Échéance / Validité
              </label>
              <input
                id="doc-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="doc-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Objet du document
              </label>
              <input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. Mission d'audit technique T4"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="doc-rec" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Récurrence (optionnelle)
              </label>
              <select
                id="doc-rec"
                value={recurrenceRule}
                onChange={(e) => setRecurrenceRule(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Ponctuel</option>
                <option value="mensuelle">Mensuelle</option>
                <option value="trimestrielle">Trimestrielle</option>
                <option value="annuelle">Annuelle</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Lignes de facturation</h3>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={vatExempt}
                  onChange={(e) => setVatExempt(e.target.checked)}
                />
                TVA non applicable (art. 293 B du CGI)
              </label>
            </div>

            {lines.map((line, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-12 dark:border-slate-700"
              >
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500">Catalogue (optionnel)</label>
                  <select
                    aria-label={`Article catalogue ligne ${idx + 1}`}
                    value={line.catalogItemId}
                    onChange={(e) => applyCatalogItem(idx, e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">Saisie libre</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sku} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500">Libellé *</label>
                  <input
                    required
                    aria-label={`Libellé ligne ${idx + 1}`}
                    value={line.label}
                    onChange={(e) =>
                      setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[11px] font-medium text-slate-500">Qté</label>
                  <input
                    aria-label={`Quantité ligne ${idx + 1}`}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-500">PU HT (€)</label>
                  <input
                    aria-label={`Prix unitaire HT ligne ${idx + 1}`}
                    value={line.unitPriceEur}
                    onChange={(e) =>
                      setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, unitPriceEur: e.target.value } : r)))
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[11px] font-medium text-slate-500">Rem.%</label>
                  <input
                    aria-label={`Remise ligne ${idx + 1}`}
                    value={line.discountPct}
                    onChange={(e) =>
                      setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, discountPct: e.target.value } : r)))
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[11px] font-medium text-slate-500">TVA %</label>
                  <input
                    aria-label={`TVA ligne ${idx + 1}`}
                    value={line.vatRatePct}
                    disabled={vatExempt}
                    onChange={(e) =>
                      setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, vatRatePct: e.target.value } : r)))
                    }
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="md:col-span-1 flex items-end justify-end">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`Supprimer la ligne ${idx + 1}`}
                      className="rounded p-1.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  {
                    catalogItemId: '',
                    label: '',
                    description: '',
                    quantity: '1',
                    unit: 'unité',
                    unitPriceEur: '100,00',
                    discountPct: '0',
                    vatRatePct: '20',
                  },
                ])
              }
              className="text-xs font-semibold text-[#0066FF] hover:underline"
            >
              + Ajouter une ligne
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex items-center gap-6 font-mono text-sm tabular-nums">
              <span>Total HT : <strong>{formatEurCents(previewTotals.totalHtCents)}</strong></span>
              <span>TVA : <strong>{formatEurCents(previewTotals.totalVatCents)}</strong></span>
              <span className="text-[#0066FF] dark:text-[#3B82F6]">
                Total TTC : <strong>{formatEurCents(previewTotals.totalTtcCents)}</strong>
              </span>
            </div>
            <button
              type="submit"
              className="rounded-md bg-[#0066FF] px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Enregistrer en brouillon
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3 dark:border-slate-800">
            {(
              [
                ['tous', 'Tous'],
                ['devis', 'Devis'],
                ['facture', 'Factures'],
                ['acompte', 'Acomptes'],
                ['avoir', 'Avoirs'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={`rounded px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                  kindFilter === k
                    ? 'bg-[#081C3A] text-white dark:bg-[#0066FF]'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {visibleDocs.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Aucun document commercial enregistré.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800">
                    <th className="py-2 pr-3">Numéro</th>
                    <th className="py-2 pr-3">Client & Objet</th>
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleDocs.map((d) => {
                    const isSelected = activeDoc?.id === d.id;
                    return (
                      <tr
                        key={d.id}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/70 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                        }`}
                      >
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => setSelectedDocId(d.id)}
                            className="text-left font-mono text-xs font-semibold text-[#081C3A] dark:text-slate-100"
                          >
                            {d.number ?? 'BROUILLON'}
                            <span className="block text-[11px] font-normal text-slate-500">{d.kind} · {d.issueDate}</span>
                          </button>
                        </td>
                        <td className="py-2.5 pr-3" onClick={() => setSelectedDocId(d.id)}>
                          <div className="font-medium text-slate-900 dark:text-slate-100">{d.contactNameSnapshot}</div>
                          <div className="text-xs text-slate-500 truncate max-w-[200px]">{d.title || 'Sans objet'}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-xs font-medium" onClick={() => setSelectedDocId(d.id)}>
                          <span
                            className={
                              d.status === 'paye' || d.status === 'accepte'
                                ? 'text-[#2DBE8D]'
                                : d.status === 'brouillon'
                                ? 'text-slate-500'
                                : 'text-[#0066FF]'
                            }
                          >
                            {STATUS_LABELS[d.status] ?? d.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums font-semibold" onClick={() => setSelectedDocId(d.id)}>
                          {formatEurCents(d.totalTtcCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {!activeDoc ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Sélectionnez un document pour afficher ses actions et son aperçu.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div className="flex items-start gap-3 min-w-0">
                  {companyLogoDataUrl && (
                    <img
                      src={companyLogoDataUrl}
                      alt={companyName ? `Logo ${companyName}` : 'Logo entreprise'}
                      className="h-11 w-11 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1 dark:border-slate-700"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">
                      {activeDoc.kind.toUpperCase()} · {STATUS_LABELS[activeDoc.status]}
                    </p>
                    <h2 className="font-display text-lg font-bold text-[#081C3A] dark:text-white">
                      {activeDoc.number ?? 'Brouillon non numéroté'}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {activeDoc.contactNameSnapshot} · Émis le {activeDoc.issueDate}
                    </p>
                  </div>
                </div>
                <a
                  href={`/api/v1/documents/${activeDoc.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Ouvrir PDF
                </a>
              </div>

              <div className="space-y-1.5 text-xs">
                {activeDoc.lines.map((l) => (
                  <div key={l.id} className="flex justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800/70">
                    <span className="text-slate-700 dark:text-slate-200">{l.label}</span>
                    <span className="font-mono tabular-nums font-medium">{formatEurCents(l.netHtCents)} HT</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-mono tabular-nums text-sm font-bold text-[#081C3A] dark:text-white">
                  <span>Total TTC</span>
                  <span>{formatEurCents(activeDoc.totalTtcCents)}</span>
                </div>
                {activeDoc.kind !== 'devis' && (
                  <div className="flex justify-between font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                    <span>Déjà réglé</span>
                    <span>{formatEurCents(activeDoc.paidCents)}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {activeDoc.status === 'brouillon' && (
                  <button
                    type="button"
                    onClick={() =>
                      runDocAction(
                        `/documents/${activeDoc.id}/finalize`,
                        undefined,
                        'Document finalisé avec numéro séquentiel verrouillé.',
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0066FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Finaliser et numéroter
                  </button>
                )}

                {activeDoc.kind === 'devis' && activeDoc.status !== 'accepte' && (
                  <button
                    type="button"
                    onClick={() =>
                      runDocAction(`/documents/${activeDoc.id}/status`, { status: 'accepte' }, 'Devis marqué accepté.')
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Accepter manuellement
                  </button>
                )}

                {activeDoc.kind === 'devis' && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        runDocAction(
                          `/documents/${activeDoc.id}/convert-to-invoice`,
                          undefined,
                          'Facture brouillon créée sans ressaisie.',
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Transformer en facture
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runDocAction(
                          `/documents/${activeDoc.id}/create-deposit`,
                          { percent: 30 },
                          'Facture d\'acompte (30 %) créée.',
                        )
                      }
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100"
                    >
                      Acompte 30 %
                    </button>
                  </>
                )}

                {activeDoc.kind === 'facture' && activeDoc.status !== 'brouillon' && (
                  <button
                    type="button"
                    onClick={() =>
                      runDocAction(
                        `/documents/${activeDoc.id}/create-credit-note`,
                        undefined,
                        'Avoir brouillon créé et rattaché à la facture.',
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Émettre un avoir
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    runDocAction(`/documents/${activeDoc.id}/duplicate`, undefined, 'Document dupliqué en brouillon.')
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Dupliquer
                </button>
              </div>

              {activeDoc.kind !== 'devis' &&
                activeDoc.status !== 'brouillon' &&
                activeDoc.paidCents < activeDoc.totalTtcCents && (
                  <div className="border-t border-slate-200 pt-4 space-y-2.5 dark:border-slate-800">
                    <h3 className="text-xs font-bold text-[#081C3A] dark:text-white">
                      Enregistrer un règlement (solde : {formatEurCents(activeDoc.totalTtcCents - activeDoc.paidCents)})
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        aria-label="Montant du règlement en euros"
                        placeholder={((activeDoc.totalTtcCents - activeDoc.paidCents) / 100).toFixed(2).replace('.', ',')}
                        value={payAmountEur}
                        onChange={(e) => setPayAmountEur(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <select
                        aria-label="Mode de règlement"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="virement">Virement</option>
                        <option value="carte">Carte</option>
                        <option value="cheque">Chèque</option>
                        <option value="especes">Espèces</option>
                      </select>
                      <input
                        aria-label="Référence bancaire"
                        placeholder="Référence (ex. VIR-001)"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <select
                        aria-label="Compte bancaire crédité"
                        value={payBankId || bankAccounts[0]?.id || ''}
                        onChange={(e) => setPayBankId(e.target.value)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="">Sans mouvement bancaire</option>
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        runDocAction(
                          `/documents/${activeDoc.id}/payments`,
                          {
                            amountEur:
                              payAmountEur ||
                              ((activeDoc.totalTtcCents - activeDoc.paidCents) / 100).toFixed(2).replace('.', ','),
                            method: payMethod,
                            reference: payRef,
                            bankAccountId: payBankId || bankAccounts[0]?.id || null,
                          },
                          'Règlement enregistré et solde mis à jour.',
                        )
                      }
                      className="rounded-md bg-[#2DBE8D] px-3.5 py-1.5 text-xs font-semibold text-[#081C3A] hover:bg-emerald-400"
                    >
                      Valider le règlement
                    </button>
                  </div>
                )}

              {activeDoc.kind === 'facture' && activeDoc.status !== 'brouillon' && (
                <div className="border-t border-slate-200 pt-3 space-y-2 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Facturation électronique (Factur-X / Statut)
                    </span>
                    <a
                      href={`/api/v1/documents/${activeDoc.id}/facturx-xml`}
                      className="text-xs font-semibold text-[#0066FF] hover:underline"
                    >
                      Télécharger XML Factur-X
                    </a>
                  </div>
                  <select
                    aria-label="Statut facturation électronique"
                    value={activeDoc.einvoiceStatus}
                    onChange={async (e) => {
                      await apiFetch(`/documents/${activeDoc.id}/einvoice`, {
                        method: 'PATCH',
                        body: JSON.stringify({ einvoiceStatus: e.target.value }),
                      });
                      await onRefresh();
                    }}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="a_preparer">À préparer (aucun prestataire payant activé)</option>
                    <option value="facturx_genere">Factur-X généré localement</option>
                    <option value="depose_manuellement">Déposé manuellement sur portail</option>
                    <option value="accepte_destinataire">Accepté destinataire</option>
                    <option value="rejete_destinataire">Rejeté destinataire</option>
                  </select>

                  {activeDoc.paidCents < activeDoc.totalTtcCents && (
                    <div className="flex gap-2 pt-2">
                      <input
                        aria-label="Note de relance client"
                        placeholder="Note relance manuelle..."
                        value={reminderNote}
                        onChange={(e) => setReminderNote(e.target.value)}
                        className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          runDocAction(
                            `/documents/${activeDoc.id}/reminders`,
                            { channel: 'courriel_manuel', level: 1, note: reminderNote || 'Relance niveau 1' },
                            'Relance enregistrée dans l\'historique.',
                          )
                        }
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
                      >
                        Consigner relance
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
