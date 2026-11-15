import type { DatabaseSync } from 'node:sqlite';
import { computeDocumentTotals } from '../core/money';
import { formatSequentialNumber } from '../core/invariants';
import { generateCompanyRecoveryKey, hashPassword } from '../core/security';
import { newId, withTransaction } from './db';

/**
 * Initialise un espace de démonstration explicitement séparé (is_demo = 1).
 * Uniquement déclenché sur action explicite de l'utilisateur lors du démarrage guidé.
 */
export function initializeDemoWorkspace(
  db: DatabaseSync,
  adminEmail: string,
  adminPassword: string,
  adminName = 'Camille Moreau',
): { recoveryKey: string; companyId: string } {
  const existing = db.prepare('SELECT COUNT(*) AS cnt FROM companies').get() as { cnt: number };
  if (existing.cnt > 0) {
    throw new Error('Une entreprise est déjà initialisée sur cette instance.');
  }

  const { plaintextKey, keyHash } = generateCompanyRecoveryKey();
  const companyId = newId('cmp');
  const now = new Date().toISOString();

  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO companies (
        id, name, legal_form, siret, vat_number, naf_code, address, postal_code, city,
        country, email, phone, iban, bic, vat_regime, default_payment_terms_days,
        accent_color, fiscal_year_start_month, recovery_key_hash, is_demo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      companyId,
      'Atelier Horizon SAS (DÉMO)',
      'SAS',
      '73282932000074',
      'FR40732829320',
      '6201Z',
      '18 rue de la République',
      '69002',
      'Lyon',
      'France',
      adminEmail.trim().toLowerCase(),
      '04 72 00 12 34',
      'FR76 3000 6000 0112 3456 7890 189',
      'AGRIFRPP',
      'reel_normal',
      30,
      '#0066FF',
      1,
      keyHash,
      now,
    );

    const adminId = newId('usr');
    db.prepare(
      `INSERT INTO users (id, email, full_name, role, password_hash, totp_enabled, require_2fa, is_active, created_at)
       VALUES (?, ?, ?, 'admin', ?, 0, 0, 1, ?)`,
    ).run(adminId, adminEmail.trim().toLowerCase(), adminName, hashPassword(adminPassword), now);

    // Contacts de démonstration
    const c1 = newId('cnt');
    const c2 = newId('cnt');
    const s1 = newId('cnt');
    db.prepare(
      `INSERT INTO contacts (id, type, company_name, contact_name, email, phone, siret, vat_number, address, postal_code, city, notes, provenance, created_at, updated_at)
       VALUES (?, 'client', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, ?)`,
    ).run(
      c1,
      'Maison Valmont Architectes',
      'Claire Valmont',
      'compta@valmont-arch.example',
      '01 42 68 55 00',
      '55203253400019',
      'FR61552032534',
      '42 avenue de l\'Opéra',
      '75002',
      'Paris',
      'Client historique — paiement à 30 jours fin de mois.',
      now,
      now,
    );
    db.prepare(
      `INSERT INTO contacts (id, type, company_name, contact_name, email, phone, siret, vat_number, address, postal_code, city, notes, provenance, created_at, updated_at)
       VALUES (?, 'client', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, ?)`,
    ).run(
      c2,
      'Coopérative Solaire du Rhône',
      'Marc Delacroix',
      'factures@solaire-rhone.example',
      '04 78 90 11 22',
      '44306184100047',
      'FR18443061841',
      '7 quai Perrache',
      '69002',
      'Lyon',
      'Projet refonte portail adhérents.',
      now,
      now,
    );
    db.prepare(
      `INSERT INTO contacts (id, type, company_name, contact_name, email, phone, siret, vat_number, address, postal_code, city, notes, provenance, created_at, updated_at)
       VALUES (?, 'fournisseur', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, ?)`,
    ).run(
      s1,
      'Hébergement Hexagone SARL',
      'Service Facturation',
      'billing@hexagone-cloud.example',
      '01 80 00 00 10',
      '81234567800019',
      'FR22812345678',
      '10 rue des Serveurs',
      '59000',
      'Lille',
      'Infrastructure et sauvegardes distantes.',
      now,
      now,
    );

    // Catalogue
    const cat1 = newId('cat');
    const cat2 = newId('cat');
    db.prepare(
      `INSERT INTO catalog_items (id, sku, name, description, kind, unit, unit_price_cents, vat_rate_bps, account_code, is_active, created_at)
       VALUES (?, ?, ?, ?, 'service', 'jour', ?, 2000, '706000', 1, ?)`,
    ).run(cat1, 'CONS-JJ', 'Accompagnement architecture logicielle', 'Audit, conception et revue technique', 85000, now);
    db.prepare(
      `INSERT INTO catalog_items (id, sku, name, description, kind, unit, unit_price_cents, vat_rate_bps, account_code, is_active, created_at)
       VALUES (?, ?, ?, ?, 'service', 'forfait', ?, 2000, '706000', 1, ?)`,
    ).run(cat2, 'MAINT-M', 'Forfait maintenance applicative', 'Mises à jour sécurité et supervision mensuelle', 48000, now);

    // Projet
    const projId = newId('prj');
    db.prepare(
      `INSERT INTO projects (id, code, name, client_id, client_name, budget_ht_cents, hourly_rate_cents, status, created_at)
       VALUES (?, 'PRJ-2026-01', 'Portail Adhérents Solaire', ?, 'Coopérative Solaire du Rhône', 1200000, 9500, 'actif', ?)`,
    ).run(projId, c2, now);
    db.prepare(
      `INSERT INTO time_entries (id, project_id, user_id, user_name, work_date, minutes, description, billable, created_at)
       VALUES (?, ?, ?, ?, '2026-11-04', 240, 'Atelier cadrage modèle de données', 1, ?)`,
    ).run(newId('tim'), projId, adminId, adminName, now);

    // Devis accepté + Facture finalisée payée + Facture finalisée en attente
    const qId = newId('doc');
    const qTotals = computeDocumentTotals([
      { quantityMilli: 5000, unitPriceCents: 85000, discountBps: 0, vatRateBps: 2000 },
    ]);
    const qNum = formatSequentialNumber('devis', 2026, 1);
    db.prepare(`INSERT INTO sequences (kind, fiscal_year, last_number) VALUES ('devis', 2026, 1)`).run();
    db.prepare(
      `INSERT INTO documents (id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot, contact_siret_snapshot, issue_date, due_date, total_ht_cents, total_vat_cents, total_ttc_cents, paid_cents, payment_terms, einvoice_status, provenance, version, finalized_at, created_at, updated_at)
       VALUES (?, 'devis', 'accepte', ?, 'Audit plateforme gestion', ?, 'Maison Valmont Architectes', '42 avenue de l''Opéra, 75002 Paris', '55203253400019', '2026-10-12', '2026-11-12', ?, ?, ?, 0, 'Validité 30 jours', 'non_applicable', 'demo', 1, ?, ?, ?)`,
    ).run(qId, qNum, c1, qTotals.totalHtCents, qTotals.totalVatCents, qTotals.totalTtcCents, now, now, now);
    db.prepare(
      `INSERT INTO document_lines (id, document_id, position, catalog_item_id, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
       VALUES (?, ?, 1, ?, 'Accompagnement architecture logicielle', 'Audit, conception et revue technique', 5000, 'jour', 85000, 0, 2000, ?, ?, ?)`,
    ).run(newId('dl'), qId, cat1, qTotals.totalHtCents, qTotals.totalVatCents, qTotals.totalTtcCents);

    const f1Id = newId('doc');
    const f1Num = formatSequentialNumber('facture', 2026, 1);
    db.prepare(`INSERT INTO sequences (kind, fiscal_year, last_number) VALUES ('facture', 2026, 2)`).run();
    db.prepare(
      `INSERT INTO documents (id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot, contact_siret_snapshot, source_quote_id, issue_date, due_date, total_ht_cents, total_vat_cents, total_ttc_cents, paid_cents, payment_terms, einvoice_status, provenance, version, finalized_at, created_at, updated_at)
       VALUES (?, 'facture', 'paye', ?, 'Audit plateforme gestion', ?, 'Maison Valmont Architectes', '42 avenue de l''Opéra, 75002 Paris', '55203253400019', ?, '2026-10-18', '2026-11-17', ?, ?, ?, ?, 'Virement à 30 jours', 'facturx_genere', 'demo', 1, ?, ?, ?)`,
    ).run(f1Id, f1Num, c1, qId, qTotals.totalHtCents, qTotals.totalVatCents, qTotals.totalTtcCents, qTotals.totalTtcCents, now, now, now);
    db.prepare(
      `INSERT INTO document_lines (id, document_id, position, catalog_item_id, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
       VALUES (?, ?, 1, ?, 'Accompagnement architecture logicielle', 'Audit, conception et revue technique', 5000, 'jour', 85000, 0, 2000, ?, ?, ?)`,
    ).run(newId('dl'), f1Id, cat1, qTotals.totalHtCents, qTotals.totalVatCents, qTotals.totalTtcCents);

    // Banque & règlement
    const bankId = newId('bnk');
    db.prepare(
      `INSERT INTO bank_accounts (id, name, kind, iban, initial_balance_cents, created_at)
       VALUES (?, 'Compte Courant Pro', 'banque', 'FR76 3000 6000 0112 3456 7890 189', 1450000, ?)`,
    ).run(bankId, now);
    db.prepare(
      `INSERT INTO payments (id, document_id, amount_cents, payment_date, method, reference, bank_account_id, notes, created_at)
       VALUES (?, ?, ?, '2026-10-28', 'virement', 'VIR-VALMONT-1028', ?, 'Règlement intégral', ?)`,
    ).run(newId('pay'), f1Id, qTotals.totalTtcCents, bankId, now);
    db.prepare(
      `INSERT INTO bank_transactions (id, bank_account_id, tx_date, label, amount_cents, category, reconciled_entity_type, reconciled_entity_id, created_at)
       VALUES (?, ?, '2026-10-28', 'VIR MAISON VALMONT FAC-2026-0001', ?, 'Ventes prestations', 'facture', ?, ?)`,
    ).run(newId('btx'), bankId, qTotals.totalTtcCents, f1Id, now);

    // Facture en attente
    const f2Id = newId('doc');
    const f2Num = formatSequentialNumber('facture', 2026, 2);
    const f2Totals = computeDocumentTotals([
      { quantityMilli: 3000, unitPriceCents: 48000, discountBps: 0, vatRateBps: 2000 },
    ]);
    db.prepare(
      `INSERT INTO documents (id, kind, status, number, title, contact_id, contact_name_snapshot, contact_address_snapshot, contact_siret_snapshot, project_id, issue_date, due_date, total_ht_cents, total_vat_cents, total_ttc_cents, paid_cents, payment_terms, einvoice_status, provenance, version, finalized_at, created_at, updated_at)
       VALUES (?, 'facture', 'finalise', ?, 'Maintenance T4 2026', ?, 'Coopérative Solaire du Rhône', '7 quai Perrache, 69002 Lyon', '44306184100047', ?, '2026-11-02', '2026-12-02', ?, ?, ?, 0, 'Virement à 30 jours', 'a_preparer', 'demo', 1, ?, ?, ?)`,
    ).run(f2Id, f2Num, c2, projId, f2Totals.totalHtCents, f2Totals.totalVatCents, f2Totals.totalTtcCents, now, now, now);
    db.prepare(
      `INSERT INTO document_lines (id, document_id, position, catalog_item_id, label, description, quantity_milli, unit, unit_price_cents, discount_bps, vat_rate_bps, net_ht_cents, vat_cents, ttc_cents)
       VALUES (?, ?, 1, ?, 'Forfait maintenance applicative', 'Trimestre 4 2026', 3000, 'forfait', 48000, 0, 2000, ?, ?, ?)`,
    ).run(newId('dl'), f2Id, cat2, f2Totals.totalHtCents, f2Totals.totalVatCents, f2Totals.totalTtcCents);

    // Facture fournisseur + écriture comptable équilibrée
    db.prepare(
      `INSERT INTO supplier_bills (id, supplier_id, supplier_name, bill_number, issue_date, due_date, category, account_code, total_ht_cents, total_vat_cents, total_ttc_cents, status, tags, notes, created_at)
       VALUES (?, ?, 'Hébergement Hexagone SARL', 'HEX-2026-1104', '2026-11-01', '2026-11-30', 'Hébergement & infrastructure', '613000', 24000, 4800, 28800, 'a_payer', 'cloud,infra', 'Serveur dédié novembre', ?)`,
    ).run(newId('bill'), s1, now);

    const jeId = newId('je');
    db.prepare(
      `INSERT INTO journal_entries (id, journal_code, journal_label, entry_number, entry_date, piece_ref, piece_date, status, source_type, source_id, created_at)
       VALUES (?, 'VT', 'Ventes', 'VT-2026-0001', '2026-10-18', ?, '2026-10-18', 'validee', 'facture', ?, ?)`,
    ).run(jeId, f1Num, f1Id, now);
    db.prepare(
      `INSERT INTO journal_lines (id, entry_id, account_num, account_label, aux_num, aux_label, label, debit_cents, credit_cents)
       VALUES (?, ?, '411000', 'Clients', 'CLI-VALMONT', 'Maison Valmont Architectes', ?, ?, 0)`,
    ).run(newId('jl'), jeId, `Facture ${f1Num}`, qTotals.totalTtcCents);
    db.prepare(
      `INSERT INTO journal_lines (id, entry_id, account_num, account_label, aux_num, aux_label, label, debit_cents, credit_cents)
       VALUES (?, ?, '706000', 'Prestations de services', '', '', ?, 0, ?)`,
    ).run(newId('jl'), jeId, `Facture ${f1Num}`, qTotals.totalHtCents);
    db.prepare(
      `INSERT INTO journal_lines (id, entry_id, account_num, account_label, aux_num, aux_label, label, debit_cents, credit_cents)
       VALUES (?, ?, '445710', 'TVA collectée', '', '', ?, 0, ?)`,
    ).run(newId('jl'), jeId, `TVA ${f1Num}`, qTotals.totalVatCents);

    // Prévision trésorerie explicite
    db.prepare(
      `INSERT INTO forecast_assumptions (id, label, kind, monthly_cents, confidence, hypothesis_note)
       VALUES (?, 'Renouvellements maintenance T1', 'encaissement', 180000, 'haute', 'Hypothèse basée sur 3 contrats actifs reconduits')`,
    ).run(newId('fct'));
    db.prepare(
      `INSERT INTO forecast_assumptions (id, label, kind, monthly_cents, confidence, hypothesis_note)
       VALUES (?, 'Charges infrastructure & logiciels', 'decaissement', 45000, 'haute', 'Abonnements serveur et outils hors TVA')`,
    ).run(newId('fct'));

    db.prepare(
      `INSERT INTO audit_logs (id, actor_user_id, actor_name, action, entity_type, entity_id, detail, created_at)
       VALUES (?, ?, ?, 'SETUP_DEMO_INIT', 'company', ?, 'Initialisation explicite du jeu de démonstration séparé', ?)`,
    ).run(newId('aud'), adminId, adminName, companyId, now);
  });

  return { recoveryKey: plaintextKey, companyId };
}
