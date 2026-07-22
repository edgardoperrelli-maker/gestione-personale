// app/api/interventi/storico/export/route.ts
import { BRAND_EXPORT } from '@/lib/brand';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/apiAuth';
import { parseFiltriStorico } from '@/lib/interventi/storico/filtri';
import { caricaRigheStorico, caricaStaff } from '@/lib/interventi/storico/caricaStorico';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Cap alto: l'export "intero DB" deve prendere tutto.
const MAX_RIGHE = 100000;

// ATTIVITÀ = descrizione grezza della voce; GRUPPO ATTIVITÀ = gruppo di tassonomia
// risolto (lo stesso valore su cui lavora il filtro omonimo della pagina).
const HEADERS = [
  { key: 'odl', header: 'ODL/ODS', width: 16 },
  { key: 'pdr', header: 'PDR', width: 18 },
  { key: 'matricola', header: 'MATRICOLA', width: 18 },
  { key: 'sigillo', header: 'SIGILLO', width: 14 },
  { key: 'data', header: 'DATA ESECUZIONE', width: 16 },
  { key: 'esecutore', header: 'ESECUTORE', width: 22 },
  { key: 'via', header: 'VIA', width: 28 },
  { key: 'gruppoAttivita', header: 'ATTIVITÀ', width: 24 },
  { key: 'gruppo', header: 'GRUPPO ATTIVITÀ', width: 22 },
  { key: 'committente', header: 'COMMITTENTE', width: 14 },
  { key: 'territorio', header: 'TERRITORIO', width: 16 },
  { key: 'eseguito', header: 'ESEGUITO', width: 10 },
  { key: 'sostValvola', header: 'SOST. VALVOLA', width: 14 },
  { key: 'miniBag', header: 'MINI BAG', width: 10 },
  { key: 'rgStop', header: 'RG STOP', width: 10 },
  { key: 'note', header: 'NOTE', width: 30 },
];

function fmtData(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const f = parseFiltriStorico(searchParams);

    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createRouteHandlerClient({ cookies: cookieMethods });

    const staffById = await caricaStaff(supabase);
    const { righe } = await caricaRigheStorico(supabase, f, staffById, MAX_RIGHE);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gestione Personale';
    wb.created = new Date();
    const ws = wb.addWorksheet('Storico interventi', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = HEADERS;

    const hRow = ws.getRow(1);
    hRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_EXPORT.navyArgb } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    hRow.height = 20;
    hRow.commit();

    let rowIdx = 2;
    for (const r of righe) {
      ws.getRow(rowIdx).values = {
        odl: r.odl ?? '',
        pdr: r.pdr ?? '',
        matricola: r.matricola ?? '',
        sigillo: r.sigillo ?? '',
        data: fmtData(r.data),
        esecutore: r.esecutore ?? '',
        via: r.via ?? '',
        gruppoAttivita: r.gruppoAttivita ?? '',
        gruppo: r.gruppo ?? '',
        committente: (r.committente ?? '').toUpperCase(),
        territorio: r.territorio ?? '',
        eseguito: r.eseguito === '—' ? '' : r.eseguito,
        sostValvola: r.sostValvola === '—' ? '' : r.sostValvola,
        miniBag: r.miniBag === '—' ? '' : r.miniBag,
        rgStop: r.rgStop === '—' ? '' : r.rgStop,
        note: r.note ?? '',
      } as unknown as Record<string, ExcelJS.CellValue>;
      ws.getRow(rowIdx).commit();
      rowIdx++;
    }

    const buf = await wb.xlsx.writeBuffer();
    const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10).replaceAll('-', '');
    const fileName = `storico_interventi_${stamp}.xlsx`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String((buf as unknown as { byteLength: number }).byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore export storico.' },
      { status: 500 },
    );
  }
}
