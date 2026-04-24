import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { mapSopralluoghiErrorMessage, requireSopralluoghiAdmin } from '../_helpers';

export const dynamic = 'force-dynamic';

type CivicoRow = {
  odonimo: string;
  civico: string;
  microarea: string;
  latitudine: number | null;
  longitudine: number | null;
};

type CivicoInsertRow = CivicoRow & {
  territorio_id: string;
};

type CoordinateAxis = 'lat' | 'lon';

type HeaderMap = {
  odonimo: number;
  civico: number;
  microarea: number;
  indirizzoCompleto: number | null;
  latitudine: number | null;
  longitudine: number | null;
};

type ParsedRows = {
  rows: CivicoRow[];
  sourceName: string;
};

type DeduplicateResult = {
  rows: CivicoInsertRow[];
  duplicateRows: number;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function findColumn(headers: string[], patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const index = headers.findIndex((header) => pattern.test(header));
    if (index >= 0) {
      return index;
    }
  }

  return null;
}

function resolveHeaderMap(headerRow: unknown[]): HeaderMap | null {
  const headers = headerRow.map(normalizeHeader);
  const odonimo = findColumn(headers, [/^odonimo$/, /^via$/, /^toponimo$/]);
  const civico = findColumn(headers, [/^civico$/, /^numero civico$/, /^n civico$/]);
  const microarea = findColumn(headers, [/^microarea$/]);

  if (odonimo == null || civico == null || microarea == null) {
    return null;
  }

  return {
    odonimo,
    civico,
    microarea,
    indirizzoCompleto: findColumn(headers, [/^indirizzo completo$/, /^indirizzo$/]),
    latitudine: findColumn(headers, [/^latitudine$/, /^lat$/]),
    longitudine: findColumn(headers, [/^longitudine$/, /^lon$/, /^lng$/]),
  };
}

function isCoordinateInRange(value: number, axis: CoordinateAxis): boolean {
  if (axis === 'lat') {
    return value >= -90 && value <= 90;
  }

  return value >= -180 && value <= 180;
}

function parseCoordinate(value: unknown, axis: CoordinateAxis): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, '').replace(',', '.');
  const directValue = Number(normalized);
  if (Number.isFinite(directValue) && isCoordinateInRange(directValue, axis)) {
    return directValue;
  }

  const compactDigits = normalized.replace(/[^\d-]/g, '');
  if (/^-?\d{8,}$/.test(compactDigits)) {
    const candidate = Number(compactDigits) / 10_000_000;
    if (Number.isFinite(candidate) && isCoordinateInRange(candidate, axis)) {
      return candidate;
    }
  }

  return null;
}

function parseAddressParts(indirizzoCompleto: string): Pick<CivicoRow, 'odonimo' | 'civico'> {
  const normalized = indirizzoCompleto.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { odonimo: '', civico: '' };
  }

  const match = normalized.match(
    /^(.*\S)\s+((?:\d+[A-Z]?)(?:\/[A-Z0-9]+)?(?:\s?(?:BIS|TER|QUATER))?|SNC)$/i,
  );

  if (!match) {
    return { odonimo: normalized, civico: '' };
  }

  return {
    odonimo: match[1]?.trim() ?? '',
    civico: match[2]?.trim().toUpperCase() ?? '',
  };
}

function buildRowFromCells(cells: unknown[], headerMap: HeaderMap): CivicoRow | null {
  const indirizzoCompleto = headerMap.indirizzoCompleto != null
    ? String(cells[headerMap.indirizzoCompleto] ?? '').trim()
    : '';

  let odonimo = String(cells[headerMap.odonimo] ?? '').trim();
  let civico = String(cells[headerMap.civico] ?? '').trim();
  const microarea = String(cells[headerMap.microarea] ?? '').trim();

  if ((!odonimo || !civico) && indirizzoCompleto) {
    const derived = parseAddressParts(indirizzoCompleto);
    odonimo ||= derived.odonimo;
    civico ||= derived.civico;
  }

  if (!odonimo || !civico || !microarea) {
    return null;
  }

  return {
    odonimo,
    civico,
    microarea,
    latitudine: headerMap.latitudine != null ? parseCoordinate(cells[headerMap.latitudine], 'lat') : null,
    longitudine: headerMap.longitudine != null ? parseCoordinate(cells[headerMap.longitudine], 'lon') : null,
  };
}

function findHeaderRow(rows: unknown[][]): { headerRowIndex: number; headerMap: HeaderMap } | null {
  const maxRowsToScan = Math.min(rows.length, 10);

  for (let index = 0; index < maxRowsToScan; index += 1) {
    const headerMap = resolveHeaderMap(rows[index] ?? []);
    if (headerMap) {
      return { headerRowIndex: index, headerMap };
    }
  }

  return null;
}

function parseRows(rows: unknown[][], sourceName: string): ParsedRows {
  const headerMatch = findHeaderRow(rows);
  if (!headerMatch) {
    throw new Error(
      `Nel file ${sourceName} non sono state trovate le colonne obbligatorie odonimo, civico e microarea`,
    );
  }

  const parsedRows: CivicoRow[] = [];

  for (let rowIndex = headerMatch.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = buildRowFromCells(rows[rowIndex] ?? [], headerMatch.headerMap);
    if (row) {
      parsedRows.push(row);
    }
  }

  return {
    rows: parsedRows,
    sourceName,
  };
}

