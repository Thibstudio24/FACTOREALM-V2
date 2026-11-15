import { formatFecAmount } from './money';
import type {
  DocumentKind,
  DocumentStatus,
  JournalEntry,
  Permission,
  RoleCode,
} from './types';

export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  admin: [
    'company:write',
    'users:manage',
    'contacts:read',
    'contacts:write',
    'billing:read',
    'billing:write',
    'billing:finalize',
    'purchases:read',
    'purchases:write',
    'expenses:create',
    'expenses:approve',
    'treasury:read',
    'treasury:write',
    'accounting:read',
    'accounting:write',
    'accounting:close',
    'projects:read',
    'projects:write',
    'backups:manage',
    'export:full',
    'audit:read',
    'tickets:read',
    'tickets:create',
    'tickets:manage',
    'rgpd:manage',
  ],
  gestionnaire: [
    'contacts:read',
    'contacts:write',
    'billing:read',
    'billing:write',
    'billing:finalize',
    'purchases:read',
    'purchases:write',
    'expenses:create',
    'expenses:approve',
    'treasury:read',
    'treasury:write',
    'accounting:read',
    'projects:read',
    'projects:write',
    'tickets:read',
    'tickets:create',
    'tickets:manage',
  ],
  salarie: [
    'contacts:read',
    'billing:read',
    'expenses:create',
    'projects:read',
    'projects:write',
    'tickets:read',
    'tickets:create',
  ],
  comptable: [
    'contacts:read',
    'billing:read',
    'purchases:read',
    'treasury:read',
    'accounting:read',
    'accounting:write',
    'accounting:close',
    'audit:read',
    'tickets:read',
    'tickets:create',
  ],
};

