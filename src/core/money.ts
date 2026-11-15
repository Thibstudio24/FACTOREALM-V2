/**
 * Calculs financiers exacts en centimes d'euro (aucun flottant binaire pour les montants de référence).
 * Les taux (TVA, remise) sont exprimés en points de base (basis points, 1% = 100 bps, 20% = 2000 bps).
 */

export type Centimes = number;
export type BasisPoints = number;

const MAX_SAFE_CENTIMES = 900_000_000_000; // 9 milliards EUR max par valeur unitaire

export function assertSafeCentimes(value: number, label = 'montant'): Centimes {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_SAFE_CENTIMES) {
    throw new Error(`Montant invalide (${label}) : doit être un entier en centimes borné.`);
  }
  return value;
}

/**
 * Arrondi arithmétique explicite (half-up vers l'extérieur pour les montants positifs, symétrique).
 * numerator / denominator avec BigInt pour éviter tout débordement intermédiaire.
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) {
    throw new Error('Division par zéro dans le calcul financier.');
  }
  const sign = (numerator < 0n) !== (denominator < 0n) ? -1n : 1n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  const result = Number(sign * rounded);
  if (!Number.isSafeInteger(result)) {
    throw new Error('Débordement de capacité dans le calcul en centimes.');
  }
  return result;
}

/**
 * Parse une saisie décimale (ex: "1 234,56" ou "1234.56") en centimes exacts sans passer par float64.
 */
export function parseDecimalToCents(input: string | number): Centimes {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Nombre invalide.');
    // Conversion via chaîne fixe uniquement si entrée numérique API
    return parseDecimalToCents(input.toFixed(2));
  }
  const cleaned = input.replace(/[\s\u00A0\u202F€]/g, '').replace(',', '.').trim();
  if (!cleaned) return 0;
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    throw new Error(`Format monétaire invalide : "${input}"`);
  }
  const sign = match[1] === '-' ? -1 : 1;
  const intPart = BigInt(match[2]);
  const fracRaw = match[3] ?? '';
  const fracPadded = (fracRaw + '000').slice(0, 3);
  const twoDigits = BigInt(fracPadded.slice(0, 2));
  const thirdDigit = Number(fracPadded[2]);
  let cents = intPart * 100n + twoDigits;
  if (thirdDigit >= 5) {
    cents += 1n;
  }
  const signed = Number(BigInt(sign) * cents);
  return assertSafeCentimes(signed, input);
}

/**
 * Parse un pourcentage (ex: "20", "5.5", "20,00") en points de base (20% -> 2000).
 */
export function parsePercentToBps(input: string | number): BasisPoints {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Taux invalide.');
    return parsePercentToBps(input.toFixed(2));
  }
  const cleaned = input.replace(/[\s%]/g, '').replace(',', '.').trim();
  if (!cleaned) return 0;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    throw new Error(`Taux invalide : "${input}"`);
  }
  const intPart = Number(match[1]);
  const fracRaw = ((match[2] ?? '') + '00').slice(0, 2);
  const bps = intPart * 100 + Number(fracRaw);
  if (bps < 0 || bps > 10000) {
    throw new Error('Le taux doit être compris entre 0 % et 100 %.');
  }
  return bps;
}

/**
 * Parse une quantité (précision 3 décimales = millièmes d'unité, ex: "1.5" -> 1500).
 */
export function parseQuantityMilli(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Quantité invalide.');
    return parseQuantityMilli(input.toFixed(3));
  }
  const cleaned = input.replace(/[\s\u00A0]/g, '').replace(',', '.').trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    throw new Error(`Quantité invalide : "${input}"`);
  }
  const intPart = Number(match[1]);
  const fracRaw = ((match[2] ?? '') + '000').slice(0, 3);
  const milli = intPart * 1000 + Number(fracRaw);
  if (!Number.isSafeInteger(milli) || milli < 0) {
    throw new Error('Quantité hors bornes.');
  }
  return milli;
}

