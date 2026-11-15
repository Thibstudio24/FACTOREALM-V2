import { useState } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import type { CatalogItem, Contact } from '../core/types';
import { formatBpsPercent, formatEurCents } from '../core/money';
import { apiFetch } from '../lib/apiClient';

interface ContactsCatalogViewProps {
  contacts: Contact[];
  catalog: CatalogItem[];
  onRefresh: () => Promise<void>;
}

export function ContactsCatalogView({
  contacts,
  catalog,
  onRefresh,
}: ContactsCatalogViewProps) {
  const [subTab, setSubTab] = useState<'contacts' | 'catalog' | 'csv'>('contacts');
  const [filterType, setFilterType] = useState<'tous' | 'client' | 'fournisseur'>('tous');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Formulaire contact
  const [cType, setCType] = useState<'client' | 'fournisseur' | 'les_deux'>('client');
  const [cCompany, setCCompany] = useState('');
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cSiret, setCSiret] = useState('');
  const [cCity, setCCity] = useState('');
  const [cNotes, setCNotes] = useState('');

  // Formulaire catalogue
  const [catSku, setCatSku] = useState('');
  const [catName, setCatName] = useState('');
  const [catKind, setCatKind] = useState<'service' | 'produit'>('service');
  const [catUnit, setCatUnit] = useState('jour');
  const [catPriceEur, setCatPriceEur] = useState('650,00');
  const [catVatPct, setCatVatPct] = useState('20');
  const [catAccount, setCatAccount] = useState('706000');

  // Import CSV contacts
  const [csvKind, setCsvKind] = useState<'contacts' | 'catalog'>('contacts');
  const [csvText, setCsvText] = useState(
    'RaisonSociale;Contact;Email;SIRET;Ville\nStudio Loire SARL;Luc Bernard;luc@loire.example;73282932000074;Angers',
  );
  const [csvSimResult, setCsvSimResult] = useState<{
    dryRun: boolean;
    imported: number;
    skippedDuplicates: number;
    errors: Array<{ row: number; reason: string }>;
  } | null>(null);

  const filteredContacts = contacts.filter((c) => {
    const matchType =
      filterType === 'tous' || c.type === filterType || c.type === 'les_deux';
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      c.companyName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.siret.includes(q);
    return matchType && matchQ;
  });

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      await apiFetch('/contacts', {
        method: 'POST',
        body: JSON.stringify({
          type: cType,
          companyName: cCompany,
          contactName: cName,
          email: cEmail,
          phone: cPhone,
          siret: cSiret,
          city: cCity,
          notes: cNotes,
        }),
      });
      setCCompany('');
      setCName('');
      setCEmail('');
      setCPhone('');
      setCSiret('');
      setCCity('');
      setCNotes('');
      setInfo('Contact enregistré.');
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteContact(id: string, name: string) {
    setError(null);
    try {
      await apiFetch(`/contacts/${id}`, { method: 'DELETE' });
      setInfo(`Contact "${name}" archivé.`);
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateCatalog(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      await apiFetch('/catalog', {
        method: 'POST',
        body: JSON.stringify({
          sku: catSku,
          name: catName,
          kind: catKind,
          unit: catUnit,
          unitPriceEur: catPriceEur,
          vatRatePct: catVatPct,
          accountCode: catAccount,
        }),
      });
      setCatSku('');
      setCatName('');
      setInfo('Article ajouté au catalogue.');
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCsvImport(dryRun: boolean) {
    setError(null);
    try {
      const preview = await apiFetch<{ headers: string[] }>('/import/csv/preview', {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      });
      const mapping =
        csvKind === 'contacts'
          ? {
              companyName: preview.headers[0],
              contactName: preview.headers[1],
              email: preview.headers[2],
              siret: preview.headers[3],
              city: preview.headers[4],
            }
          : {
              sku: preview.headers[0],
              name: preview.headers[1],
              unitPrice: preview.headers[2],
              vatRate: preview.headers[3],
            };
      const res = await apiFetch<typeof csvSimResult>('/import/csv/commit', {
        method: 'POST',
        body: JSON.stringify({ kind: csvKind, csvText, mapping, dryRun }),
      });
      setCsvSimResult(res);
      if (!dryRun) {
        setInfo('Import CSV exécuté.');
        await onRefresh();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Clients, Fournisseurs & Catalogue
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Référentiel des tiers, notes de suivi, tarifs HT/TVA et import/export CSV sécurisé
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {(
            [
              ['contacts', 'Tiers'],
              ['catalog', 'Catalogue'],
              ['csv', 'Import / Export CSV'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                subTab === id
                  ? 'bg-[#0066FF] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
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

      {subTab === 'contacts' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateContact}
            className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]"
          >
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Nouveau client ou fournisseur
            </h2>
            <div>
              <label htmlFor="c-type" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Catégorie
              </label>
              <select
                id="c-type"
                value={cType}
                onChange={(e) => setCType(e.target.value as typeof cType)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="client">Client</option>
                <option value="fournisseur">Fournisseur</option>
                <option value="les_deux">Client et fournisseur</option>
              </select>
            </div>
            <div>
              <label htmlFor="c-company" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Raison sociale *
              </label>
              <input
                id="c-company"
                required
                value={cCompany}
                onChange={(e) => setCCompany(e.target.value)}
                placeholder="Ex. Atelier Lumière SAS"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="c-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Interlocuteur
                </label>
                <input
                  id="c-name"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="c-city" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ville
                </label>
                <input
                  id="c-city"
                  value={cCity}
                  onChange={(e) => setCCity(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor="c-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Courriel
              </label>
              <input
                id="c-email"
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="c-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Téléphone
                </label>
                <input
                  id="c-phone"
                  value={cPhone}
                  onChange={(e) => setCPhone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="c-siret" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  SIRET
                </label>
                <input
                  id="c-siret"
                  value={cSiret}
                  onChange={(e) => setCSiret(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor="c-notes" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Notes internes
              </label>
              <textarea
                id="c-notes"
                rows={2}
                value={cNotes}
                onChange={(e) => setCNotes(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Ajouter le tiers
            </button>
          </form>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-md border border-slate-200 p-1 dark:border-slate-700">
                {(['tous', 'client', 'fournisseur'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilterType(t)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold ${
                      filterType === t
                        ? 'bg-[#081C3A] text-white dark:bg-[#0066FF]'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t === 'tous' ? 'Tous' : t === 'client' ? 'Clients' : 'Fournisseurs'}
                  </button>
                ))}
              </div>
              <label htmlFor="contact-search" className="sr-only">
                Filtrer les tiers
              </label>
              <input
                id="contact-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer par nom, courriel ou SIRET..."
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            {filteredContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucun tiers enregistré pour ce filtre.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2 pr-3">Raison sociale</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Contact & Ville</th>
                      <th className="py-2 pr-3">SIRET</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredContacts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{c.companyName}</div>
                          {c.notes && <div className="text-xs text-slate-500 truncate max-w-xs">{c.notes}</div>}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-300">
                          {c.type === 'les_deux' ? 'Client / Fourn.' : c.type}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-300">
                          {[c.contactName, c.email, c.city].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                          {c.siret || '—'}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(c.id, c.companyName)}
                            aria-label={`Archiver ${c.companyName}`}
                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {subTab === 'catalog' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateCatalog}
            className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]"
          >
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Nouveau produit ou service
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cat-sku" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Référence
                </label>
                <input
                  id="cat-sku"
                  value={catSku}
                  onChange={(e) => setCatSku(e.target.value)}
                  placeholder="CONS-01"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="cat-kind" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nature
                </label>
                <select
                  id="cat-kind"
                  value={catKind}
                  onChange={(e) => setCatKind(e.target.value as typeof catKind)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="service">Service</option>
                  <option value="produit">Produit</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="cat-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Désignation *
              </label>
              <input
                id="cat-name"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ex. Journée développement"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="cat-price" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  PU HT (€)
                </label>
                <input
                  id="cat-price"
                  required
                  value={catPriceEur}
                  onChange={(e) => setCatPriceEur(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="cat-vat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  TVA (%)
                </label>
                <select
                  id="cat-vat"
                  value={catVatPct}
                  onChange={(e) => setCatVatPct(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="20">20 %</option>
                  <option value="10">10 %</option>
                  <option value="5.5">5,5 %</option>
                  <option value="2.1">2,1 %</option>
                  <option value="0">0 %</option>
                </select>
              </div>
              <div>
                <label htmlFor="cat-unit" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unité
                </label>
                <input
                  id="cat-unit"
                  value={catUnit}
                  onChange={(e) => setCatUnit(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label htmlFor="cat-acc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Compte PCG
              </label>
              <input
                id="cat-acc"
                value={catAccount}
                onChange={(e) => setCatAccount(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Ajouter au catalogue
            </button>
          </form>

          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="mb-4 font-display text-base font-bold text-[#081C3A] dark:text-white">
              Articles actifs ({catalog.length})
            </h2>
            {catalog.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Aucun article dans le catalogue.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-3">Réf.</th>
                      <th className="py-2 pr-3">Désignation</th>
                      <th className="py-2 pr-3 text-right">PU HT</th>
                      <th className="py-2 pr-3 text-right">TVA</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {catalog.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 pr-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                          {item.sku}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{item.name}</span>
                          <span className="ml-2 text-xs text-slate-500">· {item.kind} / {item.unit}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold">
                          {formatEurCents(item.unitPriceCents)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-xs">
                          {formatBpsPercent(item.vatRateBps)}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/catalog/${item.id}`, { method: 'DELETE' });
                              await onRefresh();
                            }}
                            aria-label={`Supprimer ${item.name}`}
                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {subTab === 'csv' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Export CSV protégé contre l'injection de formules
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Les cellules commençant par <code className="font-mono">=, +, -, @</code> sont automatiquement neutralisées avant téléchargement.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/api/v1/export/csv/contacts"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                Exporter les contacts (.csv)
              </a>
              <a
                href="/api/v1/export/csv/catalog"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                Exporter le catalogue (.csv)
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#0D1B2E]">
            <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
              Import CSV avec simulation préalable
            </h2>
            <div>
              <label htmlFor="csv-kind" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Cible d'import
              </label>
              <select
                id="csv-kind"
                value={csvKind}
                onChange={(e) => setCsvKind(e.target.value as typeof csvKind)}
                className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="contacts">Contacts (RaisonSociale;Contact;Email;SIRET;Ville)</option>
                <option value="catalog">Catalogue (SKU;Nom;PrixHT;TVA)</option>
              </select>
            </div>
            <div>
              <label htmlFor="csv-body" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Contenu CSV
              </label>
              <textarea
                id="csv-body"
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleCsvImport(true)}
                className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Simuler avant écriture
              </button>
              <button
                type="button"
                onClick={() => handleCsvImport(false)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0066FF] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Upload className="h-3.5 w-3.5" />
                Importer les lignes valides
              </button>
            </div>
            {csvSimResult && (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
                <p className="font-semibold">
                  {csvSimResult.dryRun ? 'Résultat de simulation :' : 'Import terminé :'} {csvSimResult.imported} importé(s), {csvSimResult.skippedDuplicates} doublon(s) ignoré(s), {csvSimResult.errors.length} erreur(s).
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
