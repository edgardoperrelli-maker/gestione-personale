// Coda «da assegnare»: export per il backoffice e registrazione massiva.
//
// «Da assegnare» non è uno stato: è una riga APPROVATA senza `assegnato_committente_at`.
// L'approvazione è la decisione interna dell'ufficio; l'assegnazione dell'ODL sul sistema del
// committente è un fatto del mondo esterno, che su AcquaLatina si fa a mano. Due assi
// separati, così nessun lettore di `stato` deve imparare un valore in più.
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAdmin } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { righeExportDaAssegnare, COMMITTENTI_ASSEGNAZIONE_MANUALE } from '@/lib/interventi/manuali/daAssegnare';
import type { RigaRichiesta } from '@/lib/interventi/manuali/types';

export const runtime = 'nodejs';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLONNE = 'id, staff_id, staff_name, committente, data, stato, dati_operatore, dati_correnti, assegnato_committente_at';

const fmtData = (iso: string | null): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
};

/**
 * GET ?committente=&from=&to= → XLSX degli ordini da assegnare.
 *
 * Il foglio dice DUE cose e basta: quale ODL, e a chi va assegnato. È quello che serve per
 * lavorare sul portale del committente; il resto (matricola, indirizzo) è contesto per
 * riconoscere la riga se qualcosa non torna.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const sp = new URL(req.url).searchParams;
  let q = supabaseAdmin
    .from('interventi_manuali')
    .select(COLONNE)
    .eq('stato', 'approvato')
    .is('assegnato_committente_at', null)
    // Solo i committenti che si assegnano a mano: su ACEA lo fa l'agente del Cruscotto.
    .in('committente', COMMITTENTI_ASSEGNAZIONE_MANUALE)
    // Le richieste di Pronto Intervento vivono solo nel modulo P.I.
    .neq('fonte', 'pronto_intervento');
  const committente = sp.get('committente');
  if (committente) q = q.eq('committente', committente);
  const from = sp.get('from');
  if (from) q = q.gte('data', from);
  const to = sp.get('to');
  if (to) q = q.lte('data', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const righe = righeExportDaAssegnare((data ?? []) as unknown as RigaRichiesta[]);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Da assegnare');
  ws.addRow(['ODL', 'OPERATORE', 'MATRICOLA', 'INDIRIZZO', 'COMUNE', 'DATA', 'COMMITTENTE']);
  ws.getRow(1).font = { bold: true };
  for (const r of righe) {
    ws.addRow([r.odl, r.operatore, r.matricola, r.indirizzo, r.comune, fmtData(r.data), r.committente]);
  }
  ws.columns = [{ width: 14 }, { width: 24 }, { width: 14 }, { width: 32 }, { width: 18 }, { width: 12 }, { width: 14 }];

  const buf = await wb.xlsx.writeBuffer();
  const nome = `da-assegnare${committente ? `-${committente}` : ''}.xlsx`;
  return new NextResponse(buf as ArrayBuffer, {
    headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${nome}"` },
  });
}

/**
 * POST { ids: string[] } → registra l'avvenuta assegnazione sul sistema del committente.
 *
 * Il guard `.eq('stato','approvato').is('assegnato_committente_at', null)` è la stessa idea
 * del check-and-set atomico dell'approvazione: due persone che spuntano insieme non si
 * pestano, e una riga già registrata non cambia timestamp. La risposta dice quante righe
 * hanno cambiato stato DAVVERO, non quante ne sono state chieste.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && v !== '') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'ids_mancanti' }, { status: 422 });

  const { data, error } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ assegnato_committente_at: new Date().toISOString() })
    .in('id', ids)
    .eq('stato', 'approvato')
    .in('committente', COMMITTENTI_ASSEGNAZIONE_MANUALE)
    .is('assegnato_committente_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const registrate = (data ?? []).length;
  return NextResponse.json({ ok: true, registrate, richieste: ids.length });
}
