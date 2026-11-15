import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { initDatabase } from './db';
import { createApiRouter } from './api';

async function createTestServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'factorealm-test-'));
  const dbPath = path.join(tmpDir, 'test.sqlite');
  const uploadDir = path.join(tmpDir, 'uploads');
  const ctx = initDatabase({ dbPath, uploadDir });
  const app = express();
  app.use(express.json({ limit: '16mb' }));
  app.use('/api/v1', createApiRouter(ctx));

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as import('node:net').AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

  return {
    baseUrl,
    ctx,
    close: async () => {
      ctx.db.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test('Parcours complet API : initialisation sans mot de passe fixe, devis -> facture -> PDF -> règlement -> FEC -> sauvegarde chiffrée/restauration', async () => {
  const srv = await createTestServer();
  let cookie = '';

  try {
    // 1. Statut initial non initialisé
    const st1 = await fetch(`${srv.baseUrl}/status`).then((r) => r.json());
    assert.equal(st1.initialized, false);

    // 2. Initialisation entreprise sans mot de passe prédéfini
    const initRes = await fetch(`${srv.baseUrl}/setup/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'Test Ingénierie SAS',
        legalForm: 'SAS',
        siret: '73282932000074',
        adminName: 'Jeanne Martin',
        adminEmail: 'jeanne@test-ing.fr',
        adminPassword: 'MotDePasseTresRobuste2026!',
      }),
    });
    assert.equal(initRes.status, 201);
    const setCookie = initRes.headers.get('set-cookie') ?? '';
    cookie = setCookie.split(';')[0];
    assert.ok(cookie.startsWith('fr_session='));
    const initBody = await initRes.json();
    assert.ok(initBody.recoveryKey.startsWith('FRK-'));

    // 3. Création client
    const clientRes = await fetch(`${srv.baseUrl}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        type: 'client',
        companyName: 'Client Alpha SARL',
        email: 'compta@alpha.fr',
        siret: '55203253400019',
        city: 'Nantes',
      }),
    }).then((r) => r.json());
    assert.ok(clientRes.id);

    // 4. Création devis brouillon puis conversion facture puis finalisation
    const quote = await fetch(`${srv.baseUrl}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        kind: 'devis',
        title: 'Prestation Conseil Q4',
        contactId: clientRes.id,
        issueDate: '2026-11-15',
        lines: [
          {
            label: 'Journée conseil architecture',
            quantity: '2',
            unit: 'jour',
            unitPriceEur: '750,00',
            discountBps: 0,
            vatRateBps: 2000,
          },
        ],
      }),
    }).then((r) => r.json());
    assert.equal(quote.status, 'brouillon');
    assert.equal(quote.totalHtCents, 150000);
    assert.equal(quote.totalTtcCents, 180000);

    const invDraft = await fetch(`${srv.baseUrl}/documents/${quote.id}/convert-to-invoice`, {
      method: 'POST',
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    assert.equal(invDraft.kind, 'facture');
    assert.equal(invDraft.status, 'brouillon');

    const finalized = await fetch(`${srv.baseUrl}/documents/${invDraft.id}/finalize`, {
      method: 'POST',
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    assert.equal(finalized.status, 'finalise');
    assert.equal(finalized.number, 'FAC-2026-0001');

    // Tentative de modification silencieuse d'une facture finalisée doit échouer
    const editAttempt = await fetch(`${srv.baseUrl}/documents/${finalized.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Triche' }),
    });
    assert.equal(editAttempt.status, 400);

    // 5. Génération PDF réelle (%PDF-)
    const pdfRes = await fetch(`${srv.baseUrl}/documents/${finalized.id}/pdf`, {
      headers: { Cookie: cookie },
    });
    assert.equal(pdfRes.status, 200);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdfBuf.subarray(0, 5).toString('utf8'), '%PDF-');

    // 6. Règlement complet
    const paidDoc = await fetch(`${srv.baseUrl}/documents/${finalized.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        amountEur: '1800,00',
        paymentDate: '2026-11-15',
        method: 'virement',
        reference: 'VIR-ALPHA-01',
      }),
    }).then((r) => r.json());
    assert.equal(paidDoc.status, 'paye');
    assert.equal(paidDoc.paidCents, 180000);

    // 7. Export FEC équilibré
    const fec = await fetch(`${srv.baseUrl}/accounting/fec`, {
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    assert.equal(fec.totalDebitCents, 180000);
    assert.equal(fec.totalCreditCents, 180000);
    assert.equal(fec.lineCount, 3);

    // 8. Sauvegarde chiffrée AES-256-GCM + Restauration + invalidation de session
    const backupEnvelope = await fetch(`${srv.baseUrl}/backups/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ passphrase: 'SauvegardeChiffree2026!' }),
    }).then((r) => r.json());
    assert.equal(backupEnvelope.format, 'FRBAK1');

    const restoreRes = await fetch(`${srv.baseUrl}/backups/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        envelope: backupEnvelope,
        passphrase: 'SauvegardeChiffree2026!',
      }),
    }).then((r) => r.json());
    assert.equal(restoreRes.sessionsInvalidated, true);

    // La session précédente doit être invalidée après restauration
    const afterRestoreMe = await fetch(`${srv.baseUrl}/auth/me`, {
      headers: { Cookie: cookie },
    });
    assert.equal(afterRestoreMe.status, 401);
  } finally {
    await srv.close();
  }
});
