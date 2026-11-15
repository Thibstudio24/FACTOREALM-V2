export type RoleCode = 'admin' | 'gestionnaire' | 'salarie' | 'comptable';

export type Permission =
  | 'company:write'
  | 'users:manage'
  | 'contacts:read'
  | 'contacts:write'
  | 'billing:read'
  | 'billing:write'
  | 'billing:finalize'
  | 'purchases:read'
  | 'purchases:write'
  | 'expenses:create'
  | 'expenses:approve'
  | 'treasury:read'
  | 'treasury:write'
  | 'accounting:read'
  | 'accounting:write'
  | 'accounting:close'
  | 'projects:read'
  | 'projects:write'
  | 'backups:manage'
  | 'export:full'
  | 'audit:read';

export type ContactType = 'client' | 'fournisseur' | 'les_deux';

export type DocumentKind = 'devis' | 'facture' | 'acompte' | 'avoir';

export type DocumentStatus =
  | 'brouillon'
  | 'envoye'
  | 'accepte'
  | 'refuse'
  | 'finalise'
  | 'paye_partiel'
  | 'paye'
  | 'annule';

export type ElectronicInvoiceStatus =
  | 'non_applicable'
  | 'a_preparer'
  | 'facturx_genere'
  | 'depose_manuellement'
  | 'accepte_destinataire'
  | 'rejete_destinataire';

export interface CompanyProfile {
  id: string;
  name: string;
  legalForm: string;
  siret: string;
  vatNumber: string;
  nafCode: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  iban: string;
  bic: string;
  vatRegime: 'reel_normal' | 'reel_simplifie' | 'franchise_base';
  defaultPaymentTermsDays: number;
  latePenaltyText: string;
  accentColor: string;
  logoDataUrl: string | null;
  fiscalYearStartMonth: number;
  isDemo: boolean;
}

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  totpEnabled: boolean;
  isActive: boolean;
  accountingScopeNote: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  type: ContactType;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  siret: string;
  vatNumber: string;
  address: string;
  postalCode: string;
  city: string;
  notes: string;
  provenance: string;
  externalRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  kind: 'service' | 'produit';
  unit: string;
  unitPriceCents: number;
  vatRateBps: number;
  accountCode: string;
  isActive: boolean;
}

export interface DocumentLine {
  id: string;
  documentId: string;
  position: number;
  catalogItemId: string | null;
  label: string;
  description: string;
  quantityMilli: number;
  unit: string;
  unitPriceCents: number;
  discountBps: number;
  vatRateBps: number;
  netHtCents: number;
  vatCents: number;
  ttcCents: number;
}

export interface CommercialDocument {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  number: string | null;
  title: string;
  contactId: string;
  contactNameSnapshot: string;
  contactAddressSnapshot: string;
  contactSiretSnapshot: string;
  sourceQuoteId: string | null;
  parentInvoiceId: string | null;
  projectId: string | null;
  issueDate: string;
  dueDate: string | null;
  globalDiscountBps: number;
  vatExempt: boolean;
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  paidCents: number;
  paymentTerms: string;
  publicNotes: string;
  internalNotes: string;
  signedFileId: string | null;
  signatureRecordedAt: string | null;
  einvoiceStatus: ElectronicInvoiceStatus;
  recurrenceRule: string | null;
  provenance: string;
  externalRef: string;
  version: number;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: DocumentLine[];
}

export interface PaymentRecord {
  id: string;
  documentId: string;
  amountCents: number;
  paymentDate: string;
  method: 'virement' | 'carte' | 'cheque' | 'especes' | 'prelevement';
  reference: string;
  bankAccountId: string | null;
  notes: string;
  createdAt: string;
}

export interface ReminderRecord {
  id: string;
  documentId: string;
  channel: 'courriel_manuel' | 'courrier' | 'telephone';
  level: 1 | 2 | 3;
  sentAt: string;
  scheduledFor: string | null;
  status: 'planifiee' | 'envoyee';
  note: string;
}

export interface SupplierBill {
  id: string;
  supplierId: string;
  supplierName: string;
  billNumber: string;
  issueDate: string;
  dueDate: string;
  category: string;
  accountCode: string;
  totalHtCents: number;
  totalVatCents: number;
  totalTtcCents: number;
  status: 'a_payer' | 'payee';
  receiptId: string | null;
  tags: string;
  notes: string;
  createdAt: string;
}

export interface ReceiptRecord {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  supplierId: string | null;
  category: string;
  receiptDate: string;
  amountTtcCents: number;
  tags: string;
  duplicateWarning: string | null;
  createdAt: string;
}

export interface ExpenseReport {
  id: string;
  userId: string;
  userName: string;
  title: string;
  expenseDate: string;
  category: string;
  amountHtCents: number;
  vatCents: number;
  amountTtcCents: number;
  status: 'brouillon' | 'soumise' | 'approuvee' | 'refusee' | 'remboursee';
  receiptId: string | null;
  projectId: string | null;
  reviewNote: string;
  reimbursedAt: string | null;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  name: string;
  kind: 'banque' | 'caisse';
  iban: string;
  initialBalanceCents: number;
  currentBalanceCents: number;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  txDate: string;
  label: string;
  amountCents: number; // positif = crédit, négatif = débit
  category: string;
  reconciledEntityType: 'facture' | 'achat' | 'note_frais' | null;
  reconciledEntityId: string | null;
  importHash: string | null;
  createdAt: string;
}

export interface ForecastAssumption {
  id: string;
  label: string;
  kind: 'encaissement' | 'decaissement';
  monthlyCents: number;
  confidence: 'haute' | 'moyenne' | 'basse';
  hypothesisNote: string;
}

export interface JournalEntryLine {
  id: string;
  accountNum: string;
  accountLabel: string;
  auxNum: string;
  auxLabel: string;
  label: string;
  debitCents: number;
  creditCents: number;
}

export interface JournalEntry {
  id: string;
  journalCode: string;
  journalLabel: string;
  entryNumber: string;
  entryDate: string;
  pieceRef: string;
  pieceDate: string;
  status: 'brouillard' | 'validee';
  sourceType: string | null;
  sourceId: string | null;
  lines: JournalEntryLine[];
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  code: string;
  name: string;
  clientId: string | null;
  clientName: string;
  budgetHtCents: number;
  hourlyRateCents: number;
  status: 'actif' | 'termine' | 'en_pause';
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  workDate: string;
  minutes: number;
  description: string;
  billable: boolean;
  billedDocumentId: string | null;
}
