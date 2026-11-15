import type { DatabaseSync } from 'node:sqlite';
import { isValidFrenchVatNumber, isValidSiret } from '../core/money';
import { generateCompanyRecoveryKey, hashPassword } from '../core/security';
import { newId, withTransaction } from './db';

export interface InitializeCompanyInput {
  companyName: string;
  legalForm?: string;
  siret?: string;
  vatNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  vatRegime?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface InitializeCompanyResult {
  companyId: string;
  userId: string;
  recoveryKey: string;
  companyName: string;
  adminEmail: string;
}

export function initializeCompanyInDb(
  db: DatabaseSync,
  input: InitializeCompanyInput,
): InitializeCompanyResult {
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM companies').get() as { cnt: number };
  if (existing.cnt > 0) {
    throw new Error('Instance déjà initialisée.');
  }

  const companyName = String(input.companyName ?? '').trim();
  const adminName = String(input.adminName ?? '').trim();
  const adminEmail = String(input.adminEmail ?? '').trim().toLowerCase();
  const adminPassword = String(input.adminPassword ?? '');
  const siret = String(input.siret ?? '').replace(/\s+/g, '');
  const vatNumber = String(input.vatNumber ?? '').replace(/\s+/g, '').toUpperCase();

  if (!companyName || !adminName || !adminEmail || !adminPassword) {
    throw new Error('Tous les champs obligatoires doivent être renseignés.');
  }
  if (!adminEmail.includes('@')) {
    throw new Error('Courriel administrateur invalide.');
  }
  if (siret && !isValidSiret(siret)) {
    throw new Error('Numéro SIRET invalide (14 chiffres et contrôle Luhn requis).');
  }
  if (vatNumber && !isValidFrenchVatNumber(vatNumber)) {
    throw new Error('Numéro de TVA intracommunautaire FR invalide.');
  }

  const { plaintextKey, keyHash } = generateCompanyRecoveryKey();
  const companyId = newId('cmp');
  const userId = newId('usr');
  const now = new Date().toISOString();
  const pwHash = hashPassword(adminPassword);

  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO companies (
        id, name, legal_form, siret, vat_number, address, postal_code, city, email,
        vat_regime, recovery_key_hash, is_demo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      companyId,
      companyName,
      String(input.legalForm ?? 'SAS'),
      siret,
      vatNumber,
      String(input.address ?? '').trim(),
      String(input.postalCode ?? '').trim(),
      String(input.city ?? '').trim(),
      adminEmail,
      String(input.vatRegime ?? 'reel_normal'),
      keyHash,
      now,
    );

    db.prepare(
      `INSERT INTO users (id, email, full_name, role, password_hash, totp_enabled, is_active, created_at)
       VALUES (?, ?, ?, 'admin', ?, 0, 1, ?)`,
    ).run(userId, adminEmail, adminName, pwHash, now);

    db.prepare(
      `INSERT INTO bank_accounts (id, name, kind, iban, initial_balance_cents, created_at)
       VALUES (?, 'Compte courant principal', 'banque', '', 0, ?)`,
    ).run(newId('bnk'), now);

    db.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, actor_name, action, entity_type, entity_id, detail, created_at)
       VALUES (?, ?, ?, 'SETUP_INIT', 'company', ?, ?, ?)`,
    ).run(
      newId('aud'),
      userId,
      adminName,
      companyId,
      'Initialisation de l\'entreprise sans mot de passe prédéfini',
      now,
    );
  });

  return {
    companyId,
    userId,
    recoveryKey: plaintextKey,
    companyName,
    adminEmail,
  };
}
