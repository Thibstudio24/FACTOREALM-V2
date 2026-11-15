import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export interface DbContext {
  db: DatabaseSync;
  dbPath: string;
  uploadDir: string;
}

const DEFAULT_PCG_ACCOUNTS: Array<[string, string, string]> = [
  ['401000', 'Fournisseurs', 'tiers'],
  ['411000', 'Clients', 'tiers'],
  ['421000', 'Personnel - Rémunérations dues', 'tiers'],
  ['445510', 'TVA à décaisser', 'tva'],
  ['445660', 'TVA déductible sur autres biens et services', 'tva'],
  ['445710', 'TVA collectée', 'tva'],
  ['512000', 'Banques', 'tresorerie'],
  ['530000', 'Caisse', 'tresorerie'],
  ['606000', 'Achats non stockés de matières et fournitures', 'charge'],
  ['613000', 'Locations', 'charge'],
  ['622000', 'Rémunérations d\'intermédiaires et honoraires', 'charge'],
  ['625000', 'Déplacements, missions et réceptions', 'charge'],
  ['627000', 'Services bancaires et assimilés', 'charge'],
  ['701000', 'Ventes de produits finis', 'produit'],
  ['706000', 'Prestations de services', 'produit'],
  ['707000', 'Ventes de marchandises', 'produit'],
];

export function initDatabase(options?: { dbPath?: string; uploadDir?: string }): DbContext {
  const dbPath = options?.dbPath ?? process.env.FACTOREALM_DB_PATH ?? path.resolve(process.cwd(), 'data/factorealm.sqlite');
  const uploadDir = options?.uploadDir ?? process.env.FACTOREALM_UPLOAD_DIR ?? path.resolve(process.cwd(), 'data/uploads');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const migrationPath = path.resolve(process.cwd(), 'migrations/001_initial_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  db.exec(sql);

  const existingMig = db
    .prepare('SELECT version FROM schema_migrations WHERE version = ?')
    .get('001_initial_schema') as { version: string } | undefined;

  if (!existingMig) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      '001_initial_schema',
      new Date().toISOString(),
    );
  }

  const insertPcg = db.prepare(
    'INSERT OR IGNORE INTO pcg_accounts (code, label, kind) VALUES (?, ?, ?)',
  );
  for (const [code, label, kind] of DEFAULT_PCG_ACCOUNTS) {
    insertPcg.run(code, label, kind);
  }

  return { db, dbPath, uploadDir };
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // noop if already rolled back
    }
    throw err;
  }
}

export function newId(prefix = ''): string {
  const raw = crypto.randomUUID();
  return prefix ? `${prefix}_${raw}` : raw;
}

export function safeUploadPath(uploadDir: string, storedName: string): string {
  const base = path.basename(storedName);
  const full = path.resolve(uploadDir, base);
  if (!full.startsWith(path.resolve(uploadDir))) {
    throw new Error('Chemin de fichier non autorisé.');
  }
  return full;
}
