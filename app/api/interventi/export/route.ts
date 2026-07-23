import { BRAND_EXPORT } from '@/lib/brand';
import 'server-only';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { interventoMatchStato, type FiltroStatoLive } from '@/lib/interventi/exportFiltro';
import { buildRigaExport, type InterventoExport } from '@/lib/interventi/exportRows';
import { SENTINELLA_NON_ASSEGNATI } from '@/lib/interventi/torreView';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLONNE =
  'data, staff_id, stato, esito, esito_motivo, odl, nominativo, pdr, matricola_contatore, indirizzo, comune, cap, intervento_tipo, fascia_oraria, chiuso_at, territorio_id';

const HEADERS = [
  { key: 'data', header: 'DATA', width: 12 },
  { key: 'operatore', header: 'OPERATORE', width: 20 },
  { key: 'stato', header: 'STATO', width: 14 },
  { key: 'esito', header: 'ESITO', width: 20 },
  { key: 'motivo', header: 'MOTIVO', width: 24 },
  { key: 'odl', header: 'ODL', width: 14 },
  { key: 'nominativo', header: 'NOMINATIVO', width: 22 },
  { key: 'pdr', header: 'PDR', width: 14 },
  { key: 'matricola', header: 'MATRICOLA', width: 14 },
  { key: 'indirizzo', header: 'INDIRIZZO', width: 24 },
  { key: 'comune', header: 'COMUNE', width: 16 },
  { key: 'cap', header: 'CAP', width: 7 },
  { key: 'attivita', header: 'ATTIVITÀ', width: 16 },
  { key: 'fascia', header: 'FASCIA ORARIA', width: 14 },
  { key: 'chiuso', header: 'CHIUSO', width: 8 },
];

const STATI_VALIDI: FiltroStatoLive[] = ['tutti', 'ok', 'ko', 'attesa'];

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Parametri from/to obbligatori (YYYY-MM-DD).' }, { status: 400 });
  }
  const staff = searchParams.get('staff') ?? '';
  const territorio = searchParams.get('territorio') ?? '';
  const statoParam = (searchParams.get('stato') ?? 'tutti') as FiltroStatoLive;
  const stato: FiltroStatoLive = STATI_VALIDI.includes(statoParam) ? statoParam : 'tutti';

  try {
    const PAGE = 1000;
    const righeDb: InterventoExport[] = [];
    for (let offset = 0; ; offset += PAGE) {
      let q = supabaseAdmin
        .from('interventi')
        .select(COLONNE)
        .gte('data', from)
        .lte('data', to)
        .order('data', { ascending: true })
        .order('comune', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (territorio) q = q.eq('territorio_id', territorio);
      if (staff === SENTINELLA_NON_ASSEGNATI) q = q.is('staff_id', null);
      else if (staff) q = q.eq('staff_id', staff);
      const { data: batch, error } = await q;
      if (error) throw error;
      const rows = (batch ?? []) as InterventoExport[];
      righeDb.push(...rows);
      if (rows.length < PAGE) break;
    }

    const filtrate = righeDb.filter((it) => interventoMatchStato(it, stato));

    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staffById = new Map<string, string>();
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) {
      staffById.set(s.id, s.display_name);
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Gestione Personale';
    wb.created = new Date();
    const ws = wb.addWorksheet('Live', { views: [{ state: 'frozen', ySplit: 1 }] });
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
    for (const it of filtrate) {
      const wsRow = ws.getRow(rowIdx);
      wsRow.values = buildRigaExport(it, staffById) as unknown as Record<string, ExcelJS.CellValue>;
      wsRow.commit();
      rowIdx++;
    }

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `live_${from.replaceAll('-', '')}_${to.replaceAll('-', '')}.xlsx`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String((buf as unknown as { byteLength: number }).byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore export.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