export function formatEurCents(cents: Centimes): string {
  const safe = assertSafeCentimes(cents);
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const euros = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  const eurosStr = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${eurosStr},${rem} €`;
}

export function formatFecAmount(cents: Centimes): string {
  const safe = Math.abs(assertSafeCentimes(cents));
  const euros = Math.floor(safe / 100);
  const rem = String(safe % 100).padStart(2, '0');
  return `${euros},${rem}`;
}

export function formatBpsPercent(bps: BasisPoints): string {
  const intPart = Math.floor(bps / 100);
  const dec = bps % 100;
  if (dec === 0) return `${intPart} %`;
  return `${intPart},${String(dec).padStart(2, '0').replace(/0$/, '')} %`;
}

export function formatQuantityMilli(milli: number): string {
  const intPart = Math.floor(milli / 1000);
  const dec = milli % 1000;
  if (dec === 0) return String(intPart);
  return `${intPart},${String(dec).padStart(3, '0').replace(/0+$/, '')}`;
}

export interface LineCalcInput {
  quantityMilli: number; // 1000 = 1.000
  unitPriceCents: Centimes;
  discountBps: BasisPoints; // 0..10000
  vatRateBps: BasisPoints; // 0, 210, 550, 1000, 2000
}

export interface LineCalcResult {
  grossHtCents: Centimes;
  discountCents: Centimes;
  netHtCents: Centimes;
  vatCents: Centimes;
  ttcCents: Centimes;
}

/**
 * Calcul exact d'une ligne de facturation :
 * 1. Montant brut HT = arrondi(quantité_milli * PU_centimes / 1000)
 * 2. Remise = arrondi(brut_HT * remise_bps / 10000)
 * 3. Net HT = brut_HT - remise
 * 4. TVA = arrondi(net_HT * tva_bps / 10000)
 * 5. TTC = net_HT + TVA
 */
export function computeLineTotals(line: LineCalcInput): LineCalcResult {
  const q = BigInt(line.quantityMilli);
  const pu = BigInt(assertSafeCentimes(line.unitPriceCents, 'prix unitaire'));
  const grossHtCents = divRoundHalfUp(q * pu, 1000n);
  const discountCents = divRoundHalfUp(BigInt(grossHtCents) * BigInt(line.discountBps), 10000n);
  const netHtCents = grossHtCents - discountCents;
  const vatCents = divRoundHalfUp(BigInt(netHtCents) * BigInt(line.vatRateBps), 10000n);
  const ttcCents = netHtCents + vatCents;
  return {
    grossHtCents,
    discountCents,
    netHtCents,
    vatCents,
    ttcCents,
  };
}

export interface VatBreakdownRow {
  vatRateBps: BasisPoints;
  baseHtCents: Centimes;
  vatCents: Centimes;
}

export interface DocumentTotalsResult {
  totalGrossHtCents: Centimes;
  totalLineDiscountsCents: Centimes;
  globalDiscountCents: Centimes;
  totalHtCents: Centimes;
  totalVatCents: Centimes;
  totalTtcCents: Centimes;
  vatBreakdown: VatBreakdownRow[];
}

/**
 * Calcul des totaux d'un document par agrégation des bases HT par taux de TVA
 * (règle comptable française : TVA calculée sur la base agrégée par taux après remise globale).
 */
export function computeDocumentTotals(
  lines: LineCalcInput[],
  globalDiscountBps: BasisPoints = 0,
  vatExempt = false,
): DocumentTotalsResult {
  const byRate = new Map<BasisPoints, number>();
  let totalGrossHtCents = 0;
  let totalLineDiscountsCents = 0;
  let subtotalNetHtCents = 0;

  for (const line of lines) {
    const calc = computeLineTotals({
      ...line,
      vatRateBps: vatExempt ? 0 : line.vatRateBps,
    });
    totalGrossHtCents += calc.grossHtCents;
    totalLineDiscountsCents += calc.discountCents;
    subtotalNetHtCents += calc.netHtCents;

    const rate = vatExempt ? 0 : line.vatRateBps;
    byRate.set(rate, (byRate.get(rate) ?? 0) + calc.netHtCents);
  }

  const globalDiscountCents = divRoundHalfUp(
    BigInt(subtotalNetHtCents) * BigInt(globalDiscountBps),
    10000n,
  );
  const totalHtCents = subtotalNetHtCents - globalDiscountCents;

  const vatBreakdown: VatBreakdownRow[] = [];
  let totalVatCents = 0;

  const sortedRates = Array.from(byRate.entries()).sort((a, b) => a[0] - b[0]);
  let allocatedDiscount = 0;

  sortedRates.forEach(([rate, base], idx) => {
    let adjustedBase = base;
    if (globalDiscountCents > 0 && subtotalNetHtCents > 0) {
      if (idx === sortedRates.length - 1) {
        adjustedBase = base - (globalDiscountCents - allocatedDiscount);
      } else {
        const share = divRoundHalfUp(
          BigInt(globalDiscountCents) * BigInt(base),
          BigInt(subtotalNetHtCents),
        );
        allocatedDiscount += share;
        adjustedBase = base - share;
      }
    }
    const vat = vatExempt ? 0 : divRoundHalfUp(BigInt(adjustedBase) * BigInt(rate), 10000n);
    totalVatCents += vat;
    vatBreakdown.push({
      vatRateBps: rate,
      baseHtCents: adjustedBase,
      vatCents: vat,
    });
  });

  return {
    totalGrossHtCents,
    totalLineDiscountsCents,
    globalDiscountCents,
    totalHtCents,
    totalVatCents,
    totalTtcCents: totalHtCents + totalVatCents,
    vatBreakdown,
  };
}

/**
 * Validation Luhn standard pour SIREN (9 chiffres) et SIRET (14 chiffres).
 */
export function isValidSiret(siretRaw: string): boolean {
  const siret = siretRaw.replace(/\s+/g, '');
  if (!/^\d{14}$/.test(siret)) return false;
  // Cas spécial La Poste (356000000...) mais Luhn standard pour la généralité
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = Number(siret[i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isValidFrenchVatNumber(vatRaw: string): boolean {
  const cleaned = vatRaw.replace(/\s+/g, '').toUpperCase();
  return /^FR[0-9A-Z]{2}\d{9}$/.test(cleaned);
}
