import 'server-only';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { righeModificate, conflittiRighe, nonCollocate } from '@/lib/agente/storicoExport';
import { formattaIstante } from '@/lib/agente/uiTypes';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('agente_run')
    .select('id, creato_il, dry_run, lavori, aggiornate, extra, conflitti, non_collocate, errore, dettaglio')
    .eq('id', id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Giro non trovato.' }, { status: 404 });
  }

  const righe = righeModificate(data.dettaglio);
  const conflitti = conflittiRighe(data.dettaglio);
  const nonColl = nonCollocate(data.dettaglio);

  const wb = new ExcelJS.Workbook();

  const wsR = wb.addWorksheet('Riepilogo');
  wsR.columns = [
    { header: 'Voce', key: 'k', width: 22 },
    { header: 'Valore', key: 'v', width: 44 },
  ];
  wsR.getRow(1).font = { bold: true };
  wsR.addRows([
    { k: 'Giro', v: formattaIstante(data.creato_il) },
    { k: 'Modalità', v: data.dry_run ? 'Prova (dry-run)' : 'Reale' },
    { k: 'Lavori', v: data.lavori },
    { k: 'Aggiornate', v: data.aggiornate },
    { k: 'Extra', v: data.extra },
    { k: 'Conflitti', v: data.conflitti },
    { k: 'Non collocate', v: data.non_collocate },
    { k: 'Errore', v: data.errore ?? '' },
  ]);

  const wsM = wb.addWorksheet('Righe modificate');
  wsM.columns = [
    { header: 'FILE', key: 'file', width: 18 },
    { header: 'RIGA', key: 'riga', width: 7 },
    { header: 'TIPO', key: 'tipo', width: 12 },
    { header: 'COMUNE', key: 'comune', width: 16 },
    { header: 'ODL', key: 'odl', width: 14 },
    { header: 'MATRICOLA', key: 'matricola', width: 16 },
    { header: 'VIA', key: 'via', width: 22 },
    { header: 'ESECUTORE', key: 'esecutore', width: 16 },
    { header: 'ESITO', key: 'esito', width: 12 },
    { header: 'SIGILLO', key: 'sigillo', width: 14 },
    { header: 'DATA', key: 'data', width: 12 },
    { header: 'SARACINESCA', key: 'saracinesca', width: 12 },
    { header: 'NOTE', key: 'note', width: 30 },
  ];
  wsM.getRow(1).font = { bold: true };
  wsM.addRows(righe);

  const wsC = wb.addWorksheet('Conflitti');
  wsC.columns = [
    { header: 'FILE', key: 'file', width: 18 },
    { header: 'RIGA', key: 'riga', width: 7 },
    { header: 'CAMPO', key: 'campo', width: 14 },
    { header: 'ESISTENTE', key: 'esistente', width: 22 },
    { header: 'NUOVO', key: 'nuovo', width: 22 },
  ];
  wsC.getRow(1).font = { bold: true };
  wsC.addRows(conflitti);

  const wsN = wb.addWorksheet('Non collocate');
  wsN.columns = [
    { header: 'COMUNE', key: 'comune', width: 18 },
    { header: 'MATRICOLA', key: 'matricola', width: 16 },
    { header: 'ESECUTORE', key: 'esecutore', width: 16 },
    { header: 'MOTIVO', key: 'motivo', width: 24 },
  ];
  wsN.getRow(1).font = { bold: true };
  wsN.addRows(nonColl);

  const buf = await wb.xlsx.writeBuffer();
  const fileName = `giro_${String(data.creato_il ?? '').slice(0, 10)}_${String(id).slice(0, 8)}.xlsx`;
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String((buf as unknown as { byteLength: number }).byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
