import { useState } from 'react';
import { Check, Download, FileUp, Plus, XCircle } from 'lucide-react';
import type { Contact, ExpenseReport, ReceiptRecord, RoleCode, SupplierBill } from '../core/types';
import { formatEurCents } from '../core/money';
import { apiFetch, fileToBase64 } from '../lib/apiClient';

interface PurchasesExpensesViewProps {
  contacts: Contact[];
  bills: SupplierBill[];
  receipts: ReceiptRecord[];
  expenses: ExpenseReport[];
  userRole: RoleCode;
  onRefresh: () => Promise<void>;
}

export function PurchasesExpensesView({
  contacts,
  bills,
  receipts,
  expenses,
  userRole,
  onRefresh,
}: PurchasesExpensesViewProps) {
  const [subTab, setSubTab] = useState<'bills' | 'receipts' | 'expenses'>('bills');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const suppliers = contacts.filter((c) => c.type === 'fournisseur' || c.type === 'les_deux');

  // Facture fournisseur
  const [billSupplierId, setBillSupplierId] = useState(suppliers[0]?.id ?? '');
  const [billNumber, setBillNumber] = useState('');
  const [billIssueDate, setBillIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [billDueDate, setBillDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [billCategory, setBillCategory] = useState('Logiciels & Cloud');
  const [billHtEur, setBillHtEur] = useState('100,00');
  const [billVatEur, setBillVatEur] = useState('20,00');
  const [billReceiptId, setBillReceiptId] = useState('');

  // Justificatif
  const [rcpCategory, setRcpCategory] = useState('Achats généraux');
  const [rcpDate, setRcpDate] = useState(new Date().toISOString().slice(0, 10));
  const [rcpAmountEur, setRcpAmountEur] = useState('0,00');
  const [rcpTags, setRcpTags] = useState('');

  // Note de frais
  const [expTitle, setExpTitle] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCategory, setExpCategory] = useState('Déplacement');
  const [expHtEur, setExpHtEur] = useState('45,00');
  const [expVatEur, setExpVatEur] = useState('4,50');
  const [expReceiptId, setExpReceiptId] = useState('');

  async function handleUploadReceipt(file: File) {
    setError(null);
    setInfo(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const res = await apiFetch<{ id: string; sha256: string; duplicateWarning: string | null }>('/receipts', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'application/pdf',
          contentBase64,
          category: rcpCategory,
          receiptDate: rcpDate,
          amountTtcEur: rcpAmountEur,
          tags: rcpTags,
        }),
      });
      setInfo(
        res.duplicateWarning
          ? `Justificatif déposé avec alerte doublon : ${res.duplicateWarning}`
          : `Justificatif "${file.name}" stocké (SHA-256 : ${res.sha256.slice(0, 12)}...).`,
      );
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateBill(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      const targetSupplierId = billSupplierId || suppliers[0]?.id;
      if (!targetSupplierId) throw new Error('Ajoutez d\'abord un fournisseur dans Tiers & Catalogue.');
      const res = await apiFetch<{ id: string; duplicateWarning: string | null }>('/supplier-bills', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: targetSupplierId,
          billNumber,
          issueDate: billIssueDate,
          dueDate: billDueDate,
          category: billCategory,
          totalHtEur: billHtEur,
          totalVatEur: billVatEur,
          receiptId: billReceiptId || null,
        }),
      });
      setBillNumber('');
      setInfo(
        res.duplicateWarning
          ? `Facture fournisseur enregistrée. Alerte suspicion doublon : ${res.duplicateWarning}`
          : 'Facture fournisseur enregistrée.',
      );
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          title: expTitle,
          expenseDate: expDate,
          category: expCategory,
          amountHtEur: expHtEur,
          vatEur: expVatEur,
          receiptId: expReceiptId || null,
          submitNow: true,
        }),
      });
      setExpTitle('');
      setInfo('Note de frais soumise.');
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const canApprove = userRole === 'admin' || userRole === 'gestionnaire';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Achats, Justificatifs & Notes de frais
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Contrôle des doublons SHA-256 vs suspicion métier · Validation et remboursement des frais
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {(
            [
              ['bills', 'Factures fournisseurs'],
              ['receipts', 'Justificatifs'],
              ['expenses', 'Notes de frais'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSubTab(k)}
              className={`rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                subTab === k
                  ? 'bg-[#0066FF] text-white'
                  : 'text-slate-600 dark:text-slate-300'
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

      {subTab === 'bills' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateBill}
            className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]"
          >
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Enregistrer une facture fournisseur
            </h2>
            <div>
              <label htmlFor="bill-sup" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Fournisseur *
              </label>
              <select
                id="bill-sup"
                required
                value={billSupplierId || suppliers[0]?.id || ''}
                onChange={(e) => setBillSupplierId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {suppliers.length === 0 && <option value="">Aucun fournisseur enregistré</option>}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bill-num" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                N° facture fournisseur *
              </label>
              <input
                id="bill-num"
                required
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="F-2026-412"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bill-issue" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Date pièce
                </label>
                <input
                  id="bill-issue"
                  type="date"
                  value={billIssueDate}
                  onChange={(e) => setBillIssueDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="bill-due" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Échéance
                </label>
                <input
                  id="bill-due"
                  type="date"
                  value={billDueDate}
                  onChange={(e) => setBillDueDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bill-ht" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Montant HT (€)
                </label>
                <input
                  id="bill-ht"
                  value={billHtEur}
                  onChange={(e) => setBillHtEur(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="bill-vat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  TVA (€)
                </label>
                <input
                  id="bill-vat"
                  value={billVatEur}
                  onChange={(e) => setBillVatEur(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor="bill-cat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Catégorie
              </label>
              <input
                id="bill-cat"
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="bill-rcp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Justificatif associé
              </label>
              <select
                id="bill-rcp"
                value={billReceiptId}
                onChange={(e) => setBillReceiptId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Aucun justificatif lié</option>
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.originalFilename} ({r.receiptDate})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Enregistrer l'achat
            </button>
          </form>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="mb-4 font-display text-base font-bold text-[#081C3A] dark:text-white">
              Registre des factures fournisseurs ({bills.length})
            </h2>
            {bills.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Aucune facture fournisseur enregistrée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-3">Fournisseur & Pièce</th>
                      <th className="py-2 pr-3">Échéance</th>
                      <th className="py-2 pr-3 text-right">TTC</th>
                      <th className="py-2 text-right">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bills.map((b) => (
                      <tr key={b.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{b.supplierName}</div>
                          <div className="text-xs text-slate-500">
                            <span className="font-mono">{b.billNumber}</span> · {b.category}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{b.dueDate}</td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold">
                          {formatEurCents(b.totalTtcCents)}
                        </td>
                        <td className="py-2.5 text-right">
                          {b.status === 'a_payer' ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/supplier-bills/${b.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'payee' }),
                                });
                                await onRefresh();
                              }}
                              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
                            >
                              Marquer payée
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-[#2DBE8D]">Payée</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'receipts' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Déposer un justificatif (PDF / Image)
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="rcp-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Date pièce
                </label>
                <input
                  id="rcp-date"
                  type="date"
                  value={rcpDate}
                  onChange={(e) => setRcpDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="rcp-amt" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Montant TTC (€)
                </label>
                <input
                  id="rcp-amt"
                  value={rcpAmountEur}
                  onChange={(e) => setRcpAmountEur(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor="rcp-cat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Catégorie & étiquettes
              </label>
              <input
                id="rcp-cat"
                value={rcpCategory}
                onChange={(e) => setRcpCategory(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <input
                aria-label="Étiquettes du justificatif"
                placeholder="Étiquettes (ex. train,lyon)"
                value={rcpTags}
                onChange={(e) => setRcpTags(e.target.value)}
                className="mt-2 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleUploadReceipt(file);
              }}
              className={`rounded-md border-2 border-dashed p-6 text-center transition-colors ${
                dragActive
                  ? 'border-[#0066FF] bg-blue-50 dark:bg-blue-950/30'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <FileUp className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Glissez-déposez un PDF, PNG ou JPEG (max 10 Mo)
              </p>
              <label className="mt-3 inline-block cursor-pointer rounded-md bg-[#0066FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                Choisir un fichier
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadReceipt(f);
                  }}
                />
              </label>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="mb-4 font-display text-base font-bold text-[#081C3A] dark:text-white">
              Justificatifs archivés ({receipts.length})
            </h2>
            {receipts.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Aucun justificatif déposé.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-3">Fichier & Empreinte SHA-256</th>
                      <th className="py-2 pr-3">Date & Catégorie</th>
                      <th className="py-2 pr-3 text-right">TTC</th>
                      <th className="py-2 text-right">Pièce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {receipts.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{r.originalFilename}</div>
                          <div className="font-mono text-[11px] text-slate-500">SHA-256: {r.sha256.slice(0, 16)}...</div>
                          {r.duplicateWarning && (
                            <div className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                              {r.duplicateWarning}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-300">
                          {r.receiptDate} · {r.category}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                          {formatEurCents(r.amountTtcCents)}
                        </td>
                        <td className="py-2.5 text-right">
                          <a
                            href={`/api/v1/receipts/${r.id}/file`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0066FF] hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Télécharger
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'expenses' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateExpense}
            className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]"
          >
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Nouvelle note de frais
            </h2>
            <div>
              <label htmlFor="exp-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Objet *
              </label>
              <input
                id="exp-title"
                required
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="Ex. Billet TGV client Paris"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="exp-date" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Date
                </label>
                <input
                  id="exp-date"
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="exp-cat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Catégorie
                </label>
                <input
                  id="exp-cat"
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="exp-ht" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Montant HT (€)
                </label>
                <input
                  id="exp-ht"
                  value={expHtEur}
                  onChange={(e) => setExpHtEur(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="exp-vat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  TVA (€)
                </label>
                <input
                  id="exp-vat"
                  value={expVatEur}
                  onChange={(e) => setExpVatEur(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor="exp-rcp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Justificatif joint
              </label>
              <select
                id="exp-rcp"
                value={expReceiptId}
                onChange={(e) => setExpReceiptId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Aucun justificatif</option>
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.originalFilename}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-[#0066FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Soumettre la note de frais
            </button>
          </form>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Notes de frais ({expenses.length})
              </h2>
              <a
                href="/api/v1/export/csv/expenses"
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            </div>
            {expenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Aucune note de frais enregistrée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-3">Intitulé & Collaborateur</th>
                      <th className="py-2 pr-3">Statut</th>
                      <th className="py-2 pr-3 text-right">TTC</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {expenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{exp.title}</div>
                          <div className="text-xs text-slate-500">
                            {exp.userName} · {exp.expenseDate} · {exp.category}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-xs font-semibold">
                          {exp.status}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold">
                          {formatEurCents(exp.amountTtcCents)}
                        </td>
                        <td className="py-2.5 text-right space-x-1 whitespace-nowrap">
                          <a
                            href={`/api/v1/expenses/${exp.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700"
                          >
                            PDF
                          </a>
                          {canApprove && exp.status === 'soumise' && (
                            <>
                              <button
                                type="button"
                                aria-label={`Approuver ${exp.title}`}
                                onClick={async () => {
                                  await apiFetch(`/expenses/${exp.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: 'approuvee' }),
                                  });
                                  await onRefresh();
                                }}
                                className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Refuser ${exp.title}`}
                                onClick={async () => {
                                  await apiFetch(`/expenses/${exp.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: 'refusee' }),
                                  });
                                  await onRefresh();
                                }}
                                className="rounded bg-red-600 p-1 text-white hover:bg-red-700"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {canApprove && exp.status === 'approuvee' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/expenses/${exp.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'remboursee' }),
                                });
                                await onRefresh();
                              }}
                              className="rounded bg-[#0066FF] px-2 py-1 text-xs font-semibold text-white"
                            >
                              Rembourser
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
