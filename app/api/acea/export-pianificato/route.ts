import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { COMMITTENTI_ACEA } from '@/lib/acea/vociRapportino';
import { CAMPI_PIANIFICATO, ordinaPianificato, type RigaPianificata } from '@/lib/acea/fogliExport';
import { intestazioniXlsx, scriviFoglio } from '@/lib/acea/scriviFoglio';
import type { Famiglia } from '@/lib/acea/saracinesche';

export const runtime = 'nodejs';

const CHUNK = 200;

/**
 * GET /api/acea/export-pianificato?data=YYYY-MM-DD[&famiglia=dunning|massive]
 *
 * Il foglio che l'admin tiene aperto mentre assegna a mano sul Cruscotto: ODL, operatore, comune,
 * indirizzo, attività, ordinati come si assegna — una persona alla volta.
 *
 * Finché il motore Playwright di assegnazione non è abbastanza rapido, questo è il ponte fra la
 * pianificazione fatta in app e l'assegnazione fatta sul portale.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = String(searchParams.get('data') ?? '').trim();
  const f = searchParams.get('famiglia');
  const famiglia: Famiglia | null = f === 'dunning' || f === 'massive' ? f : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Parametro data obbligatorio (YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    type InterventoRow = {
      odl: string | null; staff_id: string | null; comune: string | null;
      indirizzo: string | null; cap: string | null; matricola_contatore: string | null;
      intervento_tipo: string | null;
    };
    const { data: intRows, error } = await supabaseAdmin
      .from('interventi')
      .select('odl, staff_id, comune, indirizzo, cap, matricola_contatore, intervento_tipo, stato')
      .eq('data', data)
      .in('committente', [...COMMITTENTI_ACEA]);
    if (error) throw error;

    const interventi = ((intRows ?? []) as Array<InterventoRow & { stato: string }>)
      .filter((i) => i.odl && i.stato !== 'annullato');
    if (interventi.length === 0) {
      return NextResponse.json({ error: `Nessun intervento ACEA pianificato per il ${data}.` }, { status: 404 });
    }

    // Nomi operatore.
    const staffIds = [...new Set(interventi.map((i) => i.staff_id).filter((s): s is string => !!s))];
    const nomi = new Map<string, string>();
    for (let i = 0; i < staffIds.length; i += CHUNK) {
      const { data: rows } = await supabaseAdmin
        .from('staff').select('id, display_name').in('id', staffIds.slice(i, i + CHUNK));
      for (const s of (rows ?? []) as Array<{ id: string; display_name: string | null }>) {
        nomi.set(String(s.id), (s.display_name ?? '').trim() || String(s.id));
      }
    }

    // Dati ACEA dal registro: impianto, stato corrente, famiglia, attività canonica dell'export.
    const odlUnici = [...new Set(interventi.map((i) => String(i.odl)))];
    type OrdineRow = {
      odl: string; numero_operazione: string; impianto: string | null; matricola: string | null;
      stato: string | null; famiglia: string | null; attivita: string | null;
      via: string | null; civico: string | null; cap: string | null; comune: string | null;
    };
    const registro = new Map<string, OrdineRow>();
    for (let i = 0; i < odlUnici.length; i += CHUNK) {
      const { data: rows, error: e } = await supabaseAdmin
        .from('acea_ordini')
        .select('odl, numero_operazione, impianto, matricola, stato, famiglia, attivita, via, civico, cap, comune')
        .in('odl', odlUnici.slice(i, i + CHUNK));
      if (e) throw e;
      for (const r of (rows ?? []) as OrdineRow[]) if (!registro.has(r.odl)) registro.set(r.odl, r);
    }

    const righe: RigaPianificata[] = interventi.map((i) => {
      const reg = registro.get(String(i.odl));
      return {
        odl: String(i.odl),
        numero_operazione: reg?.numero_operazione ?? '',
        operatore: i.staff_id ? (nomi.get(i.staff_id) ?? i.staff_id) : null,
        attivita: reg?.attivita ?? i.intervento_tipo ?? null,
        comune: reg?.comune ?? i.comune ?? null,
        indirizzo: i.indirizzo ?? ([reg?.via, reg?.civico].filter(Boolean).join(' ') || null),
        cap: reg?.cap ?? i.cap ?? null,
        impianto: reg?.impianto ?? null,
        matricola: reg?.matricola ?? i.matricola_contatore ?? null,
        stato_acea: reg?.stato ?? null,
        famiglia: (reg?.famiglia as Famiglia | undefined) ?? null,
      };
    });

    const filtrate = famiglia ? righe.filter((r) => r.famiglia === famiglia) : righe;
    if (filtrate.length === 0) {
      return NextResponse.json(
        { error: `Nessun intervento ${famiglia} pianificato per il ${data}.` },
        { status: 404 },
      );
    }

    const wb = scriviFoglio('Pianificato', CAMPI_PIANIFICATO, ordinaPianificato(filtrate));
    const buf = await wb.xlsx.writeBuffer();
    const nome = `acea-pianificato-${famiglia ? `${famiglia}-` : ''}${data.replaceAll('-', '')}.xlsx`;
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: intestazioniXlsx(nome, (buf as unknown as { byteLength: number }).byteLength),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore export pianificato.' },
      { status: 500 },
    );
  }
}