export function hasPermission(role: RoleCode, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Formatage des numéros définitifs séquentiels par exercice (sans trous après finalisation).
 */
export function formatSequentialNumber(
  kind: DocumentKind,
  year: number,
  seq: number,
): string {
  const prefixMap: Record<DocumentKind, string> = {
    devis: 'DEV',
    facture: 'FAC',
    acompte: 'ACP',
    avoir: 'AVR',
  };
  return `${prefixMap[kind]}-${year}-${String(seq).padStart(4, '0')}`;
}

/**
 * Transitions autorisées sur le cycle de vie d'un document commercial.
 * Une facture/acompte/avoir finalisé ne peut JAMAIS redevenir brouillon ni être modifié silencieusement.
 */
export function assertDocumentEditable(kind: DocumentKind, status: DocumentStatus): void {
  if (status !== 'brouillon') {
    throw new Error(
      `Document verrouillé (${kind}, statut "${status}") : aucune modification silencieuse n'est autorisée après validation/finalisation.`,
    );
  }
}

export function canTransitionDocument(
  kind: DocumentKind,
  from: DocumentStatus,
  to: DocumentStatus,
): boolean {
  if (kind === 'devis') {
    const allowed: Record<DocumentStatus, DocumentStatus[]> = {
      brouillon: ['envoye', 'accepte', 'refuse', 'annule'],
      envoye: ['accepte', 'refuse', 'annule'],
      accepte: [],
      refuse: [],
      finalise: [],
      paye_partiel: [],
      paye: [],
      annule: [],
    };
    return allowed[from]?.includes(to) ?? false;
  }
  const allowedInvoice: Record<DocumentStatus, DocumentStatus[]> = {
    brouillon: ['finalise', 'annule'],
    envoye: [],
    accepte: [],
    refuse: [],
    finalise: ['paye_partiel', 'paye'],
    paye_partiel: ['paye'],
    paye: [],
    annule: [],
  };
  return allowedInvoice[from]?.includes(to) ?? false;
}

/**
 * Vérification d'équilibre strict de partie double (Débit == Crédit).
 */
export function assertBalancedJournalEntry(
  lines: Array<{ debitCents: number; creditCents: number; accountNum: string }>,
): { totalDebitCents: number; totalCreditCents: number } {
  if (lines.length < 2) {
    throw new Error('Une écriture en partie double requiert au moins 2 lignes.');
  }
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  for (const line of lines) {
    if (!line.accountNum.trim()) {
      throw new Error('Chaque ligne comptable doit indiquer un numéro de compte.');
    }
    if (line.debitCents < 0 || line.creditCents < 0) {
      throw new Error('Les montants débit/crédit doivent être positifs ou nuls.');
    }
    if (line.debitCents > 0 && line.creditCents > 0) {
      throw new Error('Une ligne comptable ne peut pas porter simultanément un débit et un crédit.');
    }
    if (line.debitCents === 0 && line.creditCents === 0) {
      throw new Error('Une ligne comptable ne peut pas être entièrement nulle.');
    }
    totalDebitCents += line.debitCents;
    totalCreditCents += line.creditCents;
  }
  if (totalDebitCents !== totalCreditCents) {
    throw new Error(
      `Écriture déséquilibrée : Débit (${totalDebitCents} cts) != Crédit (${totalCreditCents} cts).`,
    );
  }
  return { totalDebitCents, totalCreditCents };
}

/**
 * Protection CSV contre l'injection de formules (Excel / LibreOffice Calc).
 */
export function sanitizeCsvCell(raw: string | number | null | undefined): string {
  const str = raw === null || raw === undefined ? '' : String(raw);
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[;"\n\r,]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function formatFecDate(isoDate: string): string {
  const cleaned = isoDate.slice(0, 10).replace(/-/g, '');
  if (!/^\d{8}$/.test(cleaned)) {
    throw new Error(`Date FEC invalide : "${isoDate}"`);
  }
  return cleaned;
}

export const FEC_HEADER = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
].join('|');

/**
 * Génération d'un export FEC tabulé par `|` conforme à la structure Article A.47 A-1 du LPF.
 * Ne constitue pas une certification fiscale sans revue par un expert-comptable.
 */
export function generateFecContent(entries: JournalEntry[]): {
  content: string;
  lineCount: number;
  totalDebitCents: number;
  totalCreditCents: number;
} {
  const rows: string[] = [FEC_HEADER];
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const entry of entries) {
    if (entry.status !== 'validee') continue;
    assertBalancedJournalEntry(entry.lines);
    const eDate = formatFecDate(entry.entryDate);
    const pDate = formatFecDate(entry.pieceDate);

    for (const line of entry.lines) {
      totalDebitCents += line.debitCents;
      totalCreditCents += line.creditCents;
      const cleanPipe = (v: string) => v.replace(/\|/g, ' ').replace(/[\r\n]+/g, ' ').trim();
      rows.push(
        [
          cleanPipe(entry.journalCode),
          cleanPipe(entry.journalLabel),
          cleanPipe(entry.entryNumber),
          eDate,
          cleanPipe(line.accountNum),
          cleanPipe(line.accountLabel),
          cleanPipe(line.auxNum),
          cleanPipe(line.auxLabel),
          cleanPipe(entry.pieceRef),
          pDate,
          cleanPipe(line.label),
          formatFecAmount(line.debitCents),
          formatFecAmount(line.creditCents),
          '',
          '',
          eDate,
          '',
          'EUR',
        ].join('|'),
      );
    }
  }

  return {
    content: rows.join('\n') + '\n',
    lineCount: rows.length - 1,
    totalDebitCents,
    totalCreditCents,
  };
}

/**
 * Parseur CSV RFC-4180 tolérant `;` ou `,` avec détection de délimiteur.
 */
export function parseCsvText(csvText: string): { headers: string[]; rows: string[][] } {
  const normalized = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return { headers: [], rows: [] };
  const firstLine = normalized.split('\n')[0] ?? '';
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semicolonCount >= commaCount ? ';' : ',';

  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"' && normalized[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) records.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) records.push(row);

  if (records.length === 0) return { headers: [], rows: [] };
  return {
    headers: records[0],
    rows: records.slice(1),
  };
}

/**
 * Détection de doublon métier pour factures fournisseurs / justificatifs.
 */
export function detectBusinessDuplicateReason(
  candidate: { supplierId: string | null; amountCents: number; date: string; billNumber?: string },
  existing: Array<{ id: string; supplierId: string | null; amountCents: number; date: string; billNumber?: string }>,
): string | null {
  for (const item of existing) {
    if (
      candidate.billNumber &&
      item.billNumber &&
      candidate.supplierId &&
      candidate.supplierId === item.supplierId &&
      candidate.billNumber.trim().toLowerCase() === item.billNumber.trim().toLowerCase()
    ) {
      return `Même numéro de pièce (${item.billNumber}) pour ce fournisseur.`;
    }
    if (
      candidate.supplierId &&
      item.supplierId === candidate.supplierId &&
      candidate.amountCents === item.amountCents &&
      candidate.date === item.date
    ) {
      return `Suspicion métier : même fournisseur, même montant et même date (${item.date}).`;
    }
  }
  return null;
}
