import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireUser } from '@/lib/apiAuth';
import { parseRegole, buildRuleRows, buildLockRows } from './rulePayload';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const now = new Date();
    const isoFrom = from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const isoTo = to ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const { data: piani, error: ePiani } = await supabaseAdmin
      .from('mappa_piani')
      .select('id, data, territorio, note, stato, created_at, created_by, updated_by')
      .gte('data', isoFrom)
      .lte('data', isoTo)
      .order('data', { ascending: false });

    if (ePiani) throw new Error(ePiani.message);
    if (!piani || piani.length === 0) return NextResponse.json([]);

    const pianoIds = piani.map((p: any) => p.id);
    const { data: operatori, error: eOp } = await supabaseAdmin
      .from('mappa_piani_operatori')
      .select('piano_id, staff_id, staff_name, colore, km, task_count, start_address')
      .in('piano_id', pianoIds);

    if (eOp) throw new Error(eOp.message);

    const { data: regoleRows } = await supabaseAdmin
      .from('mappa_assegnazioni_manuali')
      .select('id, piano_id, staff_id, staff_name, filtro_ods, filtro_indirizzo, filtro_cap, filtro_attivita, max_interventi, ordine')
      .in('piano_id', pianoIds);
    const { data: lockRows } = await supabaseAdmin
      .from('mappa_piani_lucchetti')
      .select('piano_id, staff_id, aperto')
      .in('piano_id', pianoIds);

    // Raccogli tutti gli uuid autori (created_by e updated_by)
    const userIds = [
      ...new Set(
        piani.flatMap((p: any) => [p.created_by, p.updated_by].filter(Boolean))
      )
    ];

    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);
      (profiles ?? []).forEach((p: any) => {
        profileMap[p.id] = p.display_name ?? p.id;
      });
    }

    const result = piani.map((p: any) => ({
      ...p,
      operatori: (operatori ?? []).filter((o: any) => o.piano_id === p.id),
      regole: (regoleRows ?? []).filter((r: any) => r.piano_id === p.id),
      lucchetti: (lockRows ?? []).filter((l: any) => l.piano_id === p.id),
      created_by_name: p.created_by ? (profileMap[p.created_by] ?? 'Sconosciuto') : null,
      updated_by_name: p.updated_by ? (profileMap[p.updated_by] ?? 'Sconosciuto') : null,
    }));

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[GET /api/mappa/piani]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { data: isoData, territorio, note, stato = 'bozza', operatori, regole, lucchetti } = body;

    if (!isoData) {
      return NextResponse.json({ error: 'Campo data obbligatorio' }, { status: 400 });
    }
    if (!operatori || !Array.isArray(operatori) || operatori.length === 0) {
      return NextResponse.json({ error: 'Campo operatori obbligatorio' }, { status: 400 });
    }

    // Recupera l'utente autenticato
    const cookieStore = await cookies();
    const supabaseBrowser = createRouteHandlerClient({
      cookies: () => cookieStore as any,
    });
    const { data: { user } } = await supabaseBrowser.auth.getUser();
    const userId = user?.id ?? null;

    const { data: piano, error: ePiano } = await supabaseAdmin
      .from('mappa_piani')
      .insert({
        data: isoData,
        territorio: territorio ?? null,
        note: note ?? null,
        stato,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single();

    if (ePiano) throw new Error(ePiano.message);

    const pianoId = piano.id;

    const opRows = operatori.map((op: any) => ({
      piano_id: pianoId,
      staff_id: String(op.staff_id),
      staff_name: String(op.staff_name),
      colore: String(op.colore ?? '#2563EB'),
      km: Number(op.km ?? 0),
      task_count: Number(op.task_count ?? 0),
      start_address: op.start_address ?? null,
      tasks: op.tasks ?? [],
      polyline: op.polyline ?? [],
    }));

    const { error: eOp } = await supabaseAdmin
      .from('mappa_piani_operatori')
      .insert(opRows);

    if (eOp) throw new Error(eOp.message);

    // Regole di assegnazione manuale + lucchetti per-operatore
    const ruleRows = buildRuleRows(pianoId, parseRegole(regole));
    if (ruleRows.length > 0) {
      const { error: eRules } = await supabaseAdmin.from('mappa_assegnazioni_manuali').insert(ruleRows);
      if (eRules) console.error('[POST /api/mappa/piani] regole:', eRules.message);
    }
    const lockRows = buildLockRows(pianoId, lucchetti);
    if (lockRows.length > 0) {
      const { error: eLocks } = await supabaseAdmin.from('mappa_piani_lucchetti').insert(lockRows);
      if (eLocks) console.error('[POST /api/mappa/piani] lucchetti:', eLocks.message);
    }

    // Aggiorna contatori nel cronoprogramma
    const distribuzioniRows = operatori.map((op: any) => ({
      staff_id: String(op.staff_id),
      data: isoData,
      task_count: Number(op.task_count ?? 0),
      updated_at: new Date().toISOString(),
    }));

    const { error: eDist } = await supabaseAdmin
      .from('mappa_distribuzioni')
      .upsert(distribuzioniRows, { onConflict: 'staff_id,data' });

    if (eDist) console.error('[POST /api/mappa/piani] upsert distribuzioni:', eDist.message);

    return NextResponse.json({ ok: true, id: pianoId });
  } catch (err: any) {
    console.error('[POST /api/mappa/piani]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });

    const { data: piano } = await supabaseAdmin
      .from('mappa_piani')
      .select('data')
      .eq('id', id)
      .single();

    if (!piano) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });

    const { data: operatori } = await supabaseAdmin
      .from('mappa_piani_operatori')
      .select('staff_id')
      .eq('piano_id', id);

    if (operatori && operatori.length > 0) {
      await supabaseAdmin
        .from('mappa_distribuzioni')
        .update({ task_count: 0, updated_at: new Date().toISOString() })
        .in('staff_id', operatori.map((o: any) => o.staff_id))
        .eq('data', (piano as any).data);
    }

    // Elimina anche gli interventi creati da questo piano, altrimenti restano orfani
    // e visibili in torre. interventi.piano_id ha ON DELETE SET NULL: vanno cancellati
    // PRIMA del piano (dopo non sarebbero più trovabili per piano_id).
    const { error: eInt } = await supabaseAdmin.from('interventi').delete().eq('piano_id', id);
    if (eInt) throw new Error(eInt.message);

    const { error } = await supabaseAdmin
      .from('mappa_piani')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[DELETE /api/mappa/piani]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { id, data: isoData, territorio, note, stato = 'confermato', operatori, regole, lucchetti } = body;

    if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 });
    if (!isoData) return NextResponse.json({ error: 'Campo data obbligatorio' }, { status: 400 });
    if (!operatori || !Array.isArray(operatori) || operatori.length === 0) {
      return NextResponse.json({ error: 'Campo operatori obbligatorio' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabaseBrowser = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user } } = await supabaseBrowser.auth.getUser();
    const userId = user?.id ?? null;

    const { data: existing, error: eFind } = await supabaseAdmin
      .from('mappa_piani').select('id').eq('id', id).maybeSingle();
    if (eFind) throw new Error(eFind.message);
    if (!existing) return NextResponse.json({ error: 'Piano non trovato' }, { status: 404 });

    // Aggiorna la testata mantenendo lo stesso piano_id (i rapportini collegati restano validi).
    // `territorio` è NOT NULL: NON sovrascriverlo con null (es. riapertura piano senza filtro
    // territorio attivo nella UI) → si preserva il valore già salvato.
    const headerUpdate: Record<string, unknown> = { data: isoData, note: note ?? null, stato, updated_by: userId };
    if (territorio != null) headerUpdate.territorio = territorio;
    const { error: eUpd } = await supabaseAdmin
      .from('mappa_piani')
      .update(headerUpdate)
      .eq('id', id);
    if (eUpd) throw new Error(eUpd.message);

    // Rigenera gli operatori del piano
    await supabaseAdmin.from('mappa_piani_operatori').delete().eq('piano_id', id);
    const opRows = operatori.map((op: any) => ({
      piano_id: id,
      staff_id: String(op.staff_id),
      staff_name: String(op.staff_name),
      colore: String(op.colore ?? '#2563EB'),
      km: Number(op.km ?? 0),
      task_count: Number(op.task_count ?? 0),
      start_address: op.start_address ?? null,
      tasks: op.tasks ?? [],
      polyline: op.polyline ?? [],
    }));
    const { error: eOp } = await supabaseAdmin.from('mappa_piani_operatori').insert(opRows);
    if (eOp) throw new Error(eOp.message);

    // Rigenera regole e lucchetti
    await supabaseAdmin.from('mappa_assegnazioni_manuali').delete().eq('piano_id', id);
    const ruleRows = buildRuleRows(id, parseRegole(regole));
    if (ruleRows.length > 0) {
      const { error: eRules } = await supabaseAdmin.from('mappa_assegnazioni_manuali').insert(ruleRows);
      if (eRules) console.error('[PUT /api/mappa/piani] regole:', eRules.message);
    }
    await supabaseAdmin.from('mappa_piani_lucchetti').delete().eq('piano_id', id);
    const lockRows = buildLockRows(id, lucchetti);
    if (lockRows.length > 0) {
      const { error: eLocks } = await supabaseAdmin.from('mappa_piani_lucchetti').insert(lockRows);
      if (eLocks) console.error('[PUT /api/mappa/piani] lucchetti:', eLocks.message);
    }

    // Aggiorna i contatori nel cronoprogramma
    const distribuzioniRows = operatori.map((op: any) => ({
      staff_id: String(op.staff_id),
      data: isoData,
      task_count: Number(op.task_count ?? 0),
      updated_at: new Date().toISOString(),
    }));
    const { error: eDist } = await supabaseAdmin
      .from('mappa_distribuzioni').upsert(distribuzioniRows, { onConflict: 'staff_id,data' });
    if (eDist) console.error('[PUT /api/mappa/piani] upsert distribuzioni:', eDist.message);

    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    console.error('[PUT /api/mappa/piani]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
