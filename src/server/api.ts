import crypto from 'node:crypto';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  assertBalancedJournalEntry,
  assertDocumentEditable,
  canTransitionDocument,
  detectBusinessDuplicateReason,
  formatSequentialNumber,
  generateFecContent,
  hasPermission,
  parseCsvText,
  sanitizeCsvCell,
} from '../core/invariants';
import {
  computeDocumentTotals,
  computeLineTotals,
  formatEurCents,
  parseDecimalToCents,
  parsePercentToBps,
  parseQuantityMilli,
} from '../core/money';
import {
  generateCompanyRecoveryKey,
  generateTotpSecret,
  hashPassword,
  sha256Hex,
  verifyPassword,
  verifyRecoveryKey,
  verifyTotpCode,
  type EncryptedEnvelope,
} from '../core/security';
import type {
  CommercialDocument,
  CompanyProfile,
  DocumentKind,
  DocumentLine,
  DocumentStatus,
  ExpenseReport,
  JournalEntry,
  Permission,
  RoleCode,
} from '../core/types';
import { createEncryptedBackup, restoreEncryptedBackup } from './backup';
import { newId, safeUploadPath, withTransaction, type DbContext } from './db';
import { initializeDemoWorkspace } from './demo';
import { generateCommercialDocumentPdf, generateExpensePdf } from './pdf';
import { initializeCompanyInDb } from './setup';

interface AuthedUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  totpEnabled: boolean;
  accountingScopeNote: string;
}

interface AuthedRequest extends Request {
  user?: AuthedUser;
  sessionId?: string;
}

const SESSION_COOKIE = 'fr_session';
const ALLOWED_UPLOAD_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie ?? '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

