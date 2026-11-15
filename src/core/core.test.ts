import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDocumentTotals,
  computeLineTotals,
  formatEurCents,
  formatFecAmount,
  isValidFrenchVatNumber,
  isValidSiret,
  parseDecimalToCents,
  parsePercentToBps,
  parseQuantityMilli,
} from './money';
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
} from './invariants';
import {
  computeTotpCode,
  decryptBufferWithPassphrase,
  encryptBufferWithPassphrase,
  generateCompanyRecoveryKey,
  generateTotpSecret,
  hashPassword,
  verifyPassword,
  verifyRecoveryKey,
  verifyTotpCode,
} from './security';

test('Calculs exacts en centimes sans erreur de flottant binaire (0.1 + 0.2)', () => {
  assert.equal(parseDecimalToCents('0,10') + parseDecimalToCents('0.20'), 30);
  assert.equal(parseDecimalToCents('1 234,56 €'), 123456);
  assert.equal(parseDecimalToCents('10.005'), 1001); // arrondi half-up explicite
  assert.equal(formatEurCents(123456), '1 234,56 €');
  assert.equal(formatFecAmount(123456), '1234,56');
});

test('Calcul de ligne et agrégation TVA française sur document', () => {
  const line = computeLineTotals({
    quantityMilli: parseQuantityMilli('1,5'),
    unitPriceCents: parseDecimalToCents('100,00'),
    discountBps: parsePercentToBps('10'),
    vatRateBps: parsePercentToBps('20'),
  });
  assert.equal(line.grossHtCents, 15000);
  assert.equal(line.discountCents, 1500);
  assert.equal(line.netHtCents, 13500);
  assert.equal(line.vatCents, 2700);
  assert.equal(line.ttcCents, 16200);

  const doc = computeDocumentTotals(
    [
      { quantityMilli: 1000, unitPriceCents: 10005, discountBps: 0, vatRateBps: 2000 },
      { quantityMilli: 1000, unitPriceCents: 10005, discountBps: 0, vatRateBps: 2000 },
    ],
    0,
    false,
  );
  // Base agrégée = 200,10 € -> TVA 20% = 40,02 €
  assert.equal(doc.totalHtCents, 20010);
  assert.equal(doc.totalVatCents, 4002);
  assert.equal(doc.totalTtcCents, 24012);
});

test('Validation SIRET Luhn et TVA intracommunautaire FR', () => {
  assert.equal(isValidSiret('73282932000074'), true);
  assert.equal(isValidSiret('73282932000075'), false);
  assert.equal(isValidFrenchVatNumber('FR40303265045'), true);
  assert.equal(isValidFrenchVatNumber('DE123456789'), false);
});

test('Invariants de cycle de vie et numérotation séquentielle', () => {
  assert.equal(formatSequentialNumber('facture', 2026, 7), 'FAC-2026-0007');
  assert.equal(canTransitionDocument('facture', 'brouillon', 'finalise'), true);
  assert.equal(canTransitionDocument('facture', 'finalise', 'brouillon'), false);
  assert.throws(() => assertDocumentEditable('facture', 'finalise'));
});

test('Partie double et génération FEC conforme LPF A.47 A-1', () => {
  assert.throws(() =>
    assertBalancedJournalEntry([
      { accountNum: '411000', debitCents: 12000, creditCents: 0 },
      { accountNum: '706000', debitCents: 0, creditCents: 10000 },
    ]),
  );

  const fec = generateFecContent([
    {
      id: 'e1',
      journalCode: 'VT',
      journalLabel: 'Ventes',
      entryNumber: 'VT-2026-0001',
      entryDate: '2026-03-15',
      pieceRef: 'FAC-2026-0001',
      pieceDate: '2026-03-15',
      status: 'validee',
      sourceType: 'facture',
      sourceId: 'd1',
      createdAt: '2026-03-15T10:00:00Z',
      lines: [
        {
          id: 'l1',
          accountNum: '411000',
          accountLabel: 'Clients',
          auxNum: 'CLI001',
          auxLabel: 'Atelier Lumière',
          label: 'Facture FAC-2026-0001',
          debitCents: 12000,
          creditCents: 0,
        },
        {
          id: 'l2',
          accountNum: '706000',
          accountLabel: 'Prestations de services',
          auxNum: '',
          auxLabel: '',
          label: 'Facture FAC-2026-0001',
          debitCents: 0,
          creditCents: 10000,
        },
        {
          id: 'l3',
          accountNum: '445710',
          accountLabel: 'TVA collectée',
          auxNum: '',
          auxLabel: '',
          label: 'Facture FAC-2026-0001',
          debitCents: 0,
          creditCents: 2000,
        },
      ],
    },
  ]);

  assert.equal(fec.lineCount, 3);
  assert.equal(fec.totalDebitCents, 12000);
  assert.equal(fec.totalCreditCents, 12000);
  assert.match(fec.content, /JournalCode\|JournalLib\|EcritureNum/);
  assert.match(fec.content, /VT\|Ventes\|VT-2026-0001\|20260315\|411000\|Clients/);
});

test('Protection CSV contre injection de formules et parsing', () => {
  assert.equal(sanitizeCsvCell('=CMD("calc")'), `"'=CMD(""calc"")"`);
  assert.equal(sanitizeCsvCell('+1+1'), "'+1+1");
  assert.equal(sanitizeCsvCell('Client; Paris'), '"Client; Paris"');

  const parsed = parseCsvText('Date;Libellé;Montant\n2026-03-01;"Virement Client";1200,50');
  assert.deepEqual(parsed.headers, ['Date', 'Libellé', 'Montant']);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0][2], '1200,50');
});

test('Détection doublon métier et RBAC', () => {
  const dup = detectBusinessDuplicateReason(
    { supplierId: 'sup1', amountCents: 4500, date: '2026-03-10', billNumber: 'F-99' },
    [{ id: 'b1', supplierId: 'sup1', amountCents: 4500, date: '2026-03-10', billNumber: 'f-99' }],
  );
  assert.ok(dup && dup.toLowerCase().includes('f-99'));
  assert.equal(hasPermission('salarie', 'billing:finalize'), false);
  assert.equal(hasPermission('comptable', 'accounting:close'), true);
});

test('Sécurité : scrypt, clé de récupération, TOTP RFC 6238 et chiffrement AES-256-GCM', () => {
  const hash = hashPassword('FactorealmTest2026!');
  assert.equal(verifyPassword('FactorealmTest2026!', hash), true);
  assert.equal(verifyPassword('MauvaisMotDePasse', hash), false);

  const rec = generateCompanyRecoveryKey();
  assert.ok(rec.plaintextKey.startsWith('FRK-'));
  assert.equal(verifyRecoveryKey(rec.plaintextKey, rec.keyHash), true);
  assert.equal(verifyRecoveryKey('FRK-INVALIDE', rec.keyHash), false);

  const secret = generateTotpSecret();
  const now = 1_770_000_000_000;
  const code = computeTotpCode(secret, now);
  assert.equal(verifyTotpCode(secret, code, now), true);
  assert.equal(verifyTotpCode(secret, '000000', now), false);

  const payload = Buffer.from(JSON.stringify({ entreprise: 'Test SAS', montant: 42000 }), 'utf8');
  const encrypted = encryptBufferWithPassphrase(payload, 'PhraseSauvegarde2026!');
  const decrypted = decryptBufferWithPassphrase(encrypted, 'PhraseSauvegarde2026!');
  assert.equal(decrypted.toString('utf8'), payload.toString('utf8'));
  assert.throws(() => decryptBufferWithPassphrase(encrypted, 'MauvaisePhrase2026!'));
});
