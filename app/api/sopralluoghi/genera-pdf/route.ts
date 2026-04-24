import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  mapSopralluoghiErrorMessage,
  requireSopralluoghiActivity,
  requireSopralluoghiAdmin,
} from '../_helpers';

export const dynamic = 'force-dynamic';

type GeneraPDFRequest = {
  microarea?: string | null;
  microaree?: string[] | null;
  territorio_id?: string | null;
  activity_id?: string | null;
  comune?: string | null;
};

type CivicoPdfRow = {
  id: number;
  comune: string;
  odonimo: string;
  civico: string;
  microarea: string;
};

type GeneratedDocument = {
  microarea: string;
  num_civici: number;
  pdf_url: string;
  excel_url: string;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeMicroaree(values: Array<string | null | undefined>): string[] {
  return [...new Set(
    values
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0),
  )].sort((left, right) => left.localeCompare(right, 'it'));
}

function buildPdfBuffer(params: {
  microarea: string;
  territorioName: string;
  activityName: string;
  comune: string;
  civici: CivicoPdfRow[];
}) {
  const { microarea, territorioName, activityName, comune, civici } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const printedAt = new Date();

  doc.setFillColor(146, 27, 27);
  doc.rect(0, 0, 210, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('SOPRALLUOGO RISANAMENTO COLONNE MONTANTI', 14, 14);

  doc.setTextColor(26, 10, 10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Territorio: ${territorioName}`, 14, 34);
  doc.text(`Tipologia lavoro: ${activityName}`, 14, 40);
  doc.text(`Comune: ${comune}`, 14, 46);
  doc.text(`Microarea: ${microarea}`, 14, 52);
  doc.text(`Data stampa: ${formatDate(printedAt)}`, 14, 58);
  doc.text(`Civici totali: ${civici.length}`, 14, 64);
  doc.text('Operatore: ________________________________', 110, 34);
  doc.text('Firma: ____________________________________', 110, 40);

  autoTable(doc, {
    startY: 72,
    head: [['#', 'Indirizzo', 'Civico', 'Visitato', 'Idoneo', 'PG', 'Note']],
    body: civici.map((civico, index) => ([
      String(index + 1),
      civico.odonimo,
      civico.civico,
      '[ ]',
      '[ ]',
      '',
      '',
    ])),
    theme: 'grid',
    headStyles: {
      fillColor: [146, 27, 27],
      textColor: 255,
      fontStyle: 'bold',
    },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 62 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 32 },
    },
    margin: { left: 12, right: 12, bottom: 20 },
    didDrawPage: (hookData) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(122, 96, 96);
      doc.text(
        `GestiLab Cantieri - Plenzich S.p.A. | Pagina ${hookData.pageNumber}`,
        14,
        pageHeight - 8,
      );
    },
  });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

async function buildExcelBuffer(params: {
  microarea: string;
  territorioName: string;
  activityName: string;
  comune: string;
  civici: CivicoPdfRow[];
}) {
  const { microarea, territorioName, activityName, comune, civici } = params;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sopralluogo');
  const printedAt = new Date();

  workbook.creator = 'GestiLab Cantieri';
  workbook.created = printedAt;

  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'SOPRALLUOGO RISANAMENTO COLONNE MONTANTI';
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF921B1B' },
  };
  worksheet.getRow(1).height = 26;

  worksheet.getCell('A3').value = 'Territorio:';
  worksheet.getCell('B3').value = territorioName;
  worksheet.getCell('A4').value = 'Tipologia lavoro:';
  worksheet.getCell('B4').value = activityName;
  worksheet.getCell('A5').value = 'Comune:';
  worksheet.getCell('B5').value = comune;
  worksheet.getCell('A6').value = 'Microarea:';
  worksheet.getCell('B6').value = microarea;
  worksheet.getCell('A7').value = 'Data stampa:';
  worksheet.getCell('B7').value = formatDate(printedAt);
  worksheet.getCell('A8').value = 'Civici totali:';
  worksheet.getCell('B8').value = civici.length;
  worksheet.getCell('D3').value = 'Operatore:';
  worksheet.getCell('E3').value = '________________';
  worksheet.getCell('D4').value = 'Firma:';
  worksheet.getCell('E4').value = '________________';

  ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'D3', 'D4'].forEach((address) => {
    worksheet.getCell(address).font = { bold: true };
  });

  worksheet.columns = [
    { key: 'index', width: 8 },
    { key: 'indirizzo', width: 42 },
    { key: 'civico', width: 14 },
    { key: 'visitato', width: 12 },
    { key: 'idoneo', width: 12 },
    { key: 'pg', width: 10 },
    { key: 'note', width: 30 },
  ];

  const headerRow = worksheet.getRow(10);
  headerRow.values = ['#', 'Indirizzo', 'Civico', 'Visitato', 'Idoneo', 'PG', 'Note'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF921B1B' },
  };
  headerRow.height = 22;

  civici.forEach((civico, index) => {
    const row = worksheet.addRow({
      index: index + 1,
      indirizzo: civico.odonimo,
      civico: civico.civico,
      visitato: '[ ]',
      idoneo: '[ ]',
      pg: '',
      note: '',
    });

    row.alignment = { vertical: 'middle' };
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
  });

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5D8D8' } },
        left: { style: 'thin', color: { argb: 'FFE5D8D8' } },
        bottom: { style: 'thin', color: { argb: 'FFE5D8D8' } },
        right: { style: 'thin', color: { argb: 'FFE5D8D8' } },
      };
    });
  });

  worksheet.views = [{ state: 'frozen', ySplit: 10 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function generateDocumentsForMicroarea(params: {
  microarea: string;
  territorioId: string;
  territorioName: string;
  activityId: string;
  activityName: string;
  comune: string;
  generatedByUserId: string;
}): Promise<GeneratedDocument> {
  const {
    microarea,
    territorioId,
    territorioName,
    activityId,
    activityName,
    comune,
    generatedByUserId,
  } = params;

  const { data: civici, error: civiciError } = await supabaseAdmin
    .from('civici_napoli')
    .select('id, comune, odonimo, civico, microarea')
    .eq('territorio_id', territorioId)
    .eq('activity_id', activityId)
    .eq('comune', comune)
    .eq('microarea', microarea)
    .order('odonimo', { ascending: true })
    .order('civico', { ascending: true });

  if (civiciError) {
    throw new Error(mapSopralluoghiErrorMessage(civiciError.message));
  }

  if (!civici || civici.length === 0) {
    throw new Error(`Microarea ${microarea} non trovata per il territorio selezionato`);
  }

  const pdfOutputDir = path.join(process.cwd(), 'public', 'pdf_sopralluoghi');
  const excelOutputDir = path.join(process.cwd(), 'public', 'xlsx_sopralluoghi');
  ensureDir(pdfOutputDir);
  ensureDir(excelOutputDir);

  const fileBaseName = `${sanitizeFilePart(territorioName)}_${sanitizeFilePart(activityName)}_${sanitizeFilePart(comune)}_${sanitizeFilePart(microarea)}_sopralluogo`;
  const pdfFilename = `${fileBaseName}.pdf`;
  const excelFilename = `${fileBaseName}.xlsx`;
  const pdfDest = path.join(pdfOutputDir, pdfFilename);
  const excelDest = path.join(excelOutputDir, excelFilename);
  const typedCivici = civici as CivicoPdfRow[];

  const pdfBuffer = buildPdfBuffer({
    microarea,
    territorioName,
    activityName,
    comune,
    civici: typedCivici,
  });
  const excelBuffer = await buildExcelBuffer({
    microarea,
    territorioName,
    activityName,
    comune,
    civici: typedCivici,
  });

  fs.writeFileSync(pdfDest, pdfBuffer);
  fs.writeFileSync(excelDest, excelBuffer);

  const pdfUrl = `/pdf_sopralluoghi/${pdfFilename}`;
  const excelUrl = `/xlsx_sopralluoghi/${excelFilename}`;

  const { error: insertError } = await supabaseAdmin
    .from('sopralluoghi_pdf_generati')
    .insert({
      microarea,
      territorio_id: territorioId,
      activity_id: activityId,
      comune,
      num_civici: civici.length,
      generato_da: generatedByUserId,
      pdf_url: pdfUrl,
      excel_url: excelUrl,
      stato_registrazione: 'generato',
    });

  if (insertError) {
    console.error('Errore inserimento sopralluoghi_pdf_generati:', mapSopralluoghiErrorMessage(insertError.message));
  }

  return {
    microarea,
    num_civici: civici.length,
    pdf_url: pdfUrl,
    excel_url: excelUrl,
  };
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireSopralluoghiAdmin();
    if (guard instanceof NextResponse) return guard;

    const body = (await request.json()) as GeneraPDFRequest;
    const territorioId = String(body.territorio_id ?? '').trim();
    const activityId = String(body.activity_id ?? '').trim();
    const comune = String(body.comune ?? '').trim().toUpperCase();
    const microaree = normalizeMicroaree([
      ...(Array.isArray(body.microaree) ? body.microaree : []),
      body.microarea,
    ]);

    if (!territorioId) {
      return NextResponse.json({ error: 'Seleziona un territorio prima di generare il PDF' }, { status: 400 });
    }

    if (!activityId) {
      return NextResponse.json({ error: 'Seleziona una tipologia di lavoro prima di generare il PDF' }, { status: 400 });
    }

    const activity = await requireSopralluoghiActivity(activityId);

    if (microaree.length === 0) {
      return NextResponse.json({ error: 'Seleziona almeno una microarea prima di generare il PDF' }, { status: 400 });
    }

    if (!comune) {
      return NextResponse.json({ error: 'Seleziona un comune prima di generare il PDF' }, { status: 400 });
    }

    const { data: territory, error: territoryError } = await supabaseAdmin
      .from('territories')
      .select('id, name')
      .eq('id', territorioId)
      .maybeSingle();

    if (territoryError) {
      return NextResponse.json({ error: mapSopralluoghiErrorMessage(territoryError.message) }, { status: 500 });
    }

    if (!territory) {
      return NextResponse.json({ error: 'Territorio non trovato' }, { status: 404 });
    }

    const generated: GeneratedDocument[] = [];

    for (const microarea of microaree) {
      generated.push(await generateDocumentsForMicroarea({
        microarea,
        territorioId,
        territorioName: territory.name,
        activityId: activity.id,
        activityName: activity.name,
        comune,
        generatedByUserId: guard.userId,
      }));
    }

    if (generated.length === 1) {
      const [single] = generated;

      return NextResponse.json({
        success: true,
        microarea: single.microarea,
        microaree: [single.microarea],
        num_civici: single.num_civici,
        pdf_url: single.pdf_url,
        excel_url: single.excel_url,
        generated,
        activity_id: activity.id,
        activity_name: activity.name,
        comune,
        message: `PDF ed Excel generati con successo per ${single.microarea}`,
      });
    }

    return NextResponse.json({
      success: true,
      microaree,
      generated,
      generated_count: generated.length,
      activity_id: activity.id,
      activity_name: activity.name,
      comune,
      message: `PDF ed Excel generati con successo per ${generated.length} microaree`,
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = mapSopralluoghiErrorMessage(rawMessage);
    console.error('Errore generale API genera-pdf:', message);
    return NextResponse.json({ error: 'Errore interno del server', details: message }, { status: 500 });
  }
}