export function createApiRouter(ctx: DbContext): express.Router {
  const router = express.Router();
  const { db, uploadDir } = ctx;
  const authAttempts = new Map<string, { count: number; resetAt: number }>();

  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const rec = authAttempts.get(ip);
    if (!rec || rec.resetAt < now) {
      authAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (rec.count >= 15) return false;
    rec.count += 1;
    return true;
  }

  function logAudit(
    user: AuthedUser | undefined,
    action: string,
    entityType: string,
    entityId: string,
    detail = '',
  ): void {
    db.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, actor_name, action, entity_type, entity_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId('aud'),
      user?.id ?? null,
      user?.fullName ?? 'Système',
      action,
      entityType,
      entityId,
      detail,
      new Date().toISOString(),
    );
  }

  function createSessionForUser(res: Response, userId: string): void {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(rawToken);
    const sessionId = newId('ses');
    const now = new Date();
    const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, userId, tokenHash, expires.toISOString(), now.toISOString());
    res.cookie(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60 * 1000,
    });
  }

  function getCompanyRow(): CompanyProfile | null {
    const r = db.prepare('SELECT * FROM companies LIMIT 1').get() as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      name: String(r.name),
      legalForm: String(r.legal_form),
      siret: String(r.siret),
      vatNumber: String(r.vat_number),
      nafCode: String(r.naf_code),
      address: String(r.address),
      postalCode: String(r.postal_code),
      city: String(r.city),
      country: String(r.country),
      email: String(r.email),
      phone: String(r.phone),
      iban: String(r.iban),
      bic: String(r.bic),
      vatRegime: r.vat_regime as CompanyProfile['vatRegime'],
      defaultPaymentTermsDays: Number(r.default_payment_terms_days),
      latePenaltyText: String(r.late_penalty_text),
      accentColor: String(r.accent_color),
      logoDataUrl: r.logo_data_url ? String(r.logo_data_url) : null,
      fiscalYearStartMonth: Number(r.fiscal_year_start_month),
      isDemo: Boolean(r.is_demo),
    };
  }

  function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    if (!token) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    const tokenHash = sha256Hex(token);
    const row = db
      .prepare(
        `SELECT s.id AS sid, s.expires_at, u.id, u.email, u.full_name, u.role, u.totp_enabled, u.is_active, u.accounting_scope_note
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      )
      .get(tokenHash) as Record<string, unknown> | undefined;

    if (!row || Number(row.is_active) !== 1 || new Date(String(row.expires_at)).getTime() < Date.now()) {
      res.status(401).json({ error: 'Session expirée ou invalide.' });
      return;
    }

    req.sessionId = String(row.sid);
    req.user = {
      id: String(row.id),
      email: String(row.email),
      fullName: String(row.full_name),
      role: row.role as RoleCode,
      totpEnabled: Boolean(row.totp_enabled),
      accountingScopeNote: String(row.accounting_scope_note ?? ''),
    };
    next();
  }

  function requirePerm(perm: Permission) {
    return (req: AuthedRequest, res: Response, next: NextFunction) => {
      if (!req.user || !hasPermission(req.user.role, perm)) {
        res.status(403).json({ error: `Permission refusée (${perm}).` });
        return;
      }
      next();
    };
  }

  function hydrateDocument(docId: string): CommercialDocument | null {
    const d = db
      .prepare('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL')
      .get(docId) as Record<string, unknown> | undefined;
    if (!d) return null;
    const lines = db
      .prepare('SELECT * FROM document_lines WHERE document_id = ? ORDER BY position ASC')
      .all(docId) as Array<Record<string, unknown>>;

    return {
      id: String(d.id),
      kind: d.kind as DocumentKind,
      status: d.status as DocumentStatus,
      number: d.number ? String(d.number) : null,
      title: String(d.title),
      contactId: String(d.contact_id),
      contactNameSnapshot: String(d.contact_name_snapshot),
      contactAddressSnapshot: String(d.contact_address_snapshot),
      contactSiretSnapshot: String(d.contact_siret_snapshot),
      sourceQuoteId: d.source_quote_id ? String(d.source_quote_id) : null,
      parentInvoiceId: d.parent_invoice_id ? String(d.parent_invoice_id) : null,
      projectId: d.project_id ? String(d.project_id) : null,
      issueDate: String(d.issue_date),
      dueDate: d.due_date ? String(d.due_date) : null,
      globalDiscountBps: Number(d.global_discount_bps),
      vatExempt: Boolean(d.vat_exempt),
      totalHtCents: Number(d.total_ht_cents),
      totalVatCents: Number(d.total_vat_cents),
      totalTtcCents: Number(d.total_ttc_cents),
      paidCents: Number(d.paid_cents),
      paymentTerms: String(d.payment_terms),
      publicNotes: String(d.public_notes),
      internalNotes: String(d.internal_notes),
      signedFileId: d.signed_file_id ? String(d.signed_file_id) : null,
      signatureRecordedAt: d.signature_recorded_at ? String(d.signature_recorded_at) : null,
      einvoiceStatus: d.einvoice_status as CommercialDocument['einvoiceStatus'],
      recurrenceRule: d.recurrence_rule ? String(d.recurrence_rule) : null,
      provenance: String(d.provenance),
      externalRef: String(d.external_ref),
      version: Number(d.version),
      finalizedAt: d.finalized_at ? String(d.finalized_at) : null,
      createdAt: String(d.created_at),
      updatedAt: String(d.updated_at),
      lines: lines.map((l): DocumentLine => ({
        id: String(l.id),
        documentId: String(l.document_id),
        position: Number(l.position),
        catalogItemId: l.catalog_item_id ? String(l.catalog_item_id) : null,
        label: String(l.label),
        description: String(l.description),
        quantityMilli: Number(l.quantity_milli),
        unit: String(l.unit),
        unitPriceCents: Number(l.unit_price_cents),
        discountBps: Number(l.discount_bps),
        vatRateBps: Number(l.vat_rate_bps),
        netHtCents: Number(l.net_ht_cents),
        vatCents: Number(l.vat_cents),
        ttcCents: Number(l.ttc_cents),
      })),
    };
  }

  function allocateNextNumber(kind: DocumentKind, issueDate: string): string {
    const year = Number(issueDate.slice(0, 4)) || new Date().getFullYear();
    const seqRow = db
      .prepare('SELECT last_number FROM sequences WHERE kind = ? AND fiscal_year = ?')
      .get(kind, year) as { last_number: number } | undefined;
    const nextNum = (seqRow?.last_number ?? 0) + 1;
    if (seqRow) {
      db.prepare('UPDATE sequences SET last_number = ? WHERE kind = ? AND fiscal_year = ?').run(
        nextNum,
        kind,
        year,
      );
    } else {
      db.prepare('INSERT INTO sequences (kind, fiscal_year, last_number) VALUES (?, ?, ?)').run(
        kind,
        year,
        nextNum,
      );
    }
    return formatSequentialNumber(kind, year, nextNum);
  }

  function createAutoSalesJournalEntry(doc: CommercialDocument): void {
    if (doc.kind === 'devis') return;
    const isCredit = doc.kind === 'avoir';
    const seqCount = (
      db.prepare("SELECT COUNT(*) AS cnt FROM journal_entries WHERE journal_code = 'VT'").get() as {
        cnt: number;
      }
    ).cnt;
    const year = Number(doc.issueDate.slice(0, 4)) || new Date().getFullYear();
    const entryNum = `VT-${year}-${String(seqCount + 1).padStart(4, '0')}`;
    const entryId = newId('je');
    const now = new Date().toISOString();

    const lines = [
      {
        accountNum: '411000',
        accountLabel: 'Clients',
        auxNum: doc.contactId.slice(0, 12),
        auxLabel: doc.contactNameSnapshot,
        label: `${doc.kind.toUpperCase()} ${doc.number}`,
        debitCents: isCredit ? 0 : doc.totalTtcCents,
        creditCents: isCredit ? doc.totalTtcCents : 0,
      },
      {
        accountNum: '706000',
        accountLabel: 'Prestations de services',
        auxNum: '',
        auxLabel: '',
        label: `${doc.kind.toUpperCase()} ${doc.number}`,
        debitCents: isCredit ? doc.totalHtCents : 0,
        creditCents: isCredit ? 0 : doc.totalHtCents,
      },
    ];
    if (doc.totalVatCents > 0) {
      lines.push({
        accountNum: '445710',
        accountLabel: 'TVA collectée',
        auxNum: '',
        auxLabel: '',
        label: `TVA ${doc.number}`,
        debitCents: isCredit ? doc.totalVatCents : 0,
        creditCents: isCredit ? 0 : doc.totalVatCents,
      });
    }

    assertBalancedJournalEntry(lines);

    db.prepare(
      `INSERT INTO journal_entries (id, journal_code, journal_label, entry_number, entry_date, piece_ref, piece_date, status, source_type, source_id, created_at)
       VALUES (?, 'VT', 'Ventes', ?, ?, ?, ?, 'validee', ?, ?, ?)`,
    ).run(entryId, entryNum, doc.issueDate, doc.number ?? doc.id, doc.issueDate, doc.kind, doc.id, now);

    const insLine = db.prepare(
      `INSERT INTO journal_lines (id, entry_id, account_num, account_label, aux_num, aux_label, label, debit_cents, credit_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const l of lines) {
      insLine.run(
        newId('jl'),
        entryId,
        l.accountNum,
        l.accountLabel,
        l.auxNum,
        l.auxLabel,
        l.label,
        l.debitCents,
        l.creditCents,
      );
    }
  }

  // --- STATUT & INITIALISATION (SANS MOT DE PASSE FIXE) ---

  router.get('/status', (req, res) => {
    const company = getCompanyRow();
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    let authenticated = false;
    if (token && company) {
      const tokenHash = sha256Hex(token);
      const row = db
        .prepare(
          `SELECT s.expires_at, u.is_active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
        )
        .get(tokenHash) as { expires_at: string; is_active: number } | undefined;
      if (row && Number(row.is_active) === 1 && new Date(row.expires_at).getTime() >= Date.now()) {
        authenticated = true;
      }
    }
    res.json({
      initialized: Boolean(company),
      companyName: company?.name ?? null,
      isDemo: company?.isDemo ?? false,
      authenticated,
    });
  });

  router.post('/setup/init', (req, res) => {
    try {
      const existing = db.prepare('SELECT COUNT(*) AS cnt FROM companies').get() as { cnt: number };
      if (existing.cnt > 0) {
        res.status(409).json({ error: 'Instance déjà initialisée.' });
        return;
      }
      const result = initializeCompanyInDb(db, req.body ?? {});
      createSessionForUser(res, result.userId);
      res.status(201).json({ recoveryKey: result.recoveryKey, companyId: result.companyId });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/setup/demo', (req, res) => {
    try {
      const { adminEmail, adminPassword, adminName } = req.body ?? {};
      if (!adminEmail?.trim() || !adminPassword) {
        res.status(400).json({ error: 'Veuillez définir un courriel et un mot de passe administrateur pour le jeu de démonstration.' });
        return;
      }
      const result = initializeDemoWorkspace(
        db,
        String(adminEmail),
        String(adminPassword),
        adminName ? String(adminName) : 'Camille Moreau',
      );
      const userRow = db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get(String(adminEmail).trim().toLowerCase()) as { id: string };
      createSessionForUser(res, userRow.id);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- AUTHENTIFICATION & 2FA TOTP ---

  router.post('/auth/login', (req, res) => {
    const ip = req.ip ?? 'local';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une minute.' });
      return;
    }
    const { email, password, totpCode } = req.body ?? {};
    const userRow = db
      .prepare('SELECT * FROM users WHERE email = ? AND is_active = 1')
      .get(String(email ?? '').trim().toLowerCase()) as Record<string, unknown> | undefined;

    if (!userRow || !verifyPassword(String(password ?? ''), String(userRow.password_hash))) {
      res.status(401).json({ error: 'Identifiants incorrects.' });
      return;
    }

    if (Number(userRow.totp_enabled) === 1) {
      if (!totpCode) {
        res.status(200).json({ requires2fa: true });
        return;
      }
      if (!verifyTotpCode(String(userRow.totp_secret), String(totpCode))) {
        res.status(401).json({ error: 'Code 2FA TOTP invalide.' });
        return;
      }
    }

    createSessionForUser(res, String(userRow.id));
    logAudit(
      {
        id: String(userRow.id),
        email: String(userRow.email),
        fullName: String(userRow.full_name),
        role: userRow.role as RoleCode,
        totpEnabled: Boolean(userRow.totp_enabled),
        accountingScopeNote: '',
      },
      'AUTH_LOGIN',
      'user',
      String(userRow.id),
    );
    res.json({ ok: true });
  });

  router.post('/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.post('/auth/recover', (req, res) => {
    const ip = req.ip ?? 'local';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Trop de tentatives.' });
      return;
    }
    const { recoveryKey, adminEmail, newPassword } = req.body ?? {};
    const comp = db.prepare('SELECT id, recovery_key_hash FROM companies LIMIT 1').get() as
      | { id: string; recovery_key_hash: string }
      | undefined;
    if (!comp || !verifyRecoveryKey(String(recoveryKey ?? ''), comp.recovery_key_hash)) {
      res.status(403).json({ error: 'Clé de récupération entreprise invalide.' });
      return;
    }
    const user = db
      .prepare("SELECT id, full_name FROM users WHERE email = ? AND role = 'admin'")
      .get(String(adminEmail ?? '').trim().toLowerCase()) as { id: string; full_name: string } | undefined;
    if (!user) {
      res.status(404).json({ error: 'Compte administrateur introuvable pour ce courriel.' });
      return;
    }
    const newHash = hashPassword(String(newPassword ?? ''));
    withTransaction(db, () => {
      db.prepare('UPDATE users SET password_hash = ?, totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(
        newHash,
        user.id,
      );
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    });
    logAudit(undefined, 'AUTH_RECOVERY_RESET', 'user', user.id, 'Réinitialisation via clé de récupération entreprise');
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const company = getCompanyRow();
    res.json({ user: req.user, company });
  });

  router.post('/auth/totp/setup', requireAuth, (req: AuthedRequest, res) => {
    const secret = generateTotpSecret();
    db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(
      secret,
      req.user!.id,
    );
    const company = getCompanyRow();
    const issuer = encodeURIComponent(company?.name ?? 'Factorealm');
    const account = encodeURIComponent(req.user!.email);
    res.json({
      secret,
      otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`,
    });
  });

  router.post('/auth/totp/verify', requireAuth, (req: AuthedRequest, res) => {
    const { code } = req.body ?? {};
    const row = db
      .prepare('SELECT totp_secret FROM users WHERE id = ?')
      .get(req.user!.id) as { totp_secret: string | null } | undefined;
    if (!row?.totp_secret || !verifyTotpCode(row.totp_secret, String(code ?? ''))) {
      res.status(400).json({ error: 'Code TOTP invalide.' });
      return;
    }
    db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user!.id);
    logAudit(req.user, 'TOTP_ENABLED', 'user', req.user!.id);
    res.json({ ok: true });
  });

  // --- ENTREPRISE & UTILISATEURS ---

  router.get('/company', requireAuth, (_req, res) => {
    res.json(getCompanyRow());
  });

  router.put('/company', requireAuth, requirePerm('company:write'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    db.prepare(
      `UPDATE companies SET
        name = ?, legal_form = ?, siret = ?, vat_number = ?, naf_code = ?,
        address = ?, postal_code = ?, city = ?, email = ?, phone = ?,
        iban = ?, bic = ?, vat_regime = ?, default_payment_terms_days = ?,
        late_penalty_text = ?, accent_color = ?, logo_data_url = ?`,
    ).run(
      String(b.name ?? ''),
      String(b.legalForm ?? 'SAS'),
      String(b.siret ?? ''),
      String(b.vatNumber ?? ''),
      String(b.nafCode ?? ''),
      String(b.address ?? ''),
      String(b.postalCode ?? ''),
      String(b.city ?? ''),
      String(b.email ?? ''),
      String(b.phone ?? ''),
      String(b.iban ?? ''),
      String(b.bic ?? ''),
      String(b.vatRegime ?? 'reel_normal'),
      Number(b.defaultPaymentTermsDays ?? 30),
      String(b.latePenaltyText ?? ''),
      String(b.accentColor ?? '#0066FF'),
      b.logoDataUrl ? String(b.logoDataUrl) : null,
    );
    logAudit(req.user, 'COMPANY_UPDATE', 'company', 'main', String(b.name ?? ''));
    res.json(getCompanyRow());
  });

  router.post('/company/reset', requireAuth, requirePerm('company:write'), (req: AuthedRequest, res) => {
    const ip = req.ip ?? 'local';
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une minute.' });
      return;
    }
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Seul un compte administrateur peut réinitialiser l\'entreprise.' });
      return;
    }

    const { password, confirmText, totpCode } = req.body ?? {};
    if (String(confirmText ?? '').trim().toUpperCase() !== 'REINITIALISER') {
      res.status(400).json({ error: 'Veuillez saisir exactement REINITIALISER pour confirmer la réinitialisation.' });
      return;
    }

    const adminRow = db
      .prepare('SELECT id, password_hash, totp_enabled, totp_secret FROM users WHERE id = ? AND is_active = 1')
      .get(req.user.id) as
      | { id: string; password_hash: string; totp_enabled: number; totp_secret: string | null }
      | undefined;

    if (!adminRow || !verifyPassword(String(password ?? ''), adminRow.password_hash)) {
      res.status(401).json({ error: 'Mot de passe administrateur incorrect.' });
      return;
    }

    if (Number(adminRow.totp_enabled) === 1) {
      if (!totpCode || !adminRow.totp_secret || !verifyTotpCode(adminRow.totp_secret, String(totpCode))) {
        res.status(401).json({ error: 'Code 2FA TOTP requis ou invalide.' });
        return;
      }
    }

    const tablesToClear = [
      'audit_logs',
      'time_entries',
      'projects',
      'journal_lines',
      'journal_entries',
      'accounting_periods',
      'forecast_assumptions',
      'bank_rules',
      'bank_transactions',
      'bank_accounts',
      'expense_reports',
      'supplier_bills',
      'receipts',
      'reminders',
      'payments',
      'document_versions',
      'document_lines',
      'documents',
      'sequences',
      'catalog_items',
      'contacts',
      'sessions',
      'users',
      'companies',
    ];

    withTransaction(db, () => {
      for (const table of tablesToClear) {
        db.exec(`DELETE FROM ${table};`);
      }
    });

    if (fs.existsSync(uploadDir)) {
      for (const entry of fs.readdirSync(uploadDir)) {
        const target = safeUploadPath(uploadDir, entry);
        fs.rmSync(target, { recursive: true, force: true });
      }
    }

    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true, reset: true });
  });

  router.get('/users', requireAuth, requirePerm('users:manage'), (_req, res) => {
    const rows = db
      .prepare('SELECT id, email, full_name, role, totp_enabled, is_active, accounting_scope_note, created_at FROM users ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        totpEnabled: Boolean(u.totp_enabled),
        isActive: Boolean(u.is_active),
        accountingScopeNote: u.accounting_scope_note,
        createdAt: u.created_at,
      })),
    );
  });

  router.post('/users', requireAuth, requirePerm('users:manage'), (req: AuthedRequest, res) => {
    try {
      const { email, fullName, role, password, accountingScopeNote = '' } = req.body ?? {};
      if (!email || !fullName || !role || !password) {
        res.status(400).json({ error: 'Champs requis manquants.' });
        return;
      }
      const id = newId('usr');
      const pwHash = hashPassword(String(password));
      db.prepare(
        `INSERT INTO users (id, email, full_name, role, password_hash, accounting_scope_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        String(email).trim().toLowerCase(),
        String(fullName).trim(),
        String(role),
        pwHash,
        String(accountingScopeNote),
        new Date().toISOString(),
      );
      logAudit(req.user, 'USER_CREATE', 'user', id, `${email} (${role})`);
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.patch('/users/:id', requireAuth, requirePerm('users:manage'), (req: AuthedRequest, res) => {
    const { role, isActive, accountingScopeNote } = req.body ?? {};
    db.prepare(
      'UPDATE users SET role = COALESCE(?, role), is_active = COALESCE(?, is_active), accounting_scope_note = COALESCE(?, accounting_scope_note) WHERE id = ?',
    ).run(
      role ?? null,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
      accountingScopeNote ?? null,
      req.params.id,
    );
    if (isActive === false) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id);
    }
    logAudit(req.user, 'USER_UPDATE', 'user', req.params.id);
    res.json({ ok: true });
  });

  // --- CONTACTS & CATALOGUE & CSV ---

  router.get('/contacts', requireAuth, requirePerm('contacts:read'), (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM contacts WHERE deleted_at IS NULL ORDER BY company_name ASC')
      .all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        companyName: r.company_name,
        contactName: r.contact_name,
        email: r.email,
        phone: r.phone,
        siret: r.siret,
        vatNumber: r.vat_number,
        address: r.address,
        postalCode: r.postal_code,
        city: r.city,
        notes: r.notes,
        provenance: r.provenance,
        externalRef: r.external_ref,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    );
  });

  router.post('/contacts', requireAuth, requirePerm('contacts:write'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.companyName?.trim()) {
      res.status(400).json({ error: 'La raison sociale est requise.' });
      return;
    }
    const id = newId('cnt');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO contacts (id, type, company_name, contact_name, email, phone, siret, vat_number, address, postal_code, city, notes, provenance, external_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      String(b.type ?? 'client'),
      String(b.companyName).trim(),
      String(b.contactName ?? ''),
      String(b.email ?? ''),
      String(b.phone ?? ''),
      String(b.siret ?? ''),
      String(b.vatNumber ?? ''),
      String(b.address ?? ''),
      String(b.postalCode ?? ''),
      String(b.city ?? ''),
      String(b.notes ?? ''),
      String(b.provenance ?? 'saisie_manuelle'),
      String(b.externalRef ?? ''),
      now,
      now,
    );
    logAudit(req.user, 'CONTACT_CREATE', 'contact', id, String(b.companyName));
    res.status(201).json({ id });
  });

  router.put('/contacts/:id', requireAuth, requirePerm('contacts:write'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    db.prepare(
      `UPDATE contacts SET type=?, company_name=?, contact_name=?, email=?, phone=?, siret=?, vat_number=?, address=?, postal_code=?, city=?, notes=?, updated_at=? WHERE id=?`,
    ).run(
      String(b.type ?? 'client'),
      String(b.companyName ?? ''),
      String(b.contactName ?? ''),
      String(b.email ?? ''),
      String(b.phone ?? ''),
      String(b.siret ?? ''),
      String(b.vatNumber ?? ''),
      String(b.address ?? ''),
      String(b.postalCode ?? ''),
      String(b.city ?? ''),
      String(b.notes ?? ''),
      new Date().toISOString(),
      req.params.id,
    );
    logAudit(req.user, 'CONTACT_UPDATE', 'contact', req.params.id);
    res.json({ ok: true });
  });

  router.delete('/contacts/:id', requireAuth, requirePerm('contacts:write'), (req: AuthedRequest, res) => {
    db.prepare('UPDATE contacts SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
    logAudit(req.user, 'CONTACT_DELETE', 'contact', req.params.id);
    res.json({ ok: true });
  });

  router.get('/catalog', requireAuth, requirePerm('contacts:read'), (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM catalog_items WHERE is_active = 1 ORDER BY name ASC')
      .all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        description: r.description,
        kind: r.kind,
        unit: r.unit,
        unitPriceCents: Number(r.unit_price_cents),
        vatRateBps: Number(r.vat_rate_bps),
        accountCode: r.account_code,
        isActive: Boolean(r.is_active),
      })),
    );
  });

  router.post('/catalog', requireAuth, requirePerm('contacts:write'), (req: AuthedRequest, res) => {
    try {
      const b = req.body ?? {};
      if (!b.name?.trim()) {
        res.status(400).json({ error: 'Le libellé du produit/service est requis.' });
        return;
      }
      const id = newId('cat');
      const priceCents =
        typeof b.unitPriceCents === 'number'
          ? b.unitPriceCents
          : parseDecimalToCents(String(b.unitPriceEur ?? '0'));
      const vatBps =
        typeof b.vatRateBps === 'number'
          ? b.vatRateBps
          : parsePercentToBps(String(b.vatRatePct ?? '20'));
      db.prepare(
        `INSERT INTO catalog_items (id, sku, name, description, kind, unit, unit_price_cents, vat_rate_bps, account_code, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      ).run(
        id,
        String(b.sku ?? `ART-${Date.now().toString().slice(-4)}`),
        String(b.name).trim(),
        String(b.description ?? ''),
        String(b.kind ?? 'service'),
        String(b.unit ?? 'unité'),
        priceCents,
        vatBps,
        String(b.accountCode ?? '706000'),
        new Date().toISOString(),
      );
      logAudit(req.user, 'CATALOG_CREATE', 'catalog_item', id, String(b.name));
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/catalog/:id', requireAuth, requirePerm('contacts:write'), (req: AuthedRequest, res) => {
    db.prepare('UPDATE catalog_items SET is_active = 0 WHERE id = ?').run(req.params.id);
    logAudit(req.user, 'CATALOG_DELETE', 'catalog_item', req.params.id);
    res.json({ ok: true });
  });

  router.get('/export/csv/:kind', requireAuth, requirePerm('contacts:read'), (req: AuthedRequest, res) => {
    const kind = req.params.kind;
    let lines: string[] = [];
    if (kind === 'contacts') {
      lines.push(['Type', 'RaisonSociale', 'Contact', 'Email', 'Telephone', 'SIRET', 'TVA', 'Ville'].join(';'));
      const rows = db.prepare('SELECT * FROM contacts WHERE deleted_at IS NULL').all() as Array<Record<string, unknown>>;
      for (const r of rows) {
        lines.push(
          [r.type, r.company_name, r.contact_name, r.email, r.phone, r.siret, r.vat_number, r.city]
            .map((c) => sanitizeCsvCell(String(c ?? '')))
            .join(';'),
        );
      }
    } else if (kind === 'catalog') {
      lines.push(['Reference', 'Nom', 'Type', 'Unite', 'PrixHT_EUR', 'TVA_Pct', 'Compte'].join(';'));
      const rows = db.prepare('SELECT * FROM catalog_items WHERE is_active = 1').all() as Array<Record<string, unknown>>;
      for (const r of rows) {
        lines.push(
          [
            r.sku,
            r.name,
            r.kind,
            r.unit,
            (Number(r.unit_price_cents) / 100).toFixed(2).replace('.', ','),
            (Number(r.vat_rate_bps) / 100).toFixed(2).replace('.', ','),
            r.account_code,
          ]
            .map((c) => sanitizeCsvCell(String(c ?? '')))
            .join(';'),
        );
      }
    } else if (kind === 'expenses') {
      lines.push(['Date', 'Collaborateur', 'Intitule', 'Categorie', 'HT', 'TVA', 'TTC', 'Statut'].join(';'));
      const rows = db.prepare('SELECT * FROM expense_reports ORDER BY expense_date DESC').all() as Array<Record<string, unknown>>;
      for (const r of rows) {
        lines.push(
          [
            r.expense_date,
            r.user_name,
            r.title,
            r.category,
            formatEurCents(Number(r.amount_ht_cents)),
            formatEurCents(Number(r.vat_cents)),
            formatEurCents(Number(r.amount_ttc_cents)),
            r.status,
          ]
            .map((c) => sanitizeCsvCell(String(c ?? '')))
            .join(';'),
        );
      }
    } else {
      res.status(400).json({ error: 'Type d\'export CSV inconnu.' });
      return;
    }

    logAudit(req.user, 'CSV_EXPORT', kind, kind);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="factorealm-${kind}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  });

  // Simulation et import historique CSV configurable (contacts / catalogue / factures historiques)
  router.post('/import/csv/preview', requireAuth, requirePerm('contacts:write'), (req, res) => {
    const { csvText } = req.body ?? {};
    const parsed = parseCsvText(String(csvText ?? ''));
    res.json({
      headers: parsed.headers,
      sampleRows: parsed.rows.slice(0, 8),
      totalRows: parsed.rows.length,
    });
  });

  router.post('/import/csv/commit', requireAuth, requirePerm('contacts:write'), (req: AuthedRequest, res) => {
    try {
      const { kind, csvText, mapping, provenance = 'import_csv', dryRun = false } = req.body ?? {};
      const parsed = parseCsvText(String(csvText ?? ''));
      const errors: Array<{ row: number; reason: string }> = [];
      let imported = 0;
      let skippedDuplicates = 0;

      const colIndex = (field: string): number => {
        const headerName = mapping?.[field];
        return headerName ? parsed.headers.indexOf(headerName) : -1;
      };

      const run = () => {
        parsed.rows.forEach((row, idx) => {
          try {
            if (kind === 'contacts') {
              const name = row[colIndex('companyName')] ?? '';
              if (!name.trim()) throw new Error('Raison sociale vide');
              const siret = colIndex('siret') >= 0 ? row[colIndex('siret')] ?? '' : '';
              const exists = db
                .prepare('SELECT id FROM contacts WHERE deleted_at IS NULL AND lower(company_name) = lower(?)')
                .get(name.trim());
              if (exists) {
                skippedDuplicates++;
                return;
              }
              if (!dryRun) {
                const now = new Date().toISOString();
                db.prepare(
                  `INSERT INTO contacts (id, type, company_name, contact_name, email, siret, city, provenance, external_ref, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ).run(
                  newId('cnt'),
                  colIndex('type') >= 0 ? (row[colIndex('type')] || 'client') : 'client',
                  name.trim(),
                  colIndex('contactName') >= 0 ? row[colIndex('contactName')] ?? '' : '',
                  colIndex('email') >= 0 ? row[colIndex('email')] ?? '' : '',
                  siret,
                  colIndex('city') >= 0 ? row[colIndex('city')] ?? '' : '',
                  String(provenance),
                  colIndex('externalRef') >= 0 ? row[colIndex('externalRef')] ?? '' : '',
                  now,
                  now,
                );
              }
              imported++;
            } else if (kind === 'catalog') {
              const name = row[colIndex('name')] ?? '';
              if (!name.trim()) throw new Error('Nom article vide');
              const priceCents = parseDecimalToCents(row[colIndex('unitPrice')] ?? '0');
              const vatBps = colIndex('vatRate') >= 0 ? parsePercentToBps(row[colIndex('vatRate')] ?? '20') : 2000;
              if (!dryRun) {
                db.prepare(
                  `INSERT INTO catalog_items (id, sku, name, kind, unit, unit_price_cents, vat_rate_bps, account_code, is_active, created_at)
                   VALUES (?, ?, ?, 'service', 'unité', ?, ?, '706000', 1, ?)`,
                ).run(
                  newId('cat'),
                  colIndex('sku') >= 0 ? row[colIndex('sku')] || `IMP-${idx + 1}` : `IMP-${idx + 1}`,
                  name.trim(),
                  priceCents,
                  vatBps,
                  new Date().toISOString(),
                );
              }
              imported++;
            } else if (kind === 'historical_invoices') {
              const extRef = row[colIndex('number')] ?? '';
              const clientName = row[colIndex('clientName')] ?? '';
              const issueDate = row[colIndex('issueDate')] ?? '';
              const totalHt = parseDecimalToCents(row[colIndex('totalHt')] ?? '0');
              const totalTtc = parseDecimalToCents(row[colIndex('totalTtc')] ?? '0');
              if (!extRef || !clientName || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
                throw new Error('Numéro original, client ou date AAAA-MM-JJ manquant');
              }
              const dup = db
                .prepare('SELECT id FROM documents WHERE external_ref = ? OR number = ?')
                .get(extRef, extRef);
              if (dup) {
                skippedDuplicates++;
                return;
              }
              if (!dryRun) {
                const now = new Date().toISOString();
                let contact = db
                  .prepare('SELECT id FROM contacts WHERE deleted_at IS NULL AND lower(company_name) = lower(?)')
                  .get(clientName.trim()) as { id: string } | undefined;
                if (!contact) {
                  const cid = newId('cnt');
                  db.prepare(
                    `INSERT INTO contacts (id, type, company_name, provenance, created_at, updated_at) VALUES (?, 'client', ?, ?, ?, ?)`,
                  ).run(cid, clientName.trim(), String(provenance), now, now);
                  contact = { id: cid };
                }
                const docId = newId('doc');
                db.prepare(
                  `INSERT INTO documents (id, kind, status, number, title, contact_id, contact_name_snapshot, issue_date, total_ht_cents, total_vat_cents, total_ttc_cents, paid_cents, provenance, external_ref, finalized_at, created_at, updated_at)
                   VALUES (?, 'facture', 'finalise', NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
                ).run(
                  docId,
                  `Import historique ${extRef}`,
                  contact.id,
                  clientName.trim(),
                  issueDate,
                  totalHt,
                  Math.max(0, totalTtc - totalHt),
                  totalTtc,
                  String(provenance),
                  extRef,
                  now,
                  now,
                  now,
                );
              }
              imported++;
            } else {
              throw new Error('Type d\'import non supporté.');
            }
          } catch (rowErr) {
            errors.push({ row: idx + 2, reason: (rowErr as Error).message });
          }
        });
      };

      withTransaction(db, run);
      if (!dryRun) {
        logAudit(req.user, 'CSV_IMPORT', String(kind), String(provenance), `${imported} importé(s), ${skippedDuplicates} doublon(s)`);
      }
      res.json({ dryRun, imported, skippedDuplicates, errors });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- DEVIS, FACTURES, ACOMPTES, AVOIRS, RÈGLEMENTS, RELANCES, PDF ---

  router.get('/documents', requireAuth, requirePerm('billing:read'), (req, res) => {
    const kind = req.query.kind ? String(req.query.kind) : null;
    const rows = kind
      ? (db
          .prepare('SELECT id FROM documents WHERE deleted_at IS NULL AND kind = ? ORDER BY issue_date DESC, created_at DESC')
          .all(kind) as Array<{ id: string }>)
      : (db
          .prepare('SELECT id FROM documents WHERE deleted_at IS NULL ORDER BY issue_date DESC, created_at DESC')
          .all() as Array<{ id: string }>);
    const docs = rows.map((r) => hydrateDocument(r.id)).filter(Boolean);
    res.json(docs);
  });

  router.post('/documents', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    try {
      const b = req.body ?? {};
      const contact = db
        .prepare('SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL')
        .get(String(b.contactId ?? '')) as Record<string, unknown> | undefined;
      if (!contact) {
        res.status(400).json({ error: 'Client introuvable.' });
        return;
      }
      const rawLines: Array<Record<string, unknown>> = Array.isArray(b.lines) ? b.lines : [];
      if (rawLines.length === 0) {
        res.status(400).json({ error: 'Au moins une ligne est requise.' });
        return;
      }

      const globalDiscountBps = Number(b.globalDiscountBps ?? 0);
      const vatExempt = Boolean(b.vatExempt);

      const calcInputs = rawLines.map((l) => ({
        quantityMilli:
          typeof l.quantityMilli === 'number'
            ? l.quantityMilli
            : parseQuantityMilli(String(l.quantity ?? '1')),
        unitPriceCents:
          typeof l.unitPriceCents === 'number'
            ? l.unitPriceCents
            : parseDecimalToCents(String(l.unitPriceEur ?? '0')),
        discountBps: Number(l.discountBps ?? 0),
        vatRateBps: Number(l.vatRateBps ?? 2000),
      }));
      const docTotals = computeDocumentTotals(calcInputs, globalDiscountBps, vatExempt);

      const docId = newId('doc');
      const now = new Date().toISOString();
      const addrSnapshot = [contact.address, contact.postal_code, contact.city].filter(Boolean).join(', ');

      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO documents (
            id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot,
            contact_siret_snapshot, project_id, issue_date, due_date, global_discount_bps, vat_exempt,
            total_ht_cents, total_vat_cents, total_ttc_cents, paid_cents, payment_terms, public_notes,
            internal_notes, einvoice_status, recurrence_rule, idempotency_key, provenance, created_at, updated_at
          ) VALUES (?, ?, 'brouillon', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'factorealm', ?, ?)`,
        ).run(
          docId,
          String(b.kind ?? 'devis'),
          String(b.title ?? ''),
          String(contact.id),
          String(contact.company_name),
          addrSnapshot,
          String(contact.siret ?? ''),
          b.projectId ? String(b.projectId) : null,
          String(b.issueDate ?? now.slice(0, 10)),
          b.dueDate ? String(b.dueDate) : null,
          globalDiscountBps,
          vatExempt ? 1 : 0,
          docTotals.totalHtCents,
          docTotals.totalVatCents,
          docTotals.totalTtcCents,
          String(b.paymentTerms ?? 'Virement à 30 jours'),
          String(b.publicNotes ?? ''),
          String(b.internalNotes ?? ''),
          b.kind === 'facture' ? 'a_preparer' : 'non_applicable',
          b.recurrenceRule ? String(b.recurrenceRule) : null,
          b.idempotencyKey ? String(b.idempotencyKey) : null,
          now,
          now,
        );

        const insLine = db.prepare(
          `INSERT INTO document_lines (
            id, document_id, position, catalog_item_id, label, description, quantity_milli,
            unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        rawLines.forEach((l, idx) => {
          const inp = calcInputs[idx];
          const calc = computeLineTotals({
            ...inp,
            vatRateBps: vatExempt ? 0 : inp.vatRateBps,
          });
          insLine.run(
            newId('dl'),
            docId,
            idx + 1,
            l.catalogItemId ? String(l.catalogItemId) : null,
            String(l.label ?? 'Prestation'),
            String(l.description ?? ''),
            inp.quantityMilli,
            String(l.unit ?? 'unité'),
            inp.unitPriceCents,
            inp.discountBps,
            vatExempt ? 0 : inp.vatRateBps,
            calc.netHtCents,
            calc.vatCents,
            calc.ttcCents,
          );
        });
      });

      logAudit(req.user, 'DOC_CREATE_DRAFT', String(b.kind ?? 'devis'), docId, String(b.title ?? ''));
      res.status(201).json(hydrateDocument(docId));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.put('/documents/:id', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    try {
      const current = hydrateDocument(req.params.id);
      if (!current) {
        res.status(404).json({ error: 'Document introuvable.' });
        return;
      }
      assertDocumentEditable(current.kind, current.status);
      const b = req.body ?? {};
      const rawLines: Array<Record<string, unknown>> = Array.isArray(b.lines) ? b.lines : current.lines;
      const globalDiscountBps = Number(b.globalDiscountBps ?? current.globalDiscountBps);
      const vatExempt = typeof b.vatExempt === 'boolean' ? b.vatExempt : current.vatExempt;

      const calcInputs = rawLines.map((l) => ({
        quantityMilli:
          typeof l.quantityMilli === 'number'
            ? l.quantityMilli
            : parseQuantityMilli(String(l.quantity ?? '1')),
        unitPriceCents:
          typeof l.unitPriceCents === 'number'
            ? l.unitPriceCents
            : parseDecimalToCents(String(l.unitPriceEur ?? '0')),
        discountBps: Number(l.discountBps ?? 0),
        vatRateBps: Number(l.vatRateBps ?? 2000),
      }));
      const docTotals = computeDocumentTotals(calcInputs, globalDiscountBps, vatExempt);
      const now = new Date().toISOString();

      withTransaction(db, () => {
        db.prepare(
          `UPDATE documents SET title=?, issue_date=?, due_date=?, global_discount_bps=?, vat_exempt=?,
           total_ht_cents=?, total_vat_cents=?, total_ttc_cents=?, payment_terms=?, public_notes=?, internal_notes=?,
           recurrence_rule=?, version=version+1, updated_at=? WHERE id=?`,
        ).run(
          String(b.title ?? current.title),
          String(b.issueDate ?? current.issueDate),
          b.dueDate !== undefined ? b.dueDate : current.dueDate,
          globalDiscountBps,
          vatExempt ? 1 : 0,
          docTotals.totalHtCents,
          docTotals.totalVatCents,
          docTotals.totalTtcCents,
          String(b.paymentTerms ?? current.paymentTerms),
          String(b.publicNotes ?? current.publicNotes),
          String(b.internalNotes ?? current.internalNotes),
          b.recurrenceRule !== undefined ? b.recurrenceRule : current.recurrenceRule,
          now,
          current.id,
        );

        db.prepare('DELETE FROM document_lines WHERE document_id = ?').run(current.id);
        const insLine = db.prepare(
          `INSERT INTO document_lines (
            id, document_id, position, catalog_item_id, label, description, quantity_milli,
            unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        rawLines.forEach((l, idx) => {
          const inp = calcInputs[idx];
          const calc = computeLineTotals({
            ...inp,
            vatRateBps: vatExempt ? 0 : inp.vatRateBps,
          });
          insLine.run(
            newId('dl'),
            current.id,
            idx + 1,
            l.catalogItemId ? String(l.catalogItemId) : null,
            String(l.label ?? 'Prestation'),
            String(l.description ?? ''),
            inp.quantityMilli,
            String(l.unit ?? 'unité'),
            inp.unitPriceCents,
            inp.discountBps,
            vatExempt ? 0 : inp.vatRateBps,
            calc.netHtCents,
            calc.vatCents,
            calc.ttcCents,
          );
        });
      });

      logAudit(req.user, 'DOC_UPDATE_DRAFT', current.kind, current.id);
      res.json(hydrateDocument(current.id));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/:id/finalize', requireAuth, requirePerm('billing:finalize'), (req: AuthedRequest, res) => {
    try {
      const doc = hydrateDocument(req.params.id);
      if (!doc) {
        res.status(404).json({ error: 'Document introuvable.' });
        return;
      }
      if (doc.status !== 'brouillon') {
        res.json(doc); // Idempotent si déjà finalisé
        return;
      }

      const targetStatus: DocumentStatus = doc.kind === 'devis' ? 'envoye' : 'finalise';
      const now = new Date().toISOString();

      withTransaction(db, () => {
        const number = doc.number ?? allocateNextNumber(doc.kind, doc.issueDate);
        db.prepare(
          `UPDATE documents SET status = ?, number = ?, finalized_at = ?, updated_at = ? WHERE id = ?`,
        ).run(targetStatus, number, now, now, doc.id);

        const finalized = hydrateDocument(doc.id)!;
        db.prepare(
          `INSERT INTO document_versions (id, document_id, version, snapshot_json, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(newId('dver'), doc.id, finalized.version, JSON.stringify(finalized), req.user!.id, now);

        createAutoSalesJournalEntry(finalized);
      });

      const result = hydrateDocument(doc.id)!;
      logAudit(req.user, 'DOC_FINALIZE', result.kind, result.id, `Numéro attribué : ${result.number}`);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/:id/status', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    const doc = hydrateDocument(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document introuvable.' });
      return;
    }
    const target = String(req.body?.status ?? '') as DocumentStatus;
    if (!canTransitionDocument(doc.kind, doc.status, target)) {
      res.status(400).json({ error: `Transition interdite de "${doc.status}" vers "${target}".` });
      return;
    }
    const now = new Date().toISOString();
    withTransaction(db, () => {
      const number = doc.number ?? (doc.kind === 'devis' ? allocateNextNumber('devis', doc.issueDate) : null);
      db.prepare('UPDATE documents SET status = ?, number = COALESCE(number, ?), updated_at = ? WHERE id = ?').run(
        target,
        number,
        now,
        doc.id,
      );
    });
    logAudit(req.user, 'DOC_STATUS', doc.kind, doc.id, `${doc.status} -> ${target}`);
    res.json(hydrateDocument(doc.id));
  });

  router.post('/documents/:id/convert-to-invoice', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    const quote = hydrateDocument(req.params.id);
    if (!quote || quote.kind !== 'devis') {
      res.status(404).json({ error: 'Devis introuvable.' });
      return;
    }
    const newIdDoc = newId('doc');
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const due = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO documents (
          id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot,
          contact_siret_snapshot, source_quote_id, project_id, issue_date, due_date, global_discount_bps,
          vat_exempt, total_ht_cents, total_vat_cents, total_ttc_cents, paid_cents, payment_terms,
          public_notes, internal_notes, einvoice_status, provenance, created_at, updated_at
        ) VALUES (?, 'facture', 'brouillon', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'a_preparer', 'factorealm', ?, ?)`,
      ).run(
        newIdDoc,
        quote.title,
        quote.contactId,
        quote.contactNameSnapshot,
        quote.contactAddressSnapshot,
        quote.contactSiretSnapshot,
        quote.id,
        quote.projectId,
        today,
        due,
        quote.globalDiscountBps,
        quote.vatExempt ? 1 : 0,
        quote.totalHtCents,
        quote.totalVatCents,
        quote.totalTtcCents,
        quote.paymentTerms,
        quote.publicNotes,
        `Issue du devis ${quote.number ?? quote.id}`,
        now,
        now,
      );

      const insLine = db.prepare(
        `INSERT INTO document_lines (id, document_id, position, catalog_item_id, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const l of quote.lines) {
        insLine.run(
          newId('dl'),
          newIdDoc,
          l.position,
          l.catalogItemId,
          l.label,
          l.description,
          l.quantityMilli,
          l.unit,
          l.unitPriceCents,
          l.discountBps,
          l.vatRateBps,
          l.netHtCents,
          l.vatCents,
          l.ttcCents,
        );
      }
    });

    logAudit(req.user, 'QUOTE_CONVERT_TO_INVOICE', 'document', newIdDoc, `Depuis devis ${quote.number ?? quote.id}`);
    res.status(201).json(hydrateDocument(newIdDoc));
  });

  router.post('/documents/:id/create-credit-note', requireAuth, requirePerm('billing:finalize'), (req: AuthedRequest, res) => {
    const inv = hydrateDocument(req.params.id);
    if (!inv || (inv.kind !== 'facture' && inv.kind !== 'acompte') || inv.status === 'brouillon') {
      res.status(400).json({ error: 'Seule une facture finalisée peut faire l\'objet d\'un avoir.' });
      return;
    }
    const creditId = newId('doc');
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO documents (
          id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot,
          contact_siret_snapshot, parent_invoice_id, issue_date, global_discount_bps, vat_exempt,
          total_ht_cents, total_vat_cents, total_ttc_cents, paid_cents, payment_terms, public_notes,
          einvoice_status, provenance, created_at, updated_at
        ) VALUES (?, 'avoir', 'brouillon', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'a_preparer', 'factorealm', ?, ?)`,
      ).run(
        creditId,
        `Avoir sur ${inv.number ?? inv.id}`,
        inv.contactId,
        inv.contactNameSnapshot,
        inv.contactAddressSnapshot,
        inv.contactSiretSnapshot,
        inv.id,
        today,
        inv.globalDiscountBps,
        inv.vatExempt ? 1 : 0,
        inv.totalHtCents,
        inv.totalVatCents,
        inv.totalTtcCents,
        'Compensation sur facture d\'origine',
        `Avoir rattaché à la facture ${inv.number}`,
        now,
        now,
      );

      const insLine = db.prepare(
        `INSERT INTO document_lines (id, document_id, position, catalog_item_id, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const l of inv.lines) {
        insLine.run(
          newId('dl'),
          creditId,
          l.position,
          l.catalogItemId,
          l.label,
          l.description,
          l.quantityMilli,
          l.unit,
          l.unitPriceCents,
          l.discountBps,
          l.vatRateBps,
          l.netHtCents,
          l.vatCents,
          l.ttcCents,
        );
      }
    });
    logAudit(req.user, 'INVOICE_CREATE_CREDIT_NOTE', 'avoir', creditId, `Facture ${inv.number}`);
    res.status(201).json(hydrateDocument(creditId));
  });

  router.post('/documents/:id/create-deposit', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    const quote = hydrateDocument(req.params.id);
    if (!quote || quote.kind !== 'devis') {
      res.status(404).json({ error: 'Devis introuvable.' });
      return;
    }
    const percentBps = parsePercentToBps(String(req.body?.percent ?? '30'));
    const depositId = newId('doc');
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const ht = Math.round((quote.totalHtCents * percentBps) / 10000);
    const calc = computeDocumentTotals([{ quantityMilli: 1000, unitPriceCents: ht, discountBps: 0, vatRateBps: quote.vatExempt ? 0 : 2000 }], 0, quote.vatExempt);

    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO documents (
          id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot,
          contact_siret_snapshot, source_quote_id, issue_date, due_date, total_ht_cents, total_vat_cents,
          total_ttc_cents, paid_cents, payment_terms, public_notes, einvoice_status, provenance, created_at, updated_at
        ) VALUES (?, 'acompte', 'brouillon', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'À réception', ?, 'a_preparer', 'factorealm', ?, ?)`,
      ).run(
        depositId,
        `Acompte ${percentBps / 100} % — ${quote.title}`,
        quote.contactId,
        quote.contactNameSnapshot,
        quote.contactAddressSnapshot,
        quote.contactSiretSnapshot,
        quote.id,
        today,
        today,
        calc.totalHtCents,
        calc.totalVatCents,
        calc.totalTtcCents,
        `Acompte sur devis ${quote.number ?? quote.id}`,
        now,
        now,
      );
      db.prepare(
        `INSERT INTO document_lines (id, document_id, position, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
         VALUES (?, ?, 1, ?, ?, 1000, 'forfait', ?, 0, ?, ?, ?, ?)`,
      ).run(
        newId('dl'),
        depositId,
        `Acompte ${percentBps / 100} % sur devis ${quote.number ?? quote.title}`,
        quote.title,
        ht,
        quote.vatExempt ? 0 : 2000,
        calc.totalHtCents,
        calc.totalVatCents,
        calc.totalTtcCents,
      );
    });
    logAudit(req.user, 'DEPOSIT_CREATE', 'acompte', depositId, `${percentBps / 100}% sur ${quote.id}`);
    res.status(201).json(hydrateDocument(depositId));
  });

  router.post('/documents/:id/duplicate', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    const src = hydrateDocument(req.params.id);
    if (!src) {
      res.status(404).json({ error: 'Document introuvable.' });
      return;
    }
    const copyId = newId('doc');
    const now = new Date().toISOString();
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO documents (
          id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot,
          contact_siret_snapshot, issue_date, due_date, global_discount_bps, vat_exempt, total_ht_cents,
          total_vat_cents, total_ttc_cents, paid_cents, payment_terms, public_notes, internal_notes,
          einvoice_status, provenance, created_at, updated_at
        ) VALUES (?, ?, 'brouillon', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'factorealm', ?, ?)`,
      ).run(
        copyId,
        src.kind,
        `${src.title} (copie)`,
        src.contactId,
        src.contactNameSnapshot,
        src.contactAddressSnapshot,
        src.contactSiretSnapshot,
        now.slice(0, 10),
        src.dueDate,
        src.globalDiscountBps,
        src.vatExempt ? 1 : 0,
        src.totalHtCents,
        src.totalVatCents,
        src.totalTtcCents,
        src.paymentTerms,
        src.publicNotes,
        src.internalNotes,
        src.kind === 'facture' ? 'a_preparer' : 'non_applicable',
        now,
        now,
      );
      const insLine = db.prepare(
        `INSERT INTO document_lines (id, document_id, position, catalog_item_id, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const l of src.lines) {
        insLine.run(
          newId('dl'),
          copyId,
          l.position,
          l.catalogItemId,
          l.label,
          l.description,
          l.quantityMilli,
          l.unit,
          l.unitPriceCents,
          l.discountBps,
          l.vatRateBps,
          l.netHtCents,
          l.vatCents,
          l.ttcCents,
        );
      }
    });
    logAudit(req.user, 'DOC_DUPLICATE', src.kind, copyId, `Copie de ${src.id}`);
    res.status(201).json(hydrateDocument(copyId));
  });

  router.patch('/documents/:id/einvoice', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    db.prepare('UPDATE documents SET einvoice_status = ?, updated_at = ? WHERE id = ?').run(
      String(req.body?.einvoiceStatus ?? 'a_preparer'),
      new Date().toISOString(),
      req.params.id,
    );
    logAudit(req.user, 'DOC_EINVOICE_STATUS', 'document', req.params.id, String(req.body?.einvoiceStatus ?? ''));
    res.json(hydrateDocument(req.params.id));
  });

  router.post('/documents/:id/signature', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    const doc = hydrateDocument(req.params.id);
    if (!doc || doc.kind !== 'devis') {
      res.status(404).json({ error: 'Devis introuvable.' });
      return;
    }
    const { receiptId } = req.body ?? {};
    const now = new Date().toISOString();
    withTransaction(db, () => {
      db.prepare(
        `UPDATE documents SET signed_file_id = ?, signature_recorded_at = ?, status = 'accepte', updated_at = ? WHERE id = ?`,
      ).run(receiptId ? String(receiptId) : null, now, now, doc.id);
      db.prepare(
        `INSERT INTO document_versions (id, document_id, version, snapshot_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(newId('dver'), doc.id, doc.version + 1, JSON.stringify(hydrateDocument(doc.id)), req.user!.id, now);
    });
    logAudit(req.user, 'QUOTE_SIGNED_IMPORT', 'devis', doc.id);
    res.json(hydrateDocument(doc.id));
  });

  router.post('/documents/:id/payments', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    try {
      const doc = hydrateDocument(req.params.id);
      if (!doc || doc.status === 'brouillon' || doc.kind === 'devis') {
        res.status(400).json({ error: 'Règlement impossible sur un brouillon ou un devis.' });
        return;
      }
      const amountCents =
        typeof req.body?.amountCents === 'number'
          ? req.body.amountCents
          : parseDecimalToCents(String(req.body?.amountEur ?? '0'));
      if (amountCents <= 0) {
        res.status(400).json({ error: 'Le montant du règlement doit être strictement positif.' });
        return;
      }
      const remaining = doc.totalTtcCents - doc.paidCents;
      if (amountCents > remaining) {
        res.status(400).json({ error: `Le montant dépasse le solde restant dû (${formatEurCents(remaining)}).` });
        return;
      }
      const paymentDate = String(req.body?.paymentDate ?? new Date().toISOString().slice(0, 10));
      const method = String(req.body?.method ?? 'virement');
      const reference = String(req.body?.reference ?? '');
      const bankAccountId = req.body?.bankAccountId ? String(req.body.bankAccountId) : null;
      const now = new Date().toISOString();
      const payId = newId('pay');

      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO payments (id, document_id, amount_cents, payment_date, method, reference, bank_account_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(payId, doc.id, amountCents, paymentDate, method, reference, bankAccountId, String(req.body?.notes ?? ''), now);

        const newPaid = doc.paidCents + amountCents;
        const newStatus: DocumentStatus = newPaid >= doc.totalTtcCents ? 'paye' : 'paye_partiel';
        db.prepare('UPDATE documents SET paid_cents = ?, status = ?, updated_at = ? WHERE id = ?').run(
          newPaid,
          newStatus,
          now,
          doc.id,
        );

        if (bankAccountId) {
          db.prepare(
            `INSERT INTO bank_transactions (id, bank_account_id, tx_date, label, amount_cents, category, reconciled_entity_type, reconciled_entity_id, created_at)
             VALUES (?, ?, ?, ?, ?, 'Encaissement client', 'facture', ?, ?)`,
          ).run(newId('btx'), bankAccountId, paymentDate, `Règlement ${doc.number ?? doc.id} (${reference || method})`, amountCents, doc.id, now);
        }
      });

      logAudit(req.user, 'PAYMENT_RECORD', 'payment', payId, `${formatEurCents(amountCents)} sur ${doc.number}`);
      res.status(201).json(hydrateDocument(doc.id));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/documents/:id/payments', requireAuth, requirePerm('billing:read'), (req, res) => {
    const rows = db
      .prepare('SELECT * FROM payments WHERE document_id = ? ORDER BY payment_date DESC')
      .all(req.params.id) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        documentId: r.document_id,
        amountCents: Number(r.amount_cents),
        paymentDate: r.payment_date,
        method: r.method,
        reference: r.reference,
        bankAccountId: r.bank_account_id,
        notes: r.notes,
        createdAt: r.created_at,
      })),
    );
  });

  router.get('/documents/:id/reminders', requireAuth, requirePerm('billing:read'), (req, res) => {
    const rows = db
      .prepare('SELECT * FROM reminders WHERE document_id = ? ORDER BY sent_at DESC')
      .all(req.params.id);
    res.json(rows);
  });

  router.post('/documents/:id/reminders', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    const id = newId('rem');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO reminders (id, document_id, channel, level, sent_at, scheduled_for, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.params.id,
      String(req.body?.channel ?? 'courriel_manuel'),
      Number(req.body?.level ?? 1),
      now,
      req.body?.scheduledFor ? String(req.body.scheduledFor) : null,
      String(req.body?.status ?? 'envoyee'),
      String(req.body?.note ?? ''),
    );
    logAudit(req.user, 'REMINDER_RECORD', 'document', req.params.id);
    res.status(201).json({ id });
  });

  router.get('/documents/:id/pdf', requireAuth, requirePerm('billing:read'), async (req: AuthedRequest, res) => {
    const doc = hydrateDocument(req.params.id);
    const company = getCompanyRow();
    if (!doc || !company) {
      res.status(404).json({ error: 'Document ou profil introuvable.' });
      return;
    }
    const bytes = await generateCommercialDocumentPdf(doc, company);
    logAudit(req.user, 'DOC_PDF_DOWNLOAD', doc.kind, doc.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.number ?? doc.id}.pdf"`);
    res.send(Buffer.from(bytes));
  });

  router.get('/documents/:id/facturx-xml', requireAuth, requirePerm('billing:read'), (req, res) => {
    const doc = hydrateDocument(req.params.id);
    const company = getCompanyRow();
    if (!doc || !company) {
      res.status(404).json({ error: 'Document introuvable.' });
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(doc.number ?? doc.id)}</ram:ID>
    <ram:TypeCode>${doc.kind === 'avoir' ? '381' : '380'}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${doc.issueDate.replace(/-/g, '')}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${esc(company.name)}</ram:Name></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${esc(doc.contactNameSnapshot)}</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${(doc.totalHtCents / 100).toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${(doc.totalVatCents / 100).toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${(doc.totalTtcCents / 100).toFixed(2)}</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="factur-x-${doc.number ?? doc.id}.xml"`);
    res.send(xml);
  });

  // --- ACHATS, JUSTIFICATIFS & NOTES DE FRAIS ---

  router.get('/receipts', requireAuth, requirePerm('purchases:read'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM receipts ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        originalFilename: r.original_filename,
        mimeType: r.mime_type,
        sizeBytes: Number(r.size_bytes),
        sha256: r.sha256,
        supplierId: r.supplier_id,
        category: r.category,
        receiptDate: r.receipt_date,
        amountTtcCents: Number(r.amount_ttc_cents),
        tags: r.tags,
        duplicateWarning: r.duplicate_warning,
        createdAt: r.created_at,
      })),
    );
  });

  router.post('/receipts', requireAuth, requirePerm('expenses:create'), (req: AuthedRequest, res) => {
    try {
      const { filename, mimeType, contentBase64, supplierId, category, receiptDate, amountTtcEur, tags = '' } = req.body ?? {};
      if (!filename || !mimeType || !contentBase64) {
        res.status(400).json({ error: 'Fichier justificatif requis.' });
        return;
      }
      if (!ALLOWED_UPLOAD_MIMES.has(String(mimeType))) {
        res.status(400).json({ error: 'Type de fichier refusé (PDF, PNG, JPEG ou WEBP uniquement).' });
        return;
      }
      const buf = Buffer.from(String(contentBase64), 'base64');
      if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) {
        res.status(400).json({ error: 'Taille de justificatif invalide (10 Mo maximum).' });
        return;
      }

      const hash = sha256Hex(buf);
      const amountCents = amountTtcEur ? parseDecimalToCents(String(amountTtcEur)) : 0;
      const dateStr = String(receiptDate ?? new Date().toISOString().slice(0, 10));

      // Distinction doublon binaire (SHA-256) vs suspicion métier
      const binaryDup = db.prepare('SELECT id, original_filename FROM receipts WHERE sha256 = ?').get(hash) as
        | { id: string; original_filename: string }
        | undefined;
      let duplicateWarning: string | null = null;
      if (binaryDup) {
        duplicateWarning = `Identité binaire exacte (SHA-256) avec le justificatif "${binaryDup.original_filename}".`;
      } else if (supplierId && amountCents > 0) {
        const existingReceipts = db
          .prepare('SELECT id, supplier_id, amount_ttc_cents, receipt_date FROM receipts WHERE supplier_id = ?')
          .all(String(supplierId)) as Array<Record<string, unknown>>;
        duplicateWarning = detectBusinessDuplicateReason(
          { supplierId: String(supplierId), amountCents, date: dateStr },
          existingReceipts.map((r) => ({
            id: String(r.id),
            supplierId: r.supplier_id ? String(r.supplier_id) : null,
            amountCents: Number(r.amount_ttc_cents),
            date: String(r.receipt_date),
          })),
        );
      }

      const id = newId('rcp');
      const storedName = `${id}_${String(filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const targetPath = safeUploadPath(uploadDir, storedName);
      fs.writeFileSync(targetPath, buf);

      db.prepare(
        `INSERT INTO receipts (id, original_filename, mime_type, size_bytes, sha256, storage_path, supplier_id, category, receipt_date, amount_ttc_cents, tags, duplicate_warning, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        String(filename),
        String(mimeType),
        buf.length,
        hash,
        storedName,
        supplierId ? String(supplierId) : null,
        String(category ?? 'Achats généraux'),
        dateStr,
        amountCents,
        String(tags),
        duplicateWarning,
        new Date().toISOString(),
      );

      logAudit(req.user, 'RECEIPT_UPLOAD', 'receipt', id, `${filename} (sha256:${hash.slice(0, 12)})`);
      res.status(201).json({ id, sha256: hash, duplicateWarning });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/receipts/:id/file', requireAuth, requirePerm('purchases:read'), (req, res) => {
    const row = db
      .prepare('SELECT original_filename, mime_type, storage_path FROM receipts WHERE id = ?')
      .get(req.params.id) as { original_filename: string; mime_type: string; storage_path: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Justificatif introuvable.' });
      return;
    }
    const target = safeUploadPath(uploadDir, row.storage_path);
    if (!fs.existsSync(target)) {
      res.status(404).json({ error: 'Fichier absent sur disque.' });
      return;
    }
    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${row.original_filename.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(fs.readFileSync(target));
  });

  router.get('/supplier-bills', requireAuth, requirePerm('purchases:read'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM supplier_bills ORDER BY due_date DESC').all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        billNumber: r.bill_number,
        issueDate: r.issue_date,
        dueDate: r.due_date,
        category: r.category,
        accountCode: r.account_code,
        totalHtCents: Number(r.total_ht_cents),
        totalVatCents: Number(r.total_vat_cents),
        totalTtcCents: Number(r.total_ttc_cents),
        status: r.status,
        receiptId: r.receipt_id,
        tags: r.tags,
        notes: r.notes,
        createdAt: r.created_at,
      })),
    );
  });

  router.post('/supplier-bills', requireAuth, requirePerm('purchases:write'), (req: AuthedRequest, res) => {
    try {
      const b = req.body ?? {};
      const sup = db
        .prepare('SELECT id, company_name FROM contacts WHERE id = ?')
        .get(String(b.supplierId ?? '')) as { id: string; company_name: string } | undefined;
      if (!sup) {
        res.status(400).json({ error: 'Fournisseur introuvable.' });
        return;
      }
      const totalHtCents = parseDecimalToCents(String(b.totalHtEur ?? '0'));
      const totalVatCents = parseDecimalToCents(String(b.totalVatEur ?? '0'));
      const totalTtcCents = totalHtCents + totalVatCents;

      const existing = db
        .prepare('SELECT id, supplier_id, bill_number, issue_date, total_ttc_cents FROM supplier_bills WHERE supplier_id = ?')
        .all(sup.id) as Array<Record<string, unknown>>;
      const dupReason = detectBusinessDuplicateReason(
        {
          supplierId: sup.id,
          amountCents: totalTtcCents,
          date: String(b.issueDate),
          billNumber: String(b.billNumber ?? ''),
        },
        existing.map((e) => ({
          id: String(e.id),
          supplierId: String(e.supplier_id),
          amountCents: Number(e.total_ttc_cents),
          date: String(e.issue_date),
          billNumber: String(e.bill_number),
        })),
      );

      const id = newId('bill');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO supplier_bills (id, supplier_id, supplier_name, bill_number, issue_date, due_date, category, account_code, total_ht_cents, total_vat_cents, total_ttc_cents, status, receipt_id, tags, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'a_payer', ?, ?, ?, ?)`,
      ).run(
        id,
        sup.id,
        sup.company_name,
        String(b.billNumber ?? ''),
        String(b.issueDate ?? now.slice(0, 10)),
        String(b.dueDate ?? now.slice(0, 10)),
        String(b.category ?? 'Achats généraux'),
        String(b.accountCode ?? '606000'),
        totalHtCents,
        totalVatCents,
        totalTtcCents,
        b.receiptId ? String(b.receiptId) : null,
        String(b.tags ?? ''),
        String(b.notes ?? ''),
        now,
      );
      logAudit(req.user, 'SUPPLIER_BILL_CREATE', 'supplier_bill', id, `${sup.company_name} #${b.billNumber}`);
      res.status(201).json({ id, duplicateWarning: dupReason });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.patch('/supplier-bills/:id', requireAuth, requirePerm('purchases:write'), (req: AuthedRequest, res) => {
    db.prepare('UPDATE supplier_bills SET status = COALESCE(?, status), receipt_id = COALESCE(?, receipt_id) WHERE id = ?').run(
      req.body?.status ?? null,
      req.body?.receiptId ?? null,
      req.params.id,
    );
    logAudit(req.user, 'SUPPLIER_BILL_UPDATE', 'supplier_bill', req.params.id);
    res.json({ ok: true });
  });

  router.get('/expenses', requireAuth, (req: AuthedRequest, res) => {
    const rows =
      req.user!.role === 'salarie'
        ? (db.prepare('SELECT * FROM expense_reports WHERE user_id = ? ORDER BY expense_date DESC').all(req.user!.id) as Array<Record<string, unknown>>)
        : (db.prepare('SELECT * FROM expense_reports ORDER BY expense_date DESC').all() as Array<Record<string, unknown>>);
    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        title: r.title,
        expenseDate: r.expense_date,
        category: r.category,
        amountHtCents: Number(r.amount_ht_cents),
        vatCents: Number(r.vat_cents),
        amountTtcCents: Number(r.amount_ttc_cents),
        status: r.status,
        receiptId: r.receipt_id,
        projectId: r.project_id,
        reviewNote: r.review_note,
        reimbursedAt: r.reimbursed_at,
        createdAt: r.created_at,
      })),
    );
  });

  router.post('/expenses', requireAuth, requirePerm('expenses:create'), (req: AuthedRequest, res) => {
    try {
      const b = req.body ?? {};
      const ht = parseDecimalToCents(String(b.amountHtEur ?? '0'));
      const vat = parseDecimalToCents(String(b.vatEur ?? '0'));
      const id = newId('exp');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO expense_reports (id, user_id, user_name, title, expense_date, category, amount_ht_cents, vat_cents, amount_ttc_cents, status, receipt_id, project_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        req.user!.id,
        req.user!.fullName,
        String(b.title ?? 'Note de frais'),
        String(b.expenseDate ?? now.slice(0, 10)),
        String(b.category ?? 'Déplacement'),
        ht,
        vat,
        ht + vat,
        b.submitNow ? 'soumise' : 'brouillon',
        b.receiptId ? String(b.receiptId) : null,
        b.projectId ? String(b.projectId) : null,
        now,
      );
      logAudit(req.user, 'EXPENSE_CREATE', 'expense_report', id);
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.patch('/expenses/:id', requireAuth, (req: AuthedRequest, res) => {
    const exp = db.prepare('SELECT * FROM expense_reports WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!exp) {
      res.status(404).json({ error: 'Note de frais introuvable.' });
      return;
    }
    const nextStatus = String(req.body?.status ?? exp.status);
    if (nextStatus === 'soumise' && exp.user_id === req.user!.id) {
      // autorisé
    } else if (['approuvee', 'refusee', 'remboursee'].includes(nextStatus)) {
      if (!hasPermission(req.user!.role, 'expenses:approve')) {
        res.status(403).json({ error: 'Approbation réservée aux gestionnaires/administrateurs.' });
        return;
      }
    } else {
      res.status(403).json({ error: 'Action non autorisée sur cette note de frais.' });
      return;
    }
    const reimbursedAt = nextStatus === 'remboursee' ? new Date().toISOString() : null;
    db.prepare(
      'UPDATE expense_reports SET status = ?, review_note = COALESCE(?, review_note), reimbursed_at = COALESCE(?, reimbursed_at) WHERE id = ?',
    ).run(nextStatus, req.body?.reviewNote ?? null, reimbursedAt, req.params.id);
    logAudit(req.user, 'EXPENSE_STATUS', 'expense_report', req.params.id, nextStatus);
    res.json({ ok: true });
  });

  router.get('/expenses/:id/pdf', requireAuth, async (req, res) => {
    const r = db.prepare('SELECT * FROM expense_reports WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    const company = getCompanyRow();
    if (!r || !company) {
      res.status(404).json({ error: 'Introuvable.' });
      return;
    }
    const exp: ExpenseReport = {
      id: String(r.id),
      userId: String(r.user_id),
      userName: String(r.user_name),
      title: String(r.title),
      expenseDate: String(r.expense_date),
      category: String(r.category),
      amountHtCents: Number(r.amount_ht_cents),
      vatCents: Number(r.vat_cents),
      amountTtcCents: Number(r.amount_ttc_cents),
      status: r.status as ExpenseReport['status'],
      receiptId: r.receipt_id ? String(r.receipt_id) : null,
      projectId: r.project_id ? String(r.project_id) : null,
      reviewNote: String(r.review_note ?? ''),
      reimbursedAt: r.reimbursed_at ? String(r.reimbursed_at) : null,
      createdAt: String(r.created_at),
    };
    const pdfBytes = await generateExpensePdf(exp, company);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="note-de-frais-${exp.id}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  });

  // --- BANQUE & TRÉSORERIE ---

  router.get('/bank-accounts', requireAuth, requirePerm('treasury:read'), (_req, res) => {
    const accounts = db.prepare('SELECT * FROM bank_accounts ORDER BY created_at ASC').all() as Array<Record<string, unknown>>;
    const txSums = db
      .prepare('SELECT bank_account_id, COALESCE(SUM(amount_cents), 0) AS total FROM bank_transactions GROUP BY bank_account_id')
      .all() as Array<{ bank_account_id: string; total: number }>;
    const map = new Map(txSums.map((s) => [s.bank_account_id, Number(s.total)]));
    res.json(
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        iban: a.iban,
        initialBalanceCents: Number(a.initial_balance_cents),
        currentBalanceCents: Number(a.initial_balance_cents) + (map.get(String(a.id)) ?? 0),
      })),
    );
  });

  router.post('/bank-accounts', requireAuth, requirePerm('treasury:write'), (req: AuthedRequest, res) => {
    try {
      const id = newId('bnk');
      const initCents = parseDecimalToCents(String(req.body?.initialBalanceEur ?? '0'));
      db.prepare(
        `INSERT INTO bank_accounts (id, name, kind, iban, initial_balance_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        String(req.body?.name ?? 'Nouveau compte'),
        String(req.body?.kind ?? 'banque'),
        String(req.body?.iban ?? ''),
        initCents,
        new Date().toISOString(),
      );
      logAudit(req.user, 'BANK_ACCOUNT_CREATE', 'bank_account', id);
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/bank-transactions', requireAuth, requirePerm('treasury:read'), (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM bank_transactions ORDER BY tx_date DESC, created_at DESC')
      .all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        bankAccountId: r.bank_account_id,
        txDate: r.tx_date,
        label: r.label,
        amountCents: Number(r.amount_cents),
        category: r.category,
        reconciledEntityType: r.reconciled_entity_type,
        reconciledEntityId: r.reconciled_entity_id,
        createdAt: r.created_at,
      })),
    );
  });

  router.post('/bank-transactions', requireAuth, requirePerm('treasury:write'), (req: AuthedRequest, res) => {
    try {
      const amountCents = parseDecimalToCents(String(req.body?.amountEur ?? '0'));
      const id = newId('btx');
      const label = String(req.body?.label ?? 'Mouvement manuel');
      let category = String(req.body?.category ?? 'Non catégorisé');
      if (category === 'Non catégorisé') {
        const rules = db.prepare('SELECT keyword, category FROM bank_rules').all() as Array<{ keyword: string; category: string }>;
        const found = rules.find((r) => label.toLowerCase().includes(r.keyword.toLowerCase()));
        if (found) category = found.category;
      }
      db.prepare(
        `INSERT INTO bank_transactions (id, bank_account_id, tx_date, label, amount_cents, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        String(req.body?.bankAccountId),
        String(req.body?.txDate ?? new Date().toISOString().slice(0, 10)),
        label,
        amountCents,
        category,
        new Date().toISOString(),
      );
      logAudit(req.user, 'BANK_TX_CREATE', 'bank_transaction', id);
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/bank-transactions/import-csv', requireAuth, requirePerm('treasury:write'), (req: AuthedRequest, res) => {
    try {
      const { bankAccountId, csvText, dateCol, labelCol, amountCol } = req.body ?? {};
      const parsed = parseCsvText(String(csvText ?? ''));
      const di = parsed.headers.indexOf(String(dateCol));
      const li = parsed.headers.indexOf(String(labelCol));
      const ai = parsed.headers.indexOf(String(amountCol));
      if (di < 0 || li < 0 || ai < 0) {
        res.status(400).json({ error: 'Correspondance des colonnes Date / Libellé / Montant invalide.' });
        return;
      }
      const rules = db.prepare('SELECT keyword, category FROM bank_rules').all() as Array<{ keyword: string; category: string }>;
      let imported = 0;
      let duplicates = 0;
      const now = new Date().toISOString();

      withTransaction(db, () => {
        for (const row of parsed.rows) {
          const txDate = row[di] ?? '';
          const label = row[li] ?? '';
          const amountCents = parseDecimalToCents(row[ai] ?? '0');
          const importHash = sha256Hex(`${bankAccountId}|${txDate}|${label}|${amountCents}`);
          const exists = db.prepare('SELECT id FROM bank_transactions WHERE import_hash = ?').get(importHash);
          if (exists) {
            duplicates++;
            continue;
          }
          const matchedRule = rules.find((r) => label.toLowerCase().includes(r.keyword.toLowerCase()));
          db.prepare(
            `INSERT INTO bank_transactions (id, bank_account_id, tx_date, label, amount_cents, category, import_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            newId('btx'),
            String(bankAccountId),
            txDate,
            label,
            amountCents,
            matchedRule ? matchedRule.category : 'Importé (à classer)',
            importHash,
            now,
          );
          imported++;
        }
      });

      logAudit(req.user, 'BANK_CSV_IMPORT', 'bank_account', String(bankAccountId), `${imported} lignes`);
      res.json({ imported, duplicates });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/bank-transactions/:id/reconcile', requireAuth, requirePerm('treasury:write'), (req: AuthedRequest, res) => {
    const { entityType, entityId, category } = req.body ?? {};
    db.prepare(
      'UPDATE bank_transactions SET reconciled_entity_type = ?, reconciled_entity_id = ?, category = COALESCE(?, category) WHERE id = ?',
    ).run(entityType ?? null, entityId ?? null, category ?? null, req.params.id);
    logAudit(req.user, 'BANK_TX_RECONCILE', 'bank_transaction', req.params.id, `${entityType}:${entityId}`);
    res.json({ ok: true });
  });

  router.get('/bank-rules', requireAuth, requirePerm('treasury:read'), (_req, res) => {
    res.json(db.prepare('SELECT * FROM bank_rules').all());
  });

  router.post('/bank-rules', requireAuth, requirePerm('treasury:write'), (req, res) => {
    const id = newId('rul');
    db.prepare('INSERT INTO bank_rules (id, keyword, category, account_code) VALUES (?, ?, ?, ?)').run(
      id,
      String(req.body?.keyword ?? ''),
      String(req.body?.category ?? ''),
      String(req.body?.accountCode ?? '627000'),
    );
    res.status(201).json({ id });
  });

  router.delete('/bank-rules/:id', requireAuth, requirePerm('treasury:write'), (req, res) => {
    db.prepare('DELETE FROM bank_rules WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.get('/forecasts', requireAuth, requirePerm('treasury:read'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM forecast_assumptions').all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: r.id,
        label: r.label,
        kind: r.kind,
        monthlyCents: Number(r.monthly_cents),
        confidence: r.confidence,
        hypothesisNote: r.hypothesis_note,
      })),
    );
  });

  router.post('/forecasts', requireAuth, requirePerm('treasury:write'), (req, res) => {
    try {
      const id = newId('fct');
      const monthlyCents = parseDecimalToCents(String(req.body?.monthlyEur ?? '0'));
      db.prepare(
        `INSERT INTO forecast_assumptions (id, label, kind, monthly_cents, confidence, hypothesis_note) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        String(req.body?.label ?? ''),
        String(req.body?.kind ?? 'encaissement'),
        monthlyCents,
        String(req.body?.confidence ?? 'moyenne'),
        String(req.body?.hypothesisNote ?? ''),
      );
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/forecasts/:id', requireAuth, requirePerm('treasury:write'), (req, res) => {
    db.prepare('DELETE FROM forecast_assumptions WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // --- COMPTABILITÉ, TVA, FEC, CLÔTURES, PROJETS ---

  router.get('/accounting/books', requireAuth, requirePerm('accounting:read'), (_req, res) => {
    const receiptsBook = db
      .prepare(
        `SELECT p.id, p.payment_date, p.amount_cents, p.method, p.reference, d.number AS doc_number, d.contact_name_snapshot
         FROM payments p JOIN documents d ON d.id = p.document_id ORDER BY p.payment_date DESC`,
      )
      .all();
    const purchasesBook = db
      .prepare('SELECT * FROM supplier_bills ORDER BY issue_date DESC')
      .all();
    res.json({ receiptsBook, purchasesBook });
  });

  router.get('/accounting/vat-summary', requireAuth, requirePerm('accounting:read'), (_req, res) => {
    const collected = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN kind = 'avoir' THEN -total_vat_cents ELSE total_vat_cents END), 0) AS vat_collected,
                COALESCE(SUM(CASE WHEN kind = 'avoir' THEN -total_ht_cents ELSE total_ht_cents END), 0) AS sales_ht
         FROM documents WHERE deleted_at IS NULL AND kind IN ('facture', 'acompte', 'avoir') AND status != 'brouillon' AND status != 'annule'`,
      )
      .get() as { vat_collected: number; sales_ht: number };

    const deductibleBills = db
      .prepare('SELECT COALESCE(SUM(total_vat_cents), 0) AS vat_deductible, COALESCE(SUM(total_ht_cents), 0) AS purchases_ht FROM supplier_bills')
      .get() as { vat_deductible: number; purchases_ht: number };

    const deductibleExpenses = db
      .prepare("SELECT COALESCE(SUM(vat_cents), 0) AS vat_exp FROM expense_reports WHERE status IN ('approuvee', 'remboursee')")
      .get() as { vat_exp: number };

    const vatCollectedCents = Number(collected.vat_collected);
    const vatDeductibleCents = Number(deductibleBills.vat_deductible) + Number(deductibleExpenses.vat_exp);
    res.json({
      salesHtCents: Number(collected.sales_ht),
      purchasesHtCents: Number(deductibleBills.purchases_ht),
      vatCollectedCents,
      vatDeductibleCents,
      vatDueCents: vatCollectedCents - vatDeductibleCents,
    });
  });

  router.get('/accounting/pcg', requireAuth, requirePerm('accounting:read'), (_req, res) => {
    res.json(db.prepare('SELECT * FROM pcg_accounts ORDER BY code ASC').all());
  });

  router.get('/accounting/entries', requireAuth, requirePerm('accounting:read'), (_req, res) => {
    const entries = db
      .prepare('SELECT * FROM journal_entries ORDER BY entry_date DESC, created_at DESC')
      .all() as Array<Record<string, unknown>>;
    const out: JournalEntry[] = entries.map((e) => {
      const lines = db
        .prepare('SELECT * FROM journal_lines WHERE entry_id = ?')
        .all(String(e.id)) as Array<Record<string, unknown>>;
      return {
        id: String(e.id),
        journalCode: String(e.journal_code),
        journalLabel: String(e.journal_label),
        entryNumber: String(e.entry_number),
        entryDate: String(e.entry_date),
        pieceRef: String(e.piece_ref),
        pieceDate: String(e.piece_date),
        status: e.status as JournalEntry['status'],
        sourceType: e.source_type ? String(e.source_type) : null,
        sourceId: e.source_id ? String(e.source_id) : null,
        createdAt: String(e.created_at),
        lines: lines.map((l) => ({
          id: String(l.id),
          accountNum: String(l.account_num),
          accountLabel: String(l.account_label),
          auxNum: String(l.aux_num),
          auxLabel: String(l.aux_label),
          label: String(l.label),
          debitCents: Number(l.debit_cents),
          creditCents: Number(l.credit_cents),
        })),
      };
    });
    res.json(out);
  });

  router.post('/accounting/entries', requireAuth, requirePerm('accounting:write'), (req: AuthedRequest, res) => {
    try {
      const b = req.body ?? {};
      const entryDate = String(b.entryDate ?? new Date().toISOString().slice(0, 10));
      const periodKey = entryDate.slice(0, 7);
      const closed = db
        .prepare('SELECT closed_at FROM accounting_periods WHERE period_key = ? AND closed_at IS NOT NULL')
        .get(periodKey);
      if (closed) {
        res.status(400).json({ error: `La période ${periodKey} est clôturée.` });
        return;
      }

      const rawLines: Array<Record<string, unknown>> = Array.isArray(b.lines) ? b.lines : [];
      const lines = rawLines.map((l) => ({
        accountNum: String(l.accountNum ?? ''),
        accountLabel: String(l.accountLabel ?? ''),
        auxNum: String(l.auxNum ?? ''),
        auxLabel: String(l.auxLabel ?? ''),
        label: String(l.label ?? ''),
        debitCents: typeof l.debitCents === 'number' ? l.debitCents : parseDecimalToCents(String(l.debitEur ?? '0')),
        creditCents: typeof l.creditCents === 'number' ? l.creditCents : parseDecimalToCents(String(l.creditEur ?? '0')),
      }));
      assertBalancedJournalEntry(lines);

      const entryId = newId('je');
      const journalCode = String(b.journalCode ?? 'OD');
      const count = (db.prepare('SELECT COUNT(*) AS cnt FROM journal_entries').get() as { cnt: number }).cnt;
      const entryNum = `${journalCode}-${entryDate.slice(0, 4)}-${String(count + 1).padStart(4, '0')}`;
      const now = new Date().toISOString();

      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO journal_entries (id, journal_code, journal_label, entry_number, entry_date, piece_ref, piece_date, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'validee', ?)`,
        ).run(
          entryId,
          journalCode,
          String(b.journalLabel ?? 'Opérations diverses'),
          entryNum,
          entryDate,
          String(b.pieceRef ?? entryNum),
          String(b.pieceDate ?? entryDate),
          now,
        );
        const insLine = db.prepare(
          `INSERT INTO journal_lines (id, entry_id, account_num, account_label, aux_num, aux_label, label, debit_cents, credit_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const l of lines) {
          insLine.run(
            newId('jl'),
            entryId,
            l.accountNum,
            l.accountLabel,
            l.auxNum,
            l.auxLabel,
            l.label,
            l.debitCents,
            l.creditCents,
          );
        }
      });

      logAudit(req.user, 'JOURNAL_ENTRY_CREATE', 'journal_entry', entryId, entryNum);
      res.status(201).json({ id: entryId, entryNumber: entryNum });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/accounting/periods', requireAuth, requirePerm('accounting:read'), (_req, res) => {
    res.json(db.prepare('SELECT * FROM accounting_periods ORDER BY period_key DESC').all());
  });

  router.post('/accounting/periods/:key/close', requireAuth, requirePerm('accounting:close'), (req: AuthedRequest, res) => {
    const key = req.params.key;
    if (!/^\d{4}-\d{2}$/.test(key)) {
      res.status(400).json({ error: 'Format période attendu : AAAA-MM.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO accounting_periods (period_key, start_date, end_date, closed_at, closed_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(period_key) DO UPDATE SET closed_at = excluded.closed_at, closed_by = excluded.closed_by`,
    ).run(key, `${key}-01`, `${key}-31`, now, req.user!.fullName);
    logAudit(req.user, 'PERIOD_CLOSE', 'accounting_period', key);
    res.json({ ok: true });
  });

  router.get('/accounting/fec', requireAuth, requirePerm('accounting:read'), (req: AuthedRequest, res) => {
    const entriesRaw = db
      .prepare("SELECT * FROM journal_entries WHERE status = 'validee' ORDER BY entry_date ASC, entry_number ASC")
      .all() as Array<Record<string, unknown>>;
    const entries: JournalEntry[] = entriesRaw.map((e) => {
      const lines = db
        .prepare('SELECT * FROM journal_lines WHERE entry_id = ?')
        .all(String(e.id)) as Array<Record<string, unknown>>;
      return {
        id: String(e.id),
        journalCode: String(e.journal_code),
        journalLabel: String(e.journal_label),
        entryNumber: String(e.entry_number),
        entryDate: String(e.entry_date),
        pieceRef: String(e.piece_ref),
        pieceDate: String(e.piece_date),
        status: 'validee',
        sourceType: null,
        sourceId: null,
        createdAt: String(e.created_at),
        lines: lines.map((l) => ({
          id: String(l.id),
          accountNum: String(l.account_num),
          accountLabel: String(l.account_label),
          auxNum: String(l.aux_num),
          auxLabel: String(l.aux_label),
          label: String(l.label),
          debitCents: Number(l.debit_cents),
          creditCents: Number(l.credit_cents),
        })),
      };
    });
    const fec = generateFecContent(entries);
    logAudit(req.user, 'FEC_EXPORT', 'accounting', 'fec', `${fec.lineCount} lignes`);
    if (req.query.download === '1') {
      const comp = getCompanyRow();
      const siren = (comp?.siret || '000000000').slice(0, 9);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${siren}FEC${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.txt"`);
      res.send(fec.content);
      return;
    }
    res.json(fec);
  });

  // --- PROJETS & TEMPS PASSÉ FACTURABLE ---

  router.get('/projects', requireAuth, requirePerm('projects:read'), (_req, res) => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
    const timeRows = db.prepare('SELECT * FROM time_entries ORDER BY work_date DESC').all() as Array<Record<string, unknown>>;
    res.json({
      projects: projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        clientId: p.client_id,
        clientName: p.client_name,
        budgetHtCents: Number(p.budget_ht_cents),
        hourlyRateCents: Number(p.hourly_rate_cents),
        status: p.status,
        createdAt: p.created_at,
      })),
      timeEntries: timeRows.map((t) => ({
        id: t.id,
        projectId: t.project_id,
        userId: t.user_id,
        userName: t.user_name,
        workDate: t.work_date,
        minutes: Number(t.minutes),
        description: t.description,
        billable: Boolean(t.billable),
        billedDocumentId: t.billed_document_id,
      })),
    });
  });

  router.post('/projects', requireAuth, requirePerm('projects:write'), (req: AuthedRequest, res) => {
    try {
      const b = req.body ?? {};
      const id = newId('prj');
      let clientName = '';
      if (b.clientId) {
        const c = db.prepare('SELECT company_name FROM contacts WHERE id = ?').get(String(b.clientId)) as { company_name: string } | undefined;
        clientName = c?.company_name ?? '';
      }
      db.prepare(
        `INSERT INTO projects (id, code, name, client_id, client_name, budget_ht_cents, hourly_rate_cents, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'actif', ?)`,
      ).run(
        id,
        String(b.code ?? `PRJ-${Date.now().toString().slice(-4)}`),
        String(b.name ?? 'Nouveau projet'),
        b.clientId ? String(b.clientId) : null,
        clientName,
        parseDecimalToCents(String(b.budgetHtEur ?? '0')),
        parseDecimalToCents(String(b.hourlyRateEur ?? '85')),
        new Date().toISOString(),
      );
      logAudit(req.user, 'PROJECT_CREATE', 'project', id);
      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/time-entries', requireAuth, requirePerm('projects:write'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const id = newId('tim');
    db.prepare(
      `INSERT INTO time_entries (id, project_id, user_id, user_name, work_date, minutes, description, billable, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      String(b.projectId),
      req.user!.id,
      req.user!.fullName,
      String(b.workDate ?? new Date().toISOString().slice(0, 10)),
      Number(b.minutes ?? 60),
      String(b.description ?? ''),
      b.billable === false ? 0 : 1,
      new Date().toISOString(),
    );
    res.status(201).json({ id });
  });

  router.post('/projects/:id/bill-time', requireAuth, requirePerm('billing:write'), (req: AuthedRequest, res) => {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!project || !project.client_id) {
      res.status(400).json({ error: 'Le projet doit être rattaché à un client pour générer une facture.' });
      return;
    }
    const entries = db
      .prepare('SELECT * FROM time_entries WHERE project_id = ? AND billable = 1 AND billed_document_id IS NULL')
      .all(req.params.id) as Array<Record<string, unknown>>;
    if (entries.length === 0) {
      res.status(400).json({ error: 'Aucun temps facturable en attente sur ce projet.' });
      return;
    }
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(String(project.client_id)) as Record<string, unknown>;
    const totalMinutes = entries.reduce((acc, e) => acc + Number(e.minutes), 0);
    const hoursMilli = Math.round((totalMinutes * 1000) / 60);
    const rateCents = Number(project.hourly_rate_cents);
    const totals = computeDocumentTotals([
      { quantityMilli: hoursMilli, unitPriceCents: rateCents, discountBps: 0, vatRateBps: 2000 },
    ]);
    const docId = newId('doc');
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO documents (
          id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot,
          contact_siret_snapshot, project_id, issue_date, due_date, total_ht_cents, total_vat_cents,
          total_ttc_cents, paid_cents, payment_terms, einvoice_status, provenance, created_at, updated_at
        ) VALUES (?, 'facture', 'brouillon', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Virement à 30 jours', 'a_preparer', 'factorealm', ?, ?)`,
      ).run(
        docId,
        `Temps facturé — ${project.name}`,
        String(contact.id),
        String(contact.company_name),
        `${contact.address ?? ''} ${contact.city ?? ''}`.trim(),
        String(contact.siret ?? ''),
        String(project.id),
        today,
        today,
        totals.totalHtCents,
        totals.totalVatCents,
        totals.totalTtcCents,
        now,
        now,
      );
      db.prepare(
        `INSERT INTO document_lines (id, document_id, position, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
         VALUES (?, ?, 1, ?, ?, ?, 'heure', ?, 0, 2000, ?, ?, ?)`,
      ).run(
        newId('dl'),
        docId,
        `Prestations projet ${project.code}`,
        entries.map((e) => `${e.work_date}: ${e.description}`).join(' · ').slice(0, 180),
        hoursMilli,
        rateCents,
        totals.totalHtCents,
        totals.totalVatCents,
        totals.totalTtcCents,
      );
      db.prepare('UPDATE time_entries SET billed_document_id = ? WHERE project_id = ? AND billable = 1 AND billed_document_id IS NULL').run(
        docId,
        req.params.id,
      );
    });
    logAudit(req.user, 'PROJECT_BILL_TIME', 'document', docId, `${totalMinutes} min`);
    res.status(201).json(hydrateDocument(docId));
  });

  // --- SAUVEGARDES CHIFFRÉES, AUDIT, RECHERCHE GLOBALE, DOCS API ---

  router.post('/backups/export', requireAuth, requirePerm('backups:manage'), (req: AuthedRequest, res) => {
    try {
      const passphrase = String(req.body?.passphrase ?? '');
      const envelope = createEncryptedBackup(db, uploadDir, passphrase);
      logAudit(req.user, 'BACKUP_EXPORT_ENCRYPTED', 'backup', 'main', 'Sauvegarde chiffrée AES-256-GCM');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="factorealm-backup-${new Date().toISOString().slice(0, 10)}.frbak"`);
      res.json(envelope);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/backups/restore', requireAuth, requirePerm('backups:manage'), (req: AuthedRequest, res) => {
    try {
      const { envelope, passphrase } = req.body ?? {};
      const result = restoreEncryptedBackup(db, uploadDir, envelope as EncryptedEnvelope, String(passphrase ?? ''));
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.json({ ...result, sessionsInvalidated: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/audit', requireAuth, requirePerm('audit:read'), (_req, res) => {
    res.json(db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all());
  });

  router.get('/search', requireAuth, (req: AuthedRequest, res) => {
    const q = `%${String(req.query.q ?? '').trim()}%`;
    if (q === '%%') {
      res.json({ contacts: [], documents: [], bills: [], projects: [] });
      return;
    }
    const contacts = hasPermission(req.user!.role, 'contacts:read')
      ? db
          .prepare('SELECT id, type, company_name, email FROM contacts WHERE deleted_at IS NULL AND (company_name LIKE ? OR email LIKE ? OR siret LIKE ?) LIMIT 10')
          .all(q, q, q)
      : [];
    const documents = hasPermission(req.user!.role, 'billing:read')
      ? db
          .prepare('SELECT id, kind, status, number, title, contact_name_snapshot, total_ttc_cents FROM documents WHERE deleted_at IS NULL AND (number LIKE ? OR title LIKE ? OR contact_name_snapshot LIKE ?) LIMIT 10')
          .all(q, q, q)
      : [];
    const bills = hasPermission(req.user!.role, 'purchases:read')
      ? db
          .prepare('SELECT id, supplier_name, bill_number, total_ttc_cents, status FROM supplier_bills WHERE supplier_name LIKE ? OR bill_number LIKE ? LIMIT 10')
          .all(q, q)
      : [];
    const projects = hasPermission(req.user!.role, 'projects:read')
      ? db
          .prepare('SELECT id, code, name, client_name FROM projects WHERE code LIKE ? OR name LIKE ? LIMIT 10')
          .all(q, q)
      : [];
    res.json({ contacts, documents, bills, projects });
  });

  router.get('/docs', requireAuth, (_req, res) => {
    res.json({
      service: 'Factorealm API v1',
      auth: 'Cookie HttpOnly fr_session + RBAC par rôle',
      endpoints: [
        'GET /api/v1/status',
        'POST /api/v1/setup/init',
        'POST /api/v1/auth/login',
        'GET/PUT /api/v1/company',
        'POST /api/v1/company/reset',
        'GET/POST/PUT/DELETE /api/v1/contacts',
        'GET/POST/DELETE /api/v1/catalog',
        'GET/POST/PUT /api/v1/documents',
        'POST /api/v1/documents/:id/finalize',
        'POST /api/v1/documents/:id/convert-to-invoice',
        'POST /api/v1/documents/:id/create-credit-note',
        'POST /api/v1/documents/:id/payments',
        'GET /api/v1/documents/:id/pdf',
        'GET /api/v1/documents/:id/facturx-xml',
        'GET/POST /api/v1/receipts',
        'GET/POST/PATCH /api/v1/supplier-bills',
        'GET/POST/PATCH /api/v1/expenses',
        'GET/POST /api/v1/bank-accounts',
        'POST /api/v1/bank-transactions/import-csv',
        'GET /api/v1/accounting/books',
        'GET /api/v1/accounting/vat-summary',
        'GET/POST /api/v1/accounting/entries',
        'GET /api/v1/accounting/fec',
        'POST /api/v1/backups/export',
        'POST /api/v1/backups/restore',
      ],
    });
  });

  return router;
}
