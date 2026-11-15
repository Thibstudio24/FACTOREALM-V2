import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import { formatEurCents } from '../core/money';

interface SearchResults {
  contacts: Array<{ id: string; type: string; company_name: string; email: string }>;
  documents: Array<{
    id: string;
    kind: string;
    status: string;
    number: string | null;
    title: string;
    contact_name_snapshot: string;
    total_ttc_cents: number;
  }>;
  bills: Array<{
    id: string;
    supplier_name: string;
    bill_number: string;
    total_ttc_cents: number;
    status: string;
  }>;
  projects: Array<{ id: string; code: string; name: string; client_name: string }>;
}

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export function GlobalSearchModal({ open, onClose, onNavigate }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (!query.trim()) {
        setResults(null);
        return;
      }
      setLoading(true);
      try {
        const res = await apiFetch<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recherche globale Factorealm"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 pt-20 px-4"
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#0D1B2E]">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <label htmlFor="global-search-input" className="sr-only">
            Rechercher un client, une facture, un fournisseur ou un projet
          </label>
          <input
            id="global-search-input"
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un tiers, numéro de facture, projet..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la recherche"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-4 text-sm">
          {loading && <p className="text-slate-500">Recherche en cours...</p>}
          {!loading && !results && (
            <p className="text-slate-500 dark:text-slate-400">
              Saisissez au moins un mot-clé. Les résultats respectent strictement les permissions de votre rôle.
            </p>
          )}
          {!loading && results && (
            <div className="space-y-4">
              {results.documents.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Devis & Factures
                  </h3>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {results.documents.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate('billing');
                            onClose();
                          }}
                          className="flex w-full items-center justify-between py-2 text-left hover:text-[#0066FF]"
                        >
                          <span>
                            <span className="font-mono font-medium">{d.number ?? 'BROUILLON'}</span>
                            {' · '}
                            {d.contact_name_snapshot}
                            {d.title ? ` — ${d.title}` : ''}
                          </span>
                          <span className="font-mono tabular-nums font-medium">
                            {formatEurCents(d.total_ttc_cents)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.contacts.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Clients & Fournisseurs
                  </h3>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {results.contacts.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate('contacts');
                            onClose();
                          }}
                          className="flex w-full items-center justify-between py-2 text-left hover:text-[#0066FF]"
                        >
                          <span className="font-medium">{c.company_name}</span>
                          <span className="text-xs text-slate-500">{c.type} · {c.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.bills.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Factures fournisseurs
                  </h3>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {results.bills.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate('purchases');
                            onClose();
                          }}
                          className="flex w-full items-center justify-between py-2 text-left hover:text-[#0066FF]"
                        >
                          <span>
                            {b.supplier_name} · <span className="font-mono">{b.bill_number}</span>
                          </span>
                          <span className="font-mono tabular-nums">{formatEurCents(b.total_ttc_cents)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.projects.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Projets
                  </h3>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {results.projects.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate('accounting');
                            onClose();
                          }}
                          className="flex w-full items-center justify-between py-2 text-left hover:text-[#0066FF]"
                        >
                          <span>
                            <span className="font-mono">{p.code}</span> · {p.name}
                          </span>
                          <span className="text-xs text-slate-500">{p.client_name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {results.contacts.length === 0 &&
                results.documents.length === 0 &&
                results.bills.length === 0 &&
                results.projects.length === 0 && (
                  <p className="text-slate-500">Aucun résultat correspondant à « {query} ».</p>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
