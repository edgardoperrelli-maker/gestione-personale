// app/api/interventi/storico/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireUser } from '@/lib/apiAuth';
import { parseFiltriStorico, risolviFinestra, puliziaQ } from '@/lib/interventi/storico/filtri';
import { voceToRigaStorico, ordinaRighe, slicePagina } from '@/lib/interventi/storico/normalizza';
import type { VoceStoricoRow, RigaStorico, RispostaStorico } from '@/lib/interventi/storico/types';

export const runtime = 'nodejs';

const PAGE_SIZE = 100;
const PAGE_DB = 1000;
const MAX_RIGHE = 5000;

// rapportino_voci + rapportino padre embedded (inner: esclude voci senza rapportino).
const COLONNE =
  'id, odl, via, comune, matricola, nominativo, pdr, risposte, manuale, rapportini!inner(staff_id, staff_name, data)';

function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const oggi = oggiIso();
    const f = parseFiltriStorico(searchParams);
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

    // Lettura paginata di rapportino_voci (ordine stabile su id per enumerare tutto il set);
    // i filtri data/esecutore sono sul rapportino padre (embed inner), comune/q sulla voce.
    for (let offset = 0; offset < MAX_RIGHE; offset += PAGE_DB) {
      let q = supabase
        .from('rapportino_voci')
        .select(COLONNE)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_DB - 1);
      if (finestra.eq) q = q.eq('rapportini.data', finestra.eq);
      if (finestra.gte) q = q.gte('rapportini.data', finestra.gte);
      if (finestra.lte) q = q.lte('rapportini.data', finestra.lte);
      if (f.esecutore) q = q.eq('rapportini.staff_id', f.esecutore);
      if (f.comune) q = q.ilike('comune', `%${puliziaQ(f.comune)}%`);
      if (qPulita) {
        q = q.or(
          `odl.ilike.%${qPulita}%,via.ilike.%${qPulita}%,matricola.ilike.%${qPulita}%,nominativo.ilike.%${qPulita}%,pdr.ilike.%${qPulita}%`,
        );
      }
      const { data: batch, error } = await q;
      if (error) throw error;
      const rows = (batch ?? []) as unknown as VoceStoricoRow[];
      for (const r of rows) righe.push(voceToRigaStorico(r, staffNames));
      if (rows.length < PAGE_DB) break;
      if (offset + PAGE_DB >= MAX_RIGHE) { troncato = true; break; }
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
