import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { richiestaToIntervento } from '@/lib/interventi/manuali/richiestaToIntervento';
import { colonneAnagraficaVoce } from '@/lib/interventi/manuali/buildVoceManuale';
import { estraiMatricola } from '@/lib/interventi/manuali/estraiMatricola';
import { usernameFromEmail } from '@/lib/auth/usernameFromEmail';
import { fotoPresentiVerificate, pathMancanti } from '@/lib/interventi/manuali/verificaFotoStorage';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json()) as { dati_correnti?: DatiInterventoManuale; confermaDuplicato?: boolean; confermaFotoMancanti?: boolean };

  // Leggi la richiesta per ottenere il piano_id, staff_id, data, committente e
  // dati_correnti di default (servono prima del check atomico per costruire il record).
  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id, piano_id, staff_id, data, committente, dati_correnti')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const dati = (body.dati_correnti ?? richiesta.dati_correnti) as DatiInterventoManuale;
  const committente = (dati.committente ?? richiesta.committente) as CommittenteManuale;

  // ── CONTROLLO MATRICOLA DUPLICATA ────────────────────────────────────────────
  // Avvisa se esiste già un intervento APPROVATO con la stessa matricola e lo
  // stesso committente. Non bloccante: l'admin può forzare con confermaDuplicato.
  const matricola = estraiMatricola(dati);
  if (matricola && body.confermaDuplicato !== true) {
    const { data: dupRows } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, data, staff_name, deciso_da, deciso_at')
      .eq('stato', 'approvato')
      .eq('committente', committente)
      .eq('dati_correnti->anagrafica->>matricola', matricola)
      .neq('id', id)
      .order('deciso_at', { ascending: false });

    const dup = (dupRows ?? []) as Array<{ id: string; data: string | null; staff_name: string | null; deciso_da: string | null; deciso_at: string | null }>;
    if (dup.length > 0) {
      // Risolvi chi ha approvato (auth.users: profiles è vuota).
      const ids = new Set(dup.map((d) => d.deciso_da).filter((v): v is string => !!v));
      const nomi: Record<string, string> = {};
      if (ids.size > 0) {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
        for (const u of authData?.users ?? []) {
          if (ids.has(u.id)) nomi[u.id] = usernameFromEmail(u.email) || u.id;
        }
      }
      const duplicati = dup.map((d) => ({
        id: d.id,
        data: d.data,
        staff_name: d.staff_name,
        deciso_at: d.deciso_at,
        deciso_da_name: d.deciso_da ? (nomi[d.deciso_da] ?? null) : null,
      }));
      return NextResponse.json({ error: 'matricola_duplicata', matricola, duplicati }, { status: 409 });
    }
  }

  // ── GATE FOTO MANCANTI (non bloccante, forzabile) ────────────────────────────
  if (body.confermaFotoMancanti !== true) {
    const { data: fotoRows } = await supabaseAdmin
      .from('interventi_manuali_foto')
      .select('storage_path')
      .eq('richiesta_id', id);
    const paths = ((fotoRows ?? []) as Array<{ storage_path: string }>).map((f) => f.storage_path);
    if (paths.length > 0) {
      const presenti = await fotoPresentiVerificate(paths);
      const mancanti = pathMancanti(paths, presenti);
      if (mancanti.length > 0) {
        return NextResponse.json({ error: 'foto_mancanti', mancanti: mancanti.length }, { status: 409 });
      }
    }
  }

  // ── CHECK-AND-SET ATOMICO ────────────────────────────────────────────────────
  // Aggiorna stato+dati_correnti+deciso_* SOLO se la riga è ancora in_attesa.
  // Se due admin premono "approva" contemporaneamente, solo il primo ottiene locked != null.
  const { data: locked } = await supabaseAdmin
    .from('interventi_manuali')
    .update({
      stato: 'approvato',
      dati_correnti: dati,
      deciso_da: user.id,
      deciso_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('stato', 'in_attesa')
    .select('*')
    .maybeSingle();
  if (!locked) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });

  // ── Crea l'intervento ────────────────────────────────────────────────────────
  const record = richiestaToIntervento(dati, {
    committente,
    data: (richiesta.data as string),
    staff_id: String(richiesta.staff_id ?? ''),
    piano_id: (richiesta.piano_id as string | null) ?? null,
  });

  const { data: intRow, error: eInt } = await supabaseAdmin
    .from('interventi')
    .insert(record)
    .select('id')
    .single();
  if (eInt) {
    // Compensazione: l'insert dell'intervento è fallito DOPO il check-and-set che ha già
    // marcato la richiesta 'approvato'. Senza rollback resta uno stato rotto irrecuperabile
    // (richiesta approvata + nessun intervento + voce bloccata 'in_attesa', e il guard
    // atomico impedisce la ri-approvazione). Ripristino lo stato → la richiesta torna
    // ri-approvabile dalla UI.
    await supabaseAdmin
      .from('interventi_manuali')
      .update({ stato: 'in_attesa', deciso_da: null, deciso_at: null })
      .eq('id', id);
    return NextResponse.json({ error: eInt.message }, { status: 500 });
  }

  // ── Aggiorna la voce (se presente) ──────────────────────────────────────────
  // Oltre a intervento_id + stato, riporta sulla voce l'anagrafica/risposte CORRETTE in
  // approvazione (es. PDR aggiunta, matricola corretta): vivono in `dati_correnti` e senza questo
  // il rapportino/PDF resterebbe col dato vecchio dell'operatore (matricola sbagliata, PDR mancante).
  if (richiesta.voce_id) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({
        intervento_id: intRow!.id,
        approvazione_stato: 'approvato',
        ...colonneAnagraficaVoce(dati),
      })
      .eq('id', richiesta.voce_id);
  }

  // ── Aggiorna interventi_manuali con l'intervento_id ─────────────────────────
  const { error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ intervento_id: intRow!.id })
    .eq('id', id);
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  return NextResponse.json({ ok: true, interventoId: intRow!.id });
}
