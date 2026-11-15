import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { DatabaseSync } from 'node:sqlite';
import {
  decryptBufferWithPassphrase,
  encryptBufferWithPassphrase,
  sha256Hex,
  type EncryptedEnvelope,
} from '../core/security';
import { safeUploadPath, withTransaction } from './db';

const BACKUP_TABLES = [
  'companies',
  'users',
  'contacts',
  'catalog_items',
  'sequences',
  'documents',
  'document_lines',
  'document_versions',
  'payments',
  'reminders',
  'receipts',
  'supplier_bills',
  'expense_reports',
  'bank_accounts',
  'bank_transactions',
  'bank_rules',
  'forecast_assumptions',
  'pcg_accounts',
  'accounting_periods',
  'journal_entries',
  'journal_lines',
  'projects',
  'time_entries',
  'audit_logs',
] as const;

interface BackupBundlePayload {
  schemaVersion: string;
  exportedAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
  files: Array<{
    name: string;
    sha256: string;
    contentB64: string;
  }>;
}

export function createEncryptedBackup(
  db: DatabaseSync,
  uploadDir: string,
  passphrase: string,
): EncryptedEnvelope {
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
  }

  const files: BackupBundlePayload['files'] = [];
  if (fs.existsSync(uploadDir)) {
    for (const entry of fs.readdirSync(uploadDir)) {
      const fullPath = path.join(uploadDir, entry);
      if (fs.statSync(fullPath).isFile()) {
        const raw = fs.readFileSync(fullPath);
        files.push({
          name: entry,
          sha256: sha256Hex(raw),
          contentB64: raw.toString('base64'),
        });
      }
    }
  }

  const payload: BackupBundlePayload = {
    schemaVersion: '001_initial_schema',
    exportedAt: new Date().toISOString(),
    tables,
    files,
  };

  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  return encryptBufferWithPassphrase(compressed, passphrase);
}

export function restoreEncryptedBackup(
  db: DatabaseSync,
  uploadDir: string,
  envelope: EncryptedEnvelope,
  passphrase: string,
): { restoredTables: number; restoredFiles: number; exportedAt: string } {
  const compressed = decryptBufferWithPassphrase(envelope, passphrase);
  const rawJson = zlib.gunzipSync(compressed).toString('utf8');
  const payload = JSON.parse(rawJson) as BackupBundlePayload;

  if (!payload.tables || !Array.isArray(payload.files)) {
    throw new Error('Contenu de sauvegarde corrompu ou incomplet.');
  }

  // Vérifier l'intégrité SHA-256 de chaque fichier avant toute écriture
  for (const file of payload.files) {
    const buf = Buffer.from(file.contentB64, 'base64');
    if (sha256Hex(buf) !== file.sha256) {
      throw new Error(`Intégrité compromise pour le fichier "${file.name}".`);
    }
  }

  withTransaction(db, () => {
    db.exec('PRAGMA foreign_keys = OFF;');
    try {
      // Invalider toutes les sessions actives lors d'une restauration
      db.exec('DELETE FROM sessions;');

      for (const table of [...BACKUP_TABLES].reverse()) {
        db.exec(`DELETE FROM ${table};`);
      }

      for (const table of BACKUP_TABLES) {
        const rows = payload.tables[table] ?? [];
        if (rows.length === 0) continue;
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const stmt = db.prepare(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
        );
        for (const row of rows) {
          const vals = columns.map((c) => {
            const v = row[c];
            return v === undefined ? null : (v as string | number | null);
          });
          stmt.run(...vals);
        }
      }
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  });

  fs.mkdirSync(uploadDir, { recursive: true });
  for (const file of payload.files) {
    const target = safeUploadPath(uploadDir, file.name);
    fs.writeFileSync(target, Buffer.from(file.contentB64, 'base64'));
  }

  return {
    restoredTables: Object.keys(payload.tables).length,
    restoredFiles: payload.files.length,
    exportedAt: payload.exportedAt,
  };
}
