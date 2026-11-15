import { useState } from 'react';
import { SlidersHorizontal, ArrowUpRight, AlertTriangle } from 'lucide-react';
import type { BankAccount, CommercialDocument, SupplierBill } from '../core/types';
import { formatEurCents } from '../core/money';

interface DashboardViewProps {
  companyName: string;
  isDemo: boolean;
  documents: CommercialDocument[];
  bills: SupplierBill[];
  bankAccounts: BankAccount[];
  onNavigate: (tab: string) => void;
}

export function DashboardView({
  companyName,
  isDemo,
  documents,
  bills,
  bankAccounts,
  onNavigate,
}: DashboardViewProps) {
  const [showWidgetsConfig, setShowWidgetsConfig] = useState(false);
  const [widgets, setWidgets] = useState({
    kpis: true,
    chart: true,
    receivables: true,
    payables: true,
  });

  const finalizedInvoices = documents.filter(
    (d) => (d.kind === 'facture' || d.kind === 'acompte') && d.status !== 'brouillon' && d.status !== 'annule',
  );
  const creditNotes = documents.filter(
    (d) => d.kind === 'avoir' && d.status !== 'brouillon' && d.status !== 'annule',
  );

  const caTtcCents =
    finalizedInvoices.reduce((s, d) => s + d.totalTtcCents, 0) -
    creditNotes.reduce((s, d) => s + d.totalTtcCents, 0);
  const collectedCents = finalizedInvoices.reduce((s, d) => s + d.paidCents, 0);
  const pendingReceivablesCents = Math.max(0, caTtcCents - collectedCents);
  const treasuryCents = bankAccounts.reduce((s, b) => s + b.currentBalanceCents, 0);
  const unpaidBills = bills.filter((b) => b.status === 'a_payer');
  const unpaidInvoices = finalizedInvoices.filter((d) => d.totalTtcCents > d.paidCents);

  const billsTotalCents = bills.reduce((s, b) => s + b.totalTtcCents, 0);
  const maxBar = Math.max(
    Math.abs(caTtcCents),
    Math.abs(billsTotalCents),
    Math.abs(treasuryCents),
    100_000,
  );
  const caHeight = Math.min(120, Math.round((Math.max(0, caTtcCents) / maxBar) * 120));
  const expHeight = Math.min(120, Math.round((Math.max(0, billsTotalCents) / maxBar) * 120));
  const cashHeight = Math.min(120, Math.round((Math.max(0, treasuryCents) / maxBar) * 120));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Tableau de bord — {companyName}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Synthèse commerciale et trésorerie · Données locales persistées
            {isDemo ? ' · Jeu de démonstration séparé' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWidgetsConfig((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-[#0D1B2E] dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Personnaliser l'affichage
          </button>
          <button
            type="button"
            onClick={() => onNavigate('billing')}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            Nouveau devis / facture
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showWidgetsConfig && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            Blocs affichés sur le tableau de bord
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ['kpis', 'Indicateurs clés'],
                ['chart', 'Comparatif CA / Achats / Trésorerie'],
                ['receivables', 'Créances clients en attente'],
                ['payables', 'Échéances fournisseurs'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={widgets[key]}
                  onChange={(e) => setWidgets((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {widgets.kpis && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Chiffre d'affaires facturé TTC
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#081C3A] dark:text-white">
              {formatEurCents(caTtcCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {finalizedInvoices.length} facture(s) émise(s) · {creditNotes.length} avoir(s)
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Encaissements clients
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#2DBE8D]">
              {formatEurCents(collectedCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Règlements enregistrés sur pièces définitives
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Reste à encaisser TTC
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {formatEurCents(pendingReceivablesCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {unpaidInvoices.length} facture(s) en attente de règlement
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Trésorerie certaine (banque & caisse)
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#0066FF] dark:text-[#3B82F6]">
              {formatEurCents(treasuryCents)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {bankAccounts.length} compte(s) suivi(s) · hors prévisions
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {widgets.chart && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Équilibre cumulé
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Montants TTC enregistrés sur la base locale
            </p>
            <div className="mt-6 flex items-end justify-around gap-4 border-b border-slate-200 pb-4 dark:border-slate-800" style={{ height: 160 }}>
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 rounded-t bg-[#0066FF] transition-all"
                  style={{ height: Math.max(8, caHeight) }}
                  aria-label={`Facturé ${formatEurCents(caTtcCents)}`}
                />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Facturé</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 rounded-t bg-[#081C3A] dark:bg-slate-500 transition-all"
                  style={{ height: Math.max(8, expHeight) }}
                  aria-label={`Achats ${formatEurCents(bills.reduce((s, b) => s + b.totalTtcCents, 0))}`}
                />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Achats</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 rounded-t bg-[#2DBE8D] transition-all"
                  style={{ height: Math.max(8, cashHeight) }}
                  aria-label={`Trésorerie ${formatEurCents(treasuryCents)}`}
                />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Trésorerie</span>
              </div>
            </div>
            <div className="mt-3 flex justify-between text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
              <span>CA : {formatEurCents(caTtcCents)}</span>
              <span>Tréso : {formatEurCents(treasuryCents)}</span>
            </div>
          </div>
        )}

        {widgets.receivables && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Factures à encaisser
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('billing')}
                className="text-xs font-semibold text-[#0066FF] hover:underline"
              >
                Voir tout
              </button>
            </div>
            {unpaidInvoices.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune créance client en attente pour le moment.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {unpaidInvoices.slice(0, 5).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2.5 gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        <span className="font-mono">{inv.number}</span> · {inv.contactNameSnapshot}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Échéance {inv.dueDate ?? inv.issueDate}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {formatEurCents(inv.totalTtcCents - inv.paidCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {widgets.payables && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
                Factures fournisseurs à payer
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('purchases')}
                className="text-xs font-semibold text-[#0066FF] hover:underline"
              >
                Gérer
              </button>
            </div>
            {unpaidBills.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune facture fournisseur en attente de règlement.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {unpaidBills.slice(0, 5).map((bill) => (
                  <li key={bill.id} className="flex items-center justify-between py-2.5 gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {bill.supplierName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{bill.billNumber}</span> · Éch. {bill.dueDate}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatEurCents(bill.totalTtcCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 flex items-start gap-2.5 dark:border-slate-800 dark:bg-[#0D1B2E] dark:text-slate-300">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Information comptable et fiscale : Factorealm applique des calculs en centimes exacts et génère un export FEC préparatoire, mais ne remplace pas la validation d'un expert-comptable avant dépôt fiscal ou liasse.
        </p>
      </div>
    </div>
  );
}
