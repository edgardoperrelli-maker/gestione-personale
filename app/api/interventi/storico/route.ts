// app/api/interventi/storico/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireUser } from '@/lib/apiAuth';
import { parseFiltriStorico, risolviFinestra, interrogaInterventi, interrogaManuali, puliziaQ } from '@/lib/interventi/storico/filtri';
import { interventoToRigaStorico, manualeToRigaStorico, ordinaRighe, filtraManualiInMemoria, slicePagina } from '@/lib/interventi/storico/normalizza';
import type { InterventoStoricoRow, ManualeStoricoRow, RigaStorico, RispostaStorico } from '@/lib/interventi/storico/types';

export const runtime = 'nodejs';

const PAGE_SIZE = 100;
const PAGE_DB = 1000;
const MAX_RIGHE = 5000;

const COLONNE_INT =
  'id, origine, committente, data, odl, pdr, matricola_contatore, nominativo, indirizzo, comune, cap, intervento_tipo, fascia_oraria, staff_id, stato, esito, esito_motivo';
const COLONNE_MAN =
  'id, committente, data, staff_id, staff_name, stato, motivo_rifiuto, intervento_id, dati_correnti, dati_operatore';

function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const oggi = oggiIso();
    const f = parseFiltriStorico(searchParams, oggi);
    const finestra = risolviFinestra(f, oggi);
    const qPulita = puliziaQ(f.q);

    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createRouteHandlerClient({ cookies: cookieMethods });

    const staffNames = new Map<string, string>();
    const { data: staffRows } = await supabase.from('staff').select('id, display_name');
    for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) {
      staffNames.set(s.id, s.display_name);
    }

    let troncato = false;
    const righe: RigaStorico[] = [];

    // --- interventi (programmati + manuali promossi) ---
    if (interrogaInterventi(f)) {
      for (let offset = 0; offset < MAX_RIGHE; offset += PAGE_DB) {
        let q = supabase
          .from('interventi')
          .select(COLONNE_INT)
          .order('data', { ascending: false })
          .order('comune', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_DB - 1);
        if (finestra.eq) q = q.eq('data', finestra.eq);
        if (finestra.gte) q = q.gte('data', finestra.gte);
        if (finestra.lte) q = q.lte('data', finestra.lte);
        if (f.committente) q = q.eq('committente', f.committente);
        if (f.stato) q = q.eq('stato', f.stato);
        if (f.esito) q = q.eq('esito', f.esito);
        if (f.esecutore) q = q.eq('staff_id', f.esecutore);
        if (f.comune) q = q.ilike('comune', `%${puliziaQ(f.comune)}%`);
        if (qPulita) {
          q = q.or(
            `odl.ilike.%${qPulita}%,indirizzo.ilike.%${qPulita}%,matricola_contatore.ilike.%${qPulita}%,pdr.ilike.%${qPulita}%,nominativo.ilike.%${qPulita}%`,
          );
        }
        const { data: batch, error } = await q;
        if (error) throw error;
        const rows = (batch ?? []) as unknown as InterventoStoricoRow[];
        for (const r of rows) righe.push(interventoToRigaStorico(r, staffNames));
        if (rows.length < PAGE_DB) break;
        if (offset + PAGE_DB >= MAX_RIGHE) { troncato = true; break; }
      }
    }

    // --- interventi_manuali non promossi (in_attesa/rifiutato/annullato) ---
    if (interrogaManuali(f)) {
      let q = supabase
        .from('interventi_manuali')
        .select(COLONNE_MAN)
        .is('intervento_id', null)
        .order('data', { ascending: false })
        .limit(MAX_RIGHE);
      if (finestra.eq) q = q.eq('data', finestra.eq);
      if (finestra.gte) q = q.gte('data', finestra.gte);
      if (finestra.lte) q = q.lte('data', finestra.lte);
      if (f.committente) q = q.eq('committente', f.committente);
      if (f.stato) q = q.eq('stato', f.stato);
      if (f.esecutore) q = q.eq('staff_id', f.esecutore);
      const { data: manRows, error } = await q;
      if (error) throw error;
      if ((manRows?.length ?? 0) >= MAX_RIGHE) troncato = true;
      const norm = ((manRows ?? []) as unknown as ManualeStoricoRow[]).map((r) => manualeToRigaStorico(r, staffNames));
      const filtrate = filtraManualiInMemoria(norm, qPulita, f.comune);
      righe.push(...filtrate);
    }

    const ordinate = ordinaRighe(righe);
    const total = ordinate.length;
    const pageRighe = slicePagina(ordinate, f.page, PAGE_SIZE);

    const risposta: RispostaStorico = { righe: pageRighe, total, troncato, pageSize: PAGE_SIZE };
    return NextResponse.json(risposta);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore caricamento storico.' },
      { status: 500 },
    );
  }
}
