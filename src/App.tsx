import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  ExternalLink,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
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
import { SupportTicketsView } from './components/SupportTicketsView';
import { ComplianceDocsView } from './components/ComplianceDocsView';
import { GlobalSearchModal } from './components/GlobalSearchModal';

type NavTab =
  | 'dashboard'
  | 'contacts'
  | 'billing'
  | 'purchases'
  | 'treasury'
  | 'accounting'
  | 'tickets'
  | 'legal_docs'
  | 'admin';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

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
  const [legalSubTab, setLegalSubTab] = useState<'guide' | 'rgpd' | 'legal'>('guide');
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

  const performClientLogout = useCallback(async () => {
    sessionStorage.removeItem('fr_window_session');
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // session already expired server-side
    }
    setAuthed(false);
    setIdleWarning(false);
    setCompany(null);
    setUser(null);
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
      const hasWindowSession = sessionStorage.getItem('fr_window_session') === '1';

      if (st.initialized && st.authenticated && !hasWindowSession) {
        // Fenêtre / onglet précédemment fermé : exiger une nouvelle connexion
        await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setAuthed(false);
        setCompany(null);
        setUser(null);
      } else if (st.initialized && st.authenticated) {
        try {
          await loadWorkspaceData();
          lastActivityRef.current = Date.now();
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

  useEffect(() => {
    if (!authed || !company) return;
    const timeoutMs = Math.max(1, company.sessionTimeoutMinutes || 15) * 60_000;
    lastActivityRef.current = Date.now();
    setIdleWarning(false);

    const markActive = () => {
      lastActivityRef.current = Date.now();
      setIdleWarning(false);
    };
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    for (const ev of events) {
      window.addEventListener(ev, markActive, { passive: true });
    }

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= timeoutMs) {
        void performClientLogout();
      } else if (timeoutMs >= 120_000 && idle >= timeoutMs - 60_000) {
        setIdleWarning(true);
      }
    }, 10_000);

    return () => {
      window.clearInterval(timer);
      for (const ev of events) {
        window.removeEventListener(ev, markActive);
      }
    };
  }, [authed, company, performClientLogout]);

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
          sessionStorage.setItem('fr_window_session', '1');
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
    { id: 'tickets', label: 'Tickets IT', icon: LifeBuoy },
    { id: 'legal_docs', label: 'RGPD & Documentation', icon: ShieldCheck },
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
              <div className="mb-4 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  {company.logoDataUrl ? (
                    <img
                      src={company.logoDataUrl}
                      alt={`Logo ${company.name}`}
                      className="h-9 w-9 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-0.5 dark:border-slate-700"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#0066FF] dark:bg-blue-950/60">
                      <Building2 className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#081C3A] dark:text-slate-100 truncate">
                      {company.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {user.fullName} · {user.role}
                    </p>
                  </div>
                </div>
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

            <div className="border-t border-slate-200 pt-3 space-y-2 dark:border-slate-800">
              <p className="px-3 text-[11px] text-slate-500 dark:text-slate-400">
                Expiration auto : {company.sessionTimeoutMinutes ?? 15} min
              </p>
              <button
                type="button"
                onClick={() => void performClientLogout()}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </aside>

        {/* Contenu principal */}
        <main className="flex-1 min-w-0 flex flex-col justify-between p-4 md:p-6 lg:p-8 max-w-[1440px]">
          <div>
            {idleWarning && (
              <div
                role="status"
                className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <span>Session inactive : déconnexion automatique de sécurité dans moins d'une minute.</span>
                <button
                  type="button"
                  onClick={async () => {
                    lastActivityRef.current = Date.now();
                    setIdleWarning(false);
                    await apiFetch('/auth/me').catch(() => undefined);
                  }}
                  className="rounded bg-amber-900 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800"
                >
                  Rester connecté
                </button>
              </div>
            )}

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
                companyName={company.name}
                companyLogoDataUrl={company.logoDataUrl}
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

            {activeTab === 'tickets' && (
              <SupportTicketsView userId={user.id} userRole={user.role} />
            )}

            {activeTab === 'legal_docs' && (
              <ComplianceDocsView
                company={company}
                userRole={user.role}
                contacts={contacts}
                initialTab={legalSubTab}
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
                  sessionStorage.removeItem('fr_window_session');
                  setAuthed(false);
                  setCompany(null);
                  setUser(null);
                  setActiveTab('dashboard');
                  void bootstrap();
                }}
              />
            )}
          </div>

          <footer className="no-print mt-10 border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
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
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setLegalSubTab('guide');
                  setActiveTab('legal_docs');
                }}
                className="hover:text-[#0066FF] hover:underline"
              >
                Documentation
              </button>
              <button
                type="button"
                onClick={() => {
                  setLegalSubTab('rgpd');
                  setActiveTab('legal_docs');
                }}
                className="hover:text-[#0066FF] hover:underline"
              >
                RGPD & Confidentialité
              </button>
              <button
                type="button"
                onClick={() => {
                  setLegalSubTab('legal');
                  setActiveTab('legal_docs');
                }}
                className="hover:text-[#0066FF] hover:underline"
              >
                Licence AGPL-3.0
              </button>
            </div>
          </footer>
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
