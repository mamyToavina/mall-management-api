const fs = require('fs');
const pdfParse = require('pdf-parse');

const normalizeText = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parseAmount = (raw) => {
  if (!raw) return NaN;

  let cleaned = String(raw).trim().replace(/\s+/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    // Le dernier separateur est considere comme separateur decimal
    if (lastDot > lastComma) {
      // Exemple: 97,414.04 => ',' millier, '.' decimal
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Exemple: 97.414,04 => '.' millier, ',' decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    const last = parts[parts.length - 1];
    // Si 3 chiffres apres la virgule, on l'interprete comme separateur de millier
    if (last.length === 3) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  } else if (hasDot) {
    const parts = cleaned.split('.');
    const last = parts[parts.length - 1];
    // Si 3 chiffres apres le point, on l'interprete comme separateur de millier
    if (last.length === 3) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  return Number(cleaned);
};

const extractInvoiceDataFromText = (text) => {
  const normalized = normalizeText(text);

  const markerRegex = /N[^A-Z0-9]?\s*Compteur\s*electricite\s*:/i;
  const markerMatch = markerRegex.exec(normalized);

  let meterNumber = null;
  if (markerMatch) {
    const afterMarker = normalized.slice(markerMatch.index + markerMatch[0].length).trim();
    const firstChunk = afterMarker.slice(0, 200);

    const stopWords = ['Tarif', 'PS', 'Puissance', 'Abonne', 'Adresse', 'Client'];
    let meterChunk = firstChunk;
    for (const word of stopWords) {
      const idx = meterChunk.toLowerCase().indexOf(word.toLowerCase());
      if (idx > 0) {
        meterChunk = meterChunk.slice(0, idx);
        break;
      }
    }

    const tokenMatch = meterChunk.match(/[A-Za-z0-9]{6,}/);
    if (tokenMatch) {
      meterNumber = tokenMatch[0].trim();
    }
  }

  const strictAmountRegex = /NET\s*A\s*PAYER\s*:?\s*:?\s*\(5\)\s*-\s*\(6\)\s*:?\s*([0-9][0-9\s.,]*)/i;
  const fallbackAmountRegex = /NET\s*A\s*PAYER[^0-9]*([0-9][0-9\s.,]*)/i;

  const amountMatch = normalized.match(strictAmountRegex) || normalized.match(fallbackAmountRegex);
  const netAmount = parseAmount(amountMatch ? amountMatch[1] : null);

  if (!meterNumber) {
    throw new Error('Numero de compteur non trouve dans le PDF');
  }

  if (Number.isNaN(netAmount)) {
    throw new Error('Montant NET A PAYER non trouve dans le PDF');
  }

  return { meterNumber, netAmount };
};

const extractInvoiceDataFromPdf = async (pdfPath) => {
  const buffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(buffer);
  return extractInvoiceDataFromText(parsed.text || '');
};

module.exports = { extractInvoiceDataFromPdf };
