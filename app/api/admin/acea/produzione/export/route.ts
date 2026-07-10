import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminPlus } from '@/lib/apiAuth';
import { caricaProduzioneEconomica, type ProduzioneEconomica } from '@/lib/produzione/load';
import { buildWorkbookProduzione } from '@/lib/produzione/exportExcel';
import { aggiungiFogli, fogliPersonale, fogliSal, iniettaTemplate, mappaCelleProduzione } from '@/lib/produzione/excelInject';
import templateDashboard from '@/lib/produzione/templateDashboard.json';

export const runtime = 'nodejs';

const XLSX_HEADERS = (fileName: string) => ({
  'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'Content-Disposition': `attachment; filename="${fileName}"`,
  'Cache-Control': 'no-store',
});

/**
 * Produce il workbook: prima prova a INIETTARE i dati nel template con GRAFICI NATIVI (via jszip,
 * preserva i grafici); se qualcosa va storto ripiega sul workbook tabellare ExcelJS (sempre apribile).
 */
async function costruisciBuffer(dati: ProduzioneEconomica): Promise<Buffer | ArrayBuffer> {
  try {
    const tpl = Buffer.from((templateDashboard as { b64: string }).b64, 'base64');
    const iniettato = await iniettaTemplate(tpl, mappaCelleProduzione(dati));
    return await aggiungiFogli(iniettato, [...fogliPersonale(dati), ...fogliSal(dati)]);
  } catch (e) {
    console.error('[export] iniezione template fallita, fallback ExcelJS:', e instanceof Error ? e.message : e);
    return buildWorkbookProduzione(dati);
  }
}

/** GET ?from&to (YYYY-MM-DD): scarica il workbook "Produzione economica ACEA" (Dashboard + grafici). */
export async function GET(req: Request) {
  const auth = await requireAdminPlus();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    const dati = await caricaProduzioneEconomica(from, to);
    const buf = await costruisciBuffer(dati);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: XLSX_HEADERS(`Produzione-economica-ACEA_${from}_${to}.xlsx`),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export Excel.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
