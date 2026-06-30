import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/apiAuth';
import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { sincronizzaRapportini } from '@/lib/interventi/sincronizzaRapportini';
import { recuperaTemplateIdPiano } from '@/lib/interventi/templatePiano';

export const runtime = 'nodejs';

type OpInput = {
  staff_id: string;
  staff_name?: string;
  colore?: string;
  km?: number;
  task_count?: number;
  start_address?: string | null;
  tasks?: unknown[];
  polyline?: unknown[];
};
type PianoInput = { id: string; operatori: OpInput[] };

/**
 * POST /api/mappa/piani/territorio — salva l'editing "intero territorio". Riceve gli operatori
 * GIÀ RIPARTITI per piano d'origine ({ piani: [{ id, operatori }] }) e li riscrive piano per
 * piano: le pianificazioni restano distinte (giorno/territorio/rapportini invariati). Un intervento
 * trascinato tra operatori di piani diversi segue l'operatore di destinazione → finisce nel suo
 * piano.
 *
 * Gli interventi della torre vengono rigenerati per TUTTI i piani in DUE passate: la prima cancella
 * gli interventi non-terminali dei task ceduti (libera gli ODL), la seconda li ricrea nel piano di
 * destinazione, ora che l'ODL non è più "occupato" da un altro piano. Due passate bastano: a fine
 * prima passata ogni piano ha già rilasciato gli ODL che non possiede più, quindi nella seconda ogni
 * piano destinatario vede gli ODL liberi e li può reclamare — rispettando l'indice unico globale
 * `interventi_dedup_idx (committente, odl, data)`. Infine si risincronizzano le voci dei rapportini
 * di ciascun piano (gli inviati non vengono toccati: skipInviati).
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.id;

    const body = (await req.json().catch(() => ({}))) as { piani?: PianoInput[] };
    const pianiInput = Array.isArray(body.piani) ? body.piani : [];
    if (pianiInput.length === 0) {
      return NextResponse.json({ error: 'Nessuna pianificazione fornita.' }, { status: 400 });
    }

    const ids = pianiInput
      .map((p) => p.id)
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    const { data: pianiRows, error: ePiani } = await supabaseAdmin
      .from('mappa_piani')
      .select('id, data, territorio')
      .in('id', ids);
    if (ePiani) throw new Error(ePiani.message);
    const pianoById = new Map(
      ((pianiRows ?? []) as { id: string; data: string; territorio: string | null }[]).map((p) => [p.id, p]),
    );

    const nowIso = new Date().toISOString();
    const pianiSalvati: string[] = [];

    // 1. Riscrivi operatori + distribuzioni per ogni piano. Testata invariata salvo updated_by/stato.
    //    Regole e lucchetti NON vengono toccati (preservati così com'erano).
    for (const p of pianiInput) {
      const piano = pianoById.get(p.id);
      const operatori = Array.isArray(p.operatori) ? p.operatori : [];
      // Piano inesistente o payload vuoto → non toccare (evita di svuotare un piano per errore).
      if (!piano || operatori.length === 0) continue;

      await supabaseAdmin
        .from('mappa_piani')
        .update({ updated_by: userId, stato: 'confermato' })
        .eq('id', p.id);

      await supabaseAdmin.from('mappa_piani_operatori').delete().eq('piano_id', p.id);
      const opRows = operatori.map((op) => ({
        piano_id: p.id,
        staff_id: String(op.staff_id),
        staff_name: String(op.staff_name ?? op.staff_id),
        colore: String(op.colore ?? '#2563EB'),
        km: Number(op.km ?? 0),
        task_count: Number(op.task_count ?? 0),
        start_address: op.start_address ?? null,
        tasks: op.tasks ?? [],
        polyline: op.polyline ?? [],
      }));
      const { error: eOp } = await supabaseAdmin.from('mappa_piani_operatori').insert(opRows);
      if (eOp) throw new Error(eOp.message);

      const distRows = operatori.map((op) => ({
        staff_id: String(op.staff_id),
        data: piano.data,
        task_count: Number(op.task_count ?? 0),
        updated_at: nowIso,
      }));
      const { error: eDist } = await supabaseAdmin
        .from('mappa_distribuzioni')
        .upsert(distRows, { onConflict: 'staff_id,data' });
      if (eDist) console.error('[POST /api/mappa/piani/territorio] distribuzioni:', eDist.message);

      pianiSalvati.push(p.id);
    }

    if (pianiSalvati.length === 0) {
      return NextResponse.json({ error: 'Nessuna pianificazione valida da salvare.' }, { status: 400 });
    }

    // 2. Rigenerazione interventi in DUE passate su TUTTI i piani salvati (vedi nota in testa).
    let creati = 0;
    let preservati = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const id of pianiSalvati) {
        const ens = await ensureInterventiForPiano(supabaseAdmin, id);
        if (pass === 1) {
          creati += ens.creati;
          preservati += ens.preservati;
        }
        if (ens.error) console.error('[POST /api/mappa/piani/territorio] ensure', id, ens.error);
      }
    }

    // 3. Sync voci rapportini per ciascun piano con template stabilito (inviati non toccati).
    const warnings: string[] = [];
    for (const id of pianiSalvati) {
      const templateId = await recuperaTemplateIdPiano(supabaseAdmin, id);
      if (!templateId) continue;
      const sync = await sincronizzaRapportini(supabaseAdmin, id, { templateId, skipInviati: true });
      if (!sync.ok) warnings.push(sync.error ?? `conflitto (${sync.status})`);
    }

    return NextResponse.json({
      ok: true,
      piani: pianiSalvati.length,
      creati,
      preservati,
      rapportiniWarning: warnings.length ? warnings.join('; ') : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/mappa/piani/territorio]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
