import { BRAND_EXPORT } from '@/lib/brand';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAdmin } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fmtData(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
const s = (v: unknown) => (v == null ? '' : String(v));

/** GET ?area=&from=&to=: export "registro chiamate" P.I. di una foglia (Excel),
 *  con una colonna per articolo del listino, il valore per riga e i totali. */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const sp = new URL(req.url).searchParams;
  const area = sp.get('area');
  const from = sp.get('from');
  const to = sp.get('to');
  if (!area) return NextResponse.json({ error: 'area_mancante' }, { status: 422 });

  // Foglia + listino (colonne articolo).
  const { data: areaRow } = await supabaseAdmin.from('pi_aree').select('codice, label').eq('codice', area).maybeSingle();
  const { data: listino } = await supabaseAdmin
    .from('pi_articoli')
    .select('codice, descrizione, unita_misura, prezzo_unitario, ordine')
    .eq('area_codice', area)
    .order('ordine');
  const articoli = (listino ?? []) as Array<{ codice: string; descrizione: string | null; unita_misura: string | null; prezzo_unitario: number }>;

  // Interventi approvati della foglia. Il filtro d'area è OBBLIGATORIO: senza,
  // l'export della foglia conteneva anche le chiamate delle altre aree.
  let q = supabaseAdmin
    .from('interventi_manuali')
    .select('id, intervento_id, data, staff_name, dati_correnti')
    .eq('fonte', 'pronto_intervento')
    .eq('stato', 'approvato')
    .eq('area_codice', area)
    .order('data', { ascending: true });
  if (from) q = q.gte('data', from);
  if (to) q = q.lte('data', to);
  const { data: righe } = await q;
  const rows = (righe ?? []) as Array<{ id: string; intervento_id: string | null; data: string | null; staff_name: string | null; dati_correnti: { anagrafica?: Record<string, unknown>; risposte?: Record<string, unknown> } | null }>;

  // Contabilità: mappa intervento_id → (codice → quantità) + valore riga.
  const interventoIds = rows.map((r) => r.intervento_id).filter((v): v is string => !!v);
  const qtaPerInt = new Map<string, Map<string, number>>();
  const valorePerInt = new Map<string, number>();
  if (interventoIds.length > 0) {
    const { data: cont } = await supabaseAdmin
      .from('pi_contabilita_righe')
      .select('intervento_id, articolo_codice, quantita, valore')
      .in('intervento_id', interventoIds);
    for (const c of (cont ?? []) as Array<{ intervento_id: string; articolo_codice: string; quantita: number; valore: number }>) {
      if (!qtaPerInt.has(c.intervento_id)) qtaPerInt.set(c.intervento_id, new Map());
      qtaPerInt.get(c.intervento_id)!.set(c.articolo_codice, Number(c.quantita ?? 0));
      valorePerInt.set(c.intervento_id, (valorePerInt.get(c.intervento_id) ?? 0) + Number(c.valore ?? 0));
    }
  }

  // Workbook.
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestione Personale';
  wb.created = new Date();
  const ws = wb.addWorksheet(`P.I. ${areaRow?.label ?? area}`.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }] });

  const baseCols: Partial<ExcelJS.Column>[] = [
    { key: 'n_segnalazione', header: 'N° SEGNALAZIONE', width: 18 },
    { key: 'comune', header: 'COMUNE', width: 18 },
    { key: 'indirizzo', header: 'INDIRIZZO', width: 28 },
    { key: 'data', header: 'DATA', width: 12 },
    { key: 'esecutore', header: 'ESECUTORE', width: 22 },
    { key: 'ora_inizio', header: 'ORA INIZIO', width: 10 },
    { key: 'ora_fine', header: 'ORA FINE', width: 10 },
    { key: 'assistente_te', header: 'ASSISTENTE TE', width: 18 },
    { key: 'note', header: 'NOTE', width: 30 },
  ];
  const artCols: Partial<ExcelJS.Column>[] = articoli.map((a) => ({
    key: `art_${a.codice}`,
    header: `${a.codice}\n${a.unita_misura ?? ''} · ${Number(a.prezzo_unitario).toFixed(2)}€`,
    width: 12,
  }));
  const valCol: Partial<ExcelJS.Column> = { key: 'valore', header: 'VALORE €', width: 12 };
  ws.columns = [...baseCols, ...artCols, valCol];

  const hRow = ws.getRow(1);
  hRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_EXPORT.navyArgb } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  hRow.height = 30;
  hRow.commit();

  // Righe dati + accumulo totali.
  const totArt = new Map<string, number>();
  let totValore = 0;
  let idx = 2;
  for (const r of rows) {
    const a = r.dati_correnti?.anagrafica ?? {};
    const rsp = r.dati_correnti?.risposte ?? {};
    const qmap = r.intervento_id ? qtaPerInt.get(r.intervento_id) : undefined;
    const valore = r.intervento_id ? Math.round((valorePerInt.get(r.intervento_id) ?? 0) * 100) / 100 : 0;
    totValore += valore;

    const values: Record<string, ExcelJS.CellValue> = {
      n_segnalazione: s(rsp.n_segnalazione),
      comune: s(a.comune),
      indirizzo: s(a.via),
      data: fmtData(r.data),
      esecutore: s(r.staff_name),
      ora_inizio: s(rsp.ora_inizio),
      ora_fine: s(rsp.ora_fine),
      assistente_te: s(rsp.assistente_te),
      note: s(rsp.note),
      valore: valore || '',
    };
    for (const art of articoli) {
      const qta = qmap?.get(art.codice) ?? 0;
      values[`art_${art.codice}`] = qta || '';
      if (qta) totArt.set(art.codice, (totArt.get(art.codice) ?? 0) + qta);
    }
    ws.getRow(idx).values = values as unknown as Record<string, ExcelJS.CellValue>;
    ws.getRow(idx).commit();
    idx++;
  }

  // Riga TOTALI.
  const totRow: Record<string, ExcelJS.CellValue> = { esecutore: 'TOTALI', valore: Math.round(totValore * 100) / 100 };
  for (const art of articoli) {
    const t = totArt.get(art.codice);
    if (t) totRow[`art_${art.codice}`] = Math.round(t * 1000) / 1000;
  }
  const tr = ws.getRow(idx);
  tr.values = totRow as unknown as Record<string, ExcelJS.CellValue>;
  tr.font = { bold: true };
  tr.commit();

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10).replaceAll('-', '');
  const fileName = `registro_pi_${area}_${stamp}.xlsx`;
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