function guessCsvDelimiter(text: string): ',' | ';' | '\t' {
  const headerLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiterCounts = [
    { delimiter: ';' as const, count: (headerLine.match(/;/g) ?? []).length },
    { delimiter: ',' as const, count: (headerLine.match(/,/g) ?? []).length },
    { delimiter: '\t' as const, count: (headerLine.match(/\t/g) ?? []).length },
  ];

  const bestDelimiter = delimiterCounts.sort((left, right) => right.count - left.count)[0];
  return bestDelimiter?.count ? bestDelimiter.delimiter : ';';
}

function parseCSV(text: string): ParsedRows {
  const workbook = XLSX.read(text.replace(/^\uFEFF/, ''), {
    type: 'string',
    FS: guessCsvDelimiter(text),
  });
  const worksheetName = workbook.SheetNames[0];
  const worksheet = worksheetName ? workbook.Sheets[worksheetName] : null;

  if (!worksheet) {
    throw new Error('File CSV vuoto');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  return parseRows(rows, 'CSV');
}

function getSheetPriority(sheetName: string): number {
  const normalized = normalizeHeader(sheetName);

  if (normalized.includes('civici')) return 0;
  if (normalized.includes('indirizzi')) return 1;
  if (normalized.includes('stats')) return 100;

  return 10;
}

async function parseExcel(file: File): Promise<ParsedRows> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const orderedSheetNames = [...workbook.SheetNames].sort(
    (left, right) => getSheetPriority(left) - getSheetPriority(right),
  );

  for (const sheetName of orderedSheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    });

    try {
      const parsed = parseRows(rows, sheetName);
      if (parsed.rows.length > 0) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    'Nel file Excel non è stato trovato un foglio valido con le colonne odonimo, civico e microarea',
  );
}

function normalizeKeyPart(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function buildConflictKey(row: CivicoInsertRow): string {
  return [
    row.territorio_id,
    normalizeKeyPart(row.odonimo),
    normalizeKeyPart(row.civico),
    normalizeKeyPart(row.microarea),
  ].join('|');
}

function scoreRowCompleteness(row: CivicoInsertRow): number {
  let score = 0;
  if (row.latitudine != null) score += 1;
  if (row.longitudine != null) score += 1;
  return score;
}

function deduplicatePayload(rows: CivicoInsertRow[]): DeduplicateResult {
  const deduplicated = new Map<string, CivicoInsertRow>();
  let duplicateRows = 0;

  for (const row of rows) {
    const key = buildConflictKey(row);
    const existing = deduplicated.get(key);
    if (!existing) {
      deduplicated.set(key, row);
      continue;
    }

    duplicateRows += 1;

    // Prefer the row with the most complete coordinate payload.
    if (scoreRowCompleteness(row) > scoreRowCompleteness(existing)) {
      deduplicated.set(key, row);
    }
  }

  return {
    rows: [...deduplicated.values()],
    duplicateRows,
  };
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireSopralluoghiAdmin();
    if (guard instanceof NextResponse) return guard;

    const formData = await request.formData();
    const file = formData.get('file');
    const territorioId = String(formData.get('territorio_id') ?? '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nessun file caricato' }, { status: 400 });
    }

    if (!territorioId) {
      return NextResponse.json({ error: 'Seleziona un territorio di riferimento' }, { status: 400 });
    }

    const { data: territory, error: territoryError } = await supabaseAdmin
      .from('territories')
      .select('id, name')
      .eq('id', territorioId)
      .maybeSingle();

    if (territoryError) {
      return NextResponse.json({ error: territoryError.message }, { status: 500 });
    }

    if (!territory) {
      return NextResponse.json({ error: 'Territorio non trovato' }, { status: 404 });
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith('.csv') && !filename.endsWith('.xls') && !filename.endsWith('.xlsx')) {
      return NextResponse.json(
        { error: 'Formato non supportato. Usa CSV o Excel (.xls / .xlsx)' },
        { status: 400 },
      );
    }

    const parsed = filename.endsWith('.csv')
      ? parseCSV(await file.text())
      : await parseExcel(file);
    const rows = parsed.rows;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nessuna riga valida trovata nel file' }, { status: 400 });
    }

    const payload: CivicoInsertRow[] = rows.map((row) => ({
      ...row,
      territorio_id: territorioId,
    }));
    const deduplicated = deduplicatePayload(payload);

    const BATCH_SIZE = 500;
    let inserted = 0;
    let errors = 0;
    let firstBatchError: string | null = null;

    for (let start = 0; start < deduplicated.rows.length; start += BATCH_SIZE) {
      const batch = deduplicated.rows.slice(start, start + BATCH_SIZE);
      const { error } = await supabaseAdmin
        .from('civici_napoli')
        .upsert(batch, {
          onConflict: 'territorio_id,odonimo,civico,microarea',
          ignoreDuplicates: false,
        });

      if (error) {
        firstBatchError ??= mapSopralluoghiErrorMessage(error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    if (inserted === 0 && firstBatchError) {
      return NextResponse.json(
        { error: `Import non riuscito sul foglio ${parsed.sourceName}: ${firstBatchError}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      totale: rows.length,
      inseriti: inserted,
      errori: errors,
      duplicati_scartati: deduplicated.duplicateRows,
      microaree: [...new Set(rows.map((row) => row.microarea))].length,
      territorio_id: territory.id,
      territorio_nome: territory.name,
      sorgente: parsed.sourceName,
      warning: firstBatchError
        ? `Alcune righe non sono state salvate: ${firstBatchError}`
        : deduplicated.duplicateRows > 0
          ? `${deduplicated.duplicateRows.toLocaleString('it-IT')} duplicati interni al file sono stati scartati prima del salvataggio`
          : null,
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = mapSopralluoghiErrorMessage(rawMessage);
    console.error('Errore import civici:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
