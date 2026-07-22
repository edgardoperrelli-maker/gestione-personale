import 'server-only';
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { APERTI_COLS, parseFiltriAperti, haFiltro, applicaFiltriAperti, type QueryFiltrabile } from '@/lib/consuntivazione/apertiFiltri';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PAGE = 1000;
const MAX = 10000; // tetto di sicurezza

type Riga = {
  committente: string | null; odl: string | null; pdr: string | null; nominativo: string | null;
  indirizzo: string | null; comune: string | null; cap: string | null; matricola_contatore: string | null;
  intervento_tipo: string | null; gruppo_attivita: string | null; data: string; staff_id: string | null;
  fascia_oraria: string | null;
};

/**
 * GET /api/admin/consuntivazione/aperti/export — export Excel dei risultati "Ordine presente".
 * Stessi filtri della lista (richiede almeno un filtro), senza tetto 200: tutti i match (fino a MAX).
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const f = parseFiltriAperti(new URL(req.url).searchParams);
  if (!haFiltro(f)) return NextResponse.json({ error: 'nessun_filtro' }, { status: 400 });

  // Tutti i match, paginati.
  const righe: Riga[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    const base = supabaseAdmin.from('interventi').select(APERTI_COLS);
    const q = (applicaFiltriAperti(base as unknown as QueryFiltrabile, f) as unknown as typeof base)
      .order('data', { ascending: false })
      .range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const batch = (data ?? []) as Riga[];
    righe.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Nomi operatori.
  const staffIds = [...new Set(righe.map((r) => r.staff_id).filter((v): v is string => !!v))];
  const nomeStaff = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staff } = await supabaseAdmin.from('staff').select('id, display_name').in('id', staffIds);
    for (const s of (staff ?? []) as Array<{ id: string; display_name: string | null }>) {
      nomeStaff.set(s.id, (s.display_name ?? '').trim() || s.id);
    }
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ordini aperti', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Committente', key: 'committente', width: 14 },
    { header: 'Gruppo attività', key: 'gruppo', width: 22 },
    { header: 'Attività', key: 'attivita', width: 28 },
    { header: 'ODL / ODS', key: 'odl', width: 16 },
    { header: 'PDR / impianto', key: 'pdr', width: 18 },
    { header: 'Matricola', key: 'matricola', width: 20 },
    { header: 'Nominativo', key: 'nominativo', width: 24 },
    { header: 'Indirizzo', key: 'indirizzo', width: 30 },
    { header: 'Comune', key: 'comune', width: 20 },
    { header: 'CAP', key: 'cap', width: 8 },
    { header: 'Fascia oraria', key: 'fascia', width: 14 },
    { header: 'Operatore', key: 'operatore', width: 22 },
    { header: 'Data', key: 'data', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of righe) {
    ws.addRow({
      committente: etichettaCommittente(r.committente ?? ''),
      gruppo: r.gruppo_attivita ?? '',
      attivita: r.intervento_tipo ?? '',
      odl: r.odl ?? '',
      pdr: r.pdr ?? '',
      matricola: r.matricola_contatore ?? '',
      nominativo: r.nominativo ?? '',
      indirizzo: r.indirizzo ?? '',
      comune: r.comune ?? '',
      cap: r.cap ?? '',
      fascia: r.fascia_oraria ?? '',
      operatore: r.staff_id ? (nomeStaff.get(r.staff_id) ?? r.staff_id) : '',
      data: r.data,
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const oggi = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const fileName = `ordini_aperti_${oggi}.xlsx`;
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String((buf as unknown as { byteLength: number }).byteLength),
    },
  });
}
