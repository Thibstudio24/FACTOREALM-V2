import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type {
  BankAccount,
  BankTransaction,
  CatalogItem,
  CommercialDocument,
  CompanyProfile,
  Contact,
  ExpenseReport,
  ForecastAssumption,
  ProjectRecord,
  ReceiptRecord,
  RoleCode,
  SupplierBill,
  TimeEntry,
} from './core/types';
import { apiFetch } from './lib/apiClient';
import { LogoMark } from './components/LogoMark';
import { SetupAndAuth } from './components/SetupAndAuth';
import { DashboardView } from './components/DashboardView';
import { ContactsCatalogView } from './components/ContactsCatalogView';
import { BillingView } from './components/BillingView';
import { PurchasesExpensesView } from './components/PurchasesExpensesView';
import { TreasuryView } from './components/TreasuryView';
import { AccountingProjectsView } from './components/AccountingProjectsView';
import { AdminSecurityView } from './components/AdminSecurityView';
import { GlobalSearchModal } from './components/GlobalSearchModal';

type NavTab =
  | 'dashboard'
  | 'contacts'
  | 'billing'
  | 'purchases'
  | 'treasury'
  | 'accounting'
  | 'admin';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  const [user, setUser] = useState<{
    id: string;
    email: string;
    fullName: string;
    role: RoleCode;
    totpEnabled?: boolean;
  } | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [documents, setDocuments] = useState<CommercialDocument[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseReport[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [forecasts, setForecasts] = useState<ForecastAssumption[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('fr_theme') === 'dark');
  const [textScale, setTextScale] = useState<'standard' | 'comfort' | 'large'>('standard');
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('fr_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('fr_theme', 'light');
    }
  }, [dark]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('text-scale-comfort', 'text-scale-large');
    if (textScale === 'comfort') root.classList.add('text-scale-comfort');
    if (textScale === 'large') root.classList.add('text-scale-large');
  }, [textScale]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    const me = await apiFetch<{
      user: { id: string; email: string; fullName: string; role: RoleCode; totpEnabled?: boolean };
      company: CompanyProfile;
    }>('/auth/me');
    setUser(me.user);
    setCompany(me.company);
    setCompanyName(me.company.name);

    const safeGet = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        return await apiFetch<T>(url);
      } catch {
        return fallback;
      }
    };

    const [
      cList,
      catList,
      docList,
      billList,
      rcpList,
      expList,
      bnkList,
      txList,
      fctList,
      prjData,
    ] = await Promise.all([
      safeGet<Contact[]>('/contacts', []),
      safeGet<CatalogItem[]>('/catalog', []),
      safeGet<CommercialDocument[]>('/documents', []),
      safeGet<SupplierBill[]>('/supplier-bills', []),
      safeGet<ReceiptRecord[]>('/receipts', []),
      safeGet<ExpenseReport[]>('/expenses', []),
      safeGet<BankAccount[]>('/bank-accounts', []),
      safeGet<BankTransaction[]>('/bank-transactions', []),
      safeGet<ForecastAssumption[]>('/forecasts', []),
      safeGet<{ projects: ProjectRecord[]; timeEntries: TimeEntry[] }>('/projects', {
        projects: [],
        timeEntries: [],
      }),
    ]);

    setContacts(cList);
    setCatalog(catList);
    setDocuments(docList);
    setBills(billList);
    setReceipts(rcpList);
    setExpenses(expList);
    setBankAccounts(bnkList);
    setTransactions(txList);
    setForecasts(fctList);
    setProjects(prjData.projects);
    setTimeEntries(prjData.timeEntries);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const st = await apiFetch<{
        initialized: boolean;
        companyName: string | null;
        authenticated: boolean;
      }>('/status');
      setInitialized(st.initialized);
      setCompanyName(st.companyName);
      if (st.initialized && st.authenticated) {
        try {
          await loadWorkspaceData();
          setAuthed(true);
        } catch {
          setAuthed(false);
          setCompany(null);
          setUser(null);
        }
      } else {
        setAuthed(false);
        setCompany(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [loadWorkspaceData]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#071120]">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Chargement de Factorealm...
        </p>
      </div>
    );
  }

  if (!initialized || !authed || !company || !user) {
    return (
      <SetupAndAuth
        initialized={initialized}
        companyName={companyName}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        onAuthenticated={() => {
          void bootstrap();
        }}
      />
    );
  }

  const navItems: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'contacts', label: 'Tiers & Catalogue', icon: Users },
    { id: 'billing', label: 'Devis & Factures', icon: FileSpreadsheet },
    { id: 'purchases', label: 'Achats & Frais', icon: Receipt },
    { id: 'treasury', label: 'Banque & Trésorerie', icon: Landmark },
    { id: 'accounting', label: 'Compta, FEC & Projets', icon: BookOpen },
    { id: 'admin', label: 'Administration', icon: Settings },
  ];

  const activeLabel = navItems.find((i) => i.id === activeTab)?.label ?? 'Tableau de bord';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#071120] dark:text-slate-100">
      {/* Barre supérieure 3 zones */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-2 md:gap-8 border-b border-slate-200 bg-white px-3 lg:px-6 dark:border-slate-800 dark:bg-[#0B172A]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Ouvrir le menu de navigation"
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <LogoMark />
        </div>

        <nav aria-label="Navigation principale rapide" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`whitespace-nowrap shrink-0 hover:text-[#0066FF] ${activeTab === 'dashboard' ? 'text-[#0066FF] font-semibold' : ''}`}
          >
            Synthèse
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('billing')}
            className={`whitespace-nowrap shrink-0 hover:text-[#0066FF] ${activeTab === 'billing' ? 'text-[#0066FF] font-semibold' : ''}`}
          >
            Facturation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('treasury')}
            className={`whitespace-nowrap shrink-0 hover:text-[#0066FF] ${activeTab === 'treasury' ? 'text-[#0066FF] font-semibold' : ''}`}
          >
            Trésorerie
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('accounting')}
            className={`whitespace-nowrap shrink-0 hover:text-[#0066FF] ${activeTab === 'accounting' ? 'text-[#0066FF] font-semibold' : ''}`}
          >
            Comptabilité
          </button>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Recherche globale (Ctrl+K)"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 p-1.5 sm:px-3 sm:py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rechercher</span>
          </button>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? 'Passer au thème clair' : 'Passer au thème sombre'}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('billing')}
            className="rounded-md bg-[#0066FF] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <span className="sm:hidden">Devis</span>
            <span className="hidden sm:inline">Nouveau devis</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Barre latérale fixe desktop + tiroir mobile */}
        <aside
          className={`no-print ${
            mobileMenuOpen ? 'fixed inset-y-14 left-0 z-40 block' : 'hidden'
          } w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-[#0B172A]`}
        >
          <div className="flex h-full flex-col justify-between p-4">
            <div className="space-y-1">
              <div className="mb-4 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="flex items-center gap-2 text-xs font-semibold text-[#081C3A] dark:text-slate-100 truncate">
                  <Building2 className="h-3.5 w-3.5 text-[#0066FF] shrink-0" />
                  {company.name}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {user.fullName} · {user.role}
                </p>
              </div>

              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#0066FF] text-white'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={async () => {
                  await apiFetch('/auth/logout', { method: 'POST' });
                  setAuthed(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </aside>

        {/* Contenu principal */}
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 max-w-[1440px]">
          <div className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Factorealm / {activeLabel}
          </div>

          {activeTab === 'dashboard' && (
            <DashboardView
              companyName={company.name}
              isDemo={company.isDemo}
              documents={documents}
              bills={bills}
              bankAccounts={bankAccounts}
              onNavigate={(t) => setActiveTab(t as NavTab)}
            />
          )}

          {activeTab === 'contacts' && (
            <ContactsCatalogView
              contacts={contacts}
              catalog={catalog}
              onRefresh={loadWorkspaceData}
            />
          )}

          {activeTab === 'billing' && (
            <BillingView
              documents={documents}
              contacts={contacts}
              catalog={catalog}
              bankAccounts={bankAccounts}
              onRefresh={loadWorkspaceData}
            />
          )}

          {activeTab === 'purchases' && (
            <PurchasesExpensesView
              contacts={contacts}
              bills={bills}
              receipts={receipts}
              expenses={expenses}
              userRole={user.role}
              onRefresh={loadWorkspaceData}
            />
          )}

          {activeTab === 'treasury' && (
            <TreasuryView
              bankAccounts={bankAccounts}
              transactions={transactions}
              forecasts={forecasts}
              documents={documents}
              onRefresh={loadWorkspaceData}
            />
          )}

          {activeTab === 'accounting' && (
            <AccountingProjectsView
              contacts={contacts}
              projects={projects}
              timeEntries={timeEntries}
              onRefresh={loadWorkspaceData}
            />
          )}

          {activeTab === 'admin' && (
            <AdminSecurityView
              company={company}
              userRole={user.role}
              userTotpEnabled={Boolean(user.totpEnabled)}
              dark={dark}
              textScale={textScale}
              highContrast={highContrast}
              onToggleDark={() => setDark((d) => !d)}
              onChangeTextScale={setTextScale}
              onToggleHighContrast={() => setHighContrast((h) => !h)}
              onRefresh={loadWorkspaceData}
              onLoggedOut={() => {
                setAuthed(false);
                setCompany(null);
                setUser(null);
                setActiveTab('dashboard');
                void bootstrap();
              }}
            />
          )}
        </main>
      </div>

      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(t) => setActiveTab(t as NavTab)}
      />
    </div>
  );
}
