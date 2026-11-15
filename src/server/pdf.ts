import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { CommercialDocument, CompanyProfile, ExpenseReport } from '../core/types';
import { formatBpsPercent, formatEurCents, formatQuantityMilli } from '../core/money';

function sanitizePdfText(input: string): string {
  // WinAnsi (StandardFonts Helvetica) : remplacer caractères hors plage par équivalents sûrs
  return input
    .replace(/\u202F|\u00A0/g, ' ')
    .replace(/€/g, 'EUR')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[^\x20-\xFF]/g, '?');
}

const KIND_LABELS: Record<CommercialDocument['kind'], string> = {
  devis: 'DEVIS',
  facture: 'FACTURE',
  acompte: "FACTURE D'ACOMPTE",
  avoir: 'AVOIR',
};

export async function generateCommercialDocumentPdf(
  docData: CommercialDocument,
  company: CompanyProfile,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(0.03, 0.11, 0.23);
  const blue = rgb(0.0, 0.4, 1.0);
  const slate = rgb(0.35, 0.42, 0.52);
  const lineGray = rgb(0.86, 0.89, 0.93);

  let y = 795;

  // En-tête entreprise
  page.drawText(sanitizePdfText(company.name), {
    x: 42,
    y,
    size: 16,
    font: fontBold,
    color: navy,
  });

  const docTitle = `${KIND_LABELS[docData.kind]} ${docData.number ?? 'BROUILLON'}`;
  page.drawText(sanitizePdfText(docTitle), {
    x: 340,
    y,
    size: 15,
    font: fontBold,
    color: blue,
  });

  y -= 16;
  const companyMeta = [
    `${company.legalForm} · SIRET ${company.siret || 'Non renseigné'}`,
    company.vatNumber ? `TVA ${company.vatNumber}` : '',
    `${company.address} ${company.postalCode} ${company.city}`.trim(),
    `${company.email} ${company.phone}`.trim(),
  ].filter(Boolean);

  for (const row of companyMeta) {
    page.drawText(sanitizePdfText(row), { x: 42, y, size: 8.5, font: fontRegular, color: slate });
    y -= 12;
  }

  // Bloc dates + client
  let yRight = 779;
  const rightMeta = [
    `Date d'émission : ${docData.issueDate}`,
    docData.dueDate ? `Échéance : ${docData.dueDate}` : '',
    `Statut : ${docData.status.toUpperCase()}`,
  ].filter(Boolean);
  for (const row of rightMeta) {
    page.drawText(sanitizePdfText(row), { x: 340, y: yRight, size: 9, font: fontRegular, color: navy });
    yRight -= 13;
  }

  y = Math.min(y, yRight) - 14;
  page.drawLine({ start: { x: 42, y }, end: { x: 553, y }, thickness: 1, color: lineGray });
  y -= 18;

  // Client destinataire
  page.drawText('DESTINATAIRE', { x: 340, y, size: 8, font: fontBold, color: slate });
  if (docData.title) {
    page.drawText(sanitizePdfText(docData.title), { x: 42, y, size: 11, font: fontBold, color: navy });
  }
  y -= 14;
  page.drawText(sanitizePdfText(docData.contactNameSnapshot), {
    x: 340,
    y,
    size: 10.5,
    font: fontBold,
    color: navy,
  });
  y -= 13;
  if (docData.contactAddressSnapshot) {
    page.drawText(sanitizePdfText(docData.contactAddressSnapshot), {
      x: 340,
      y,
      size: 8.5,
      font: fontRegular,
      color: slate,
    });
    y -= 12;
  }
  if (docData.contactSiretSnapshot) {
    page.drawText(sanitizePdfText(`SIRET : ${docData.contactSiretSnapshot}`), {
      x: 340,
      y,
      size: 8.5,
      font: fontRegular,
      color: slate,
    });
    y -= 12;
  }

  y -= 18;

  // Tableau des lignes
  page.drawRectangle({ x: 42, y: y - 4, width: 511, height: 20, color: navy });
  page.drawText('Désignation', { x: 48, y: y + 2, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Qté', { x: 300, y: y + 2, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('PU HT', { x: 345, y: y + 2, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('TVA', { x: 420, y: y + 2, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Total HT', { x: 480, y: y + 2, size: 8.5, font: fontBold, color: rgb(1, 1, 1) });
  y -= 22;

  for (const line of docData.lines) {
    if (y < 150) break; // Garde-fou simple sur 1ère page
    page.drawText(sanitizePdfText(line.label.slice(0, 48)), {
      x: 48,
      y,
      size: 9,
      font: fontBold,
      color: navy,
    });
    page.drawText(sanitizePdfText(formatQuantityMilli(line.quantityMilli)), {
      x: 300,
      y,
      size: 9,
      font: fontRegular,
      color: navy,
    });
    page.drawText(sanitizePdfText(formatEurCents(line.unitPriceCents)), {
      x: 345,
      y,
      size: 9,
      font: fontRegular,
      color: navy,
    });
    page.drawText(sanitizePdfText(formatBpsPercent(line.vatRateBps)), {
      x: 420,
      y,
      size: 9,
      font: fontRegular,
      color: navy,
    });
    page.drawText(sanitizePdfText(formatEurCents(line.netHtCents)), {
      x: 480,
      y,
      size: 9,
      font: fontBold,
      color: navy,
    });
    y -= 13;
    if (line.description) {
      page.drawText(sanitizePdfText(line.description.slice(0, 72)), {
        x: 48,
        y,
        size: 8,
        font: fontRegular,
        color: slate,
      });
      y -= 12;
    }
    page.drawLine({ start: { x: 42, y: y + 4 }, end: { x: 553, y: y + 4 }, thickness: 0.5, color: lineGray });
    y -= 6;
  }

  // Totaux
  y -= 10;
  page.drawLine({ start: { x: 330, y }, end: { x: 553, y }, thickness: 1, color: lineGray });
  y -= 16;
  page.drawText('Total HT', { x: 340, y, size: 9.5, font: fontRegular, color: slate });
  page.drawText(sanitizePdfText(formatEurCents(docData.totalHtCents)), {
    x: 465,
    y,
    size: 9.5,
    font: fontBold,
    color: navy,
  });
  y -= 15;
  page.drawText('Total TVA', { x: 340, y, size: 9.5, font: fontRegular, color: slate });
  page.drawText(sanitizePdfText(formatEurCents(docData.totalVatCents)), {
    x: 465,
    y,
    size: 9.5,
    font: fontBold,
    color: navy,
  });
  y -= 18;
  page.drawRectangle({ x: 330, y: y - 5, width: 223, height: 22, color: rgb(0.94, 0.96, 1) });
  page.drawText('NET A PAYER TTC', { x: 340, y: y + 2, size: 10, font: fontBold, color: blue });
  page.drawText(sanitizePdfText(formatEurCents(docData.totalTtcCents)), {
    x: 465,
    y: y + 2,
    size: 10.5,
    font: fontBold,
    color: navy,
  });

  // Mentions légales en pied de page
  const footerLines = [
    `Conditions de règlement : ${docData.paymentTerms}`,
    company.iban ? `IBAN : ${company.iban}  ·  BIC : ${company.bic}` : '',
    docData.vatExempt ? 'TVA non applicable, art. 293 B du CGI.' : '',
    company.latePenaltyText,
  ].filter(Boolean);

  let fy = 82;
  for (const line of footerLines) {
    page.drawText(sanitizePdfText(line.slice(0, 105)), {
      x: 42,
      y: fy,
      size: 7.5,
      font: fontRegular,
      color: slate,
    });
    fy -= 11;
  }

  return pdf.save();
}

export async function generateExpensePdf(
  expense: ExpenseReport,
  company: CompanyProfile,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.03, 0.11, 0.23);

  page.drawText(sanitizePdfText(`${company.name} — NOTE DE FRAIS`), {
    x: 42,
    y: 780,
    size: 15,
    font: fontBold,
    color: navy,
  });

  const rows = [
    `Collaborateur : ${expense.userName}`,
    `Intitulé : ${expense.title}`,
    `Date de dépense : ${expense.expenseDate}`,
    `Catégorie : ${expense.category}`,
    `Statut : ${expense.status.toUpperCase()}`,
    `Montant HT : ${formatEurCents(expense.amountHtCents)}`,
    `TVA : ${formatEurCents(expense.vatCents)}`,
    `Total TTC : ${formatEurCents(expense.amountTtcCents)}`,
    expense.reviewNote ? `Commentaire validation : ${expense.reviewNote}` : '',
  ].filter(Boolean);

  let y = 740;
  for (const r of rows) {
    page.drawText(sanitizePdfText(r), { x: 42, y, size: 10.5, font: fontRegular, color: navy });
    y -= 20;
  }

  return pdf.save();
}
