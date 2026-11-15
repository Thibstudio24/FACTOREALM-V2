-- Factorealm — Migration initiale SQLite (node:sqlite)
-- Toutes les valeurs monétaires sont stockées en INTEGER (centimes d'euro).
-- Aucun calcul de référence en flottant binaire.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_form TEXT NOT NULL DEFAULT 'SAS',
  siret TEXT NOT NULL DEFAULT '',
  vat_number TEXT NOT NULL DEFAULT '',
  naf_code TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'France',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  bic TEXT NOT NULL DEFAULT '',
  vat_regime TEXT NOT NULL DEFAULT 'reel_normal',
  default_payment_terms_days INTEGER NOT NULL DEFAULT 30,
  late_penalty_text TEXT NOT NULL DEFAULT 'Pénalités de retard : 3 fois le taux d''intérêt légal + indemnité forfaitaire de recouvrement de 40 € (art. L441-10 C. com.).',
  accent_color TEXT NOT NULL DEFAULT '#0066FF',
  logo_data_url TEXT,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1,
  session_timeout_minutes INTEGER NOT NULL DEFAULT 15,
  enforce_2fa INTEGER NOT NULL DEFAULT 0,
  rgpd_dpo_name TEXT NOT NULL DEFAULT '',
  rgpd_dpo_email TEXT NOT NULL DEFAULT '',
  rgpd_retention_days INTEGER NOT NULL DEFAULT 3650,
  recovery_key_hash TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  require_2fa INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  accounting_scope_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  siret TEXT NOT NULL DEFAULT '',
  vat_number TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  provenance TEXT NOT NULL DEFAULT 'saisie_manuelle',
  external_ref TEXT NOT NULL DEFAULT '',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'service',
  unit TEXT NOT NULL DEFAULT 'unité',
  unit_price_cents INTEGER NOT NULL,
  vat_rate_bps INTEGER NOT NULL DEFAULT 2000,
  account_code TEXT NOT NULL DEFAULT '706000',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sequences (
  kind TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, fiscal_year)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  number TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  contact_name_snapshot TEXT NOT NULL,
  contact_address_snapshot TEXT NOT NULL DEFAULT '',
  contact_siret_snapshot TEXT NOT NULL DEFAULT '',
  source_quote_id TEXT,
  parent_invoice_id TEXT,
  project_id TEXT,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  global_discount_bps INTEGER NOT NULL DEFAULT 0,
  vat_exempt INTEGER NOT NULL DEFAULT 0,
  total_ht_cents INTEGER NOT NULL DEFAULT 0,
  total_vat_cents INTEGER NOT NULL DEFAULT 0,
  total_ttc_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT 'Paiement à 30 jours',
  public_notes TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  signed_file_id TEXT,
  signature_recorded_at TEXT,
  einvoice_status TEXT NOT NULL DEFAULT 'non_applicable',
  recurrence_rule TEXT,
  idempotency_key TEXT UNIQUE,
  provenance TEXT NOT NULL DEFAULT 'factorealm',
  external_ref TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  finalized_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  catalog_item_id TEXT,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity_milli INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unité',
  unit_price_cents INTEGER NOT NULL,
  discount_bps INTEGER NOT NULL DEFAULT 0,
  vat_rate_bps INTEGER NOT NULL DEFAULT 2000,
  net_ht_cents INTEGER NOT NULL,
  vat_cents INTEGER NOT NULL,
  ttc_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  amount_cents INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  method TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  bank_account_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT NOT NULL,
  scheduled_for TEXT,
  status TEXT NOT NULL DEFAULT 'envoyee',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  supplier_id TEXT,
  category TEXT NOT NULL DEFAULT 'Achats généraux',
  receipt_date TEXT NOT NULL,
  amount_ttc_cents INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  duplicate_warning TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_bills (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES contacts(id),
  supplier_name TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  category TEXT NOT NULL,
  account_code TEXT NOT NULL DEFAULT '606000',
  total_ht_cents INTEGER NOT NULL,
  total_vat_cents INTEGER NOT NULL,
  total_ttc_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'a_payer',
  receipt_id TEXT REFERENCES receipts(id),
  tags TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  title TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_ht_cents INTEGER NOT NULL,
  vat_cents INTEGER NOT NULL,
  amount_ttc_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'brouillon',
  receipt_id TEXT REFERENCES receipts(id),
  project_id TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  reimbursed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  iban TEXT NOT NULL DEFAULT '',
  initial_balance_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  tx_date TEXT NOT NULL,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'Non catégorisé',
  reconciled_entity_type TEXT,
  reconciled_entity_id TEXT,
  import_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_rules (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  category TEXT NOT NULL,
  account_code TEXT NOT NULL DEFAULT '627000'
);

CREATE TABLE IF NOT EXISTS forecast_assumptions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  monthly_cents INTEGER NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'moyenne',
  hypothesis_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pcg_accounts (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounting_periods (
  period_key TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  closed_at TEXT,
  closed_by TEXT
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  journal_code TEXT NOT NULL,
  journal_label TEXT NOT NULL,
  entry_number TEXT NOT NULL UNIQUE,
  entry_date TEXT NOT NULL,
  piece_ref TEXT NOT NULL,
  piece_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'validee',
  source_type TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_num TEXT NOT NULL,
  account_label TEXT NOT NULL,
  aux_num TEXT NOT NULL DEFAULT '',
  aux_label TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  debit_cents INTEGER NOT NULL DEFAULT 0,
  credit_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  budget_ht_cents INTEGER NOT NULL DEFAULT 0,
  hourly_rate_cents INTEGER NOT NULL DEFAULT 8500,
  status TEXT NOT NULL DEFAULT 'actif',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  work_date TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  description TEXT NOT NULL,
  billable INTEGER NOT NULL DEFAULT 1,
  billed_document_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'incident',
  priority TEXT NOT NULL DEFAULT 'normale',
  status TEXT NOT NULL DEFAULT 'ouvert',
  requester_user_id TEXT NOT NULL REFERENCES users(id),
  requester_name TEXT NOT NULL,
  assignee_user_id TEXT REFERENCES users(id),
  assignee_name TEXT NOT NULL DEFAULT '',
  resolution_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_kind_status ON documents(kind, status);
CREATE INDEX IF NOT EXISTS idx_documents_contact ON documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_payments_doc ON payments(document_id);
CREATE INDEX IF NOT EXISTS idx_receipts_sha256 ON receipts(sha256);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, updated_at DESC);
