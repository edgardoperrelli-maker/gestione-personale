import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { STATI_MISURATORE } from '@/types/misuratori';
import { resolveAssignableRole } from '@/lib/moduleAccess';

// Logica condivisa dei registri misuratori rimossi. ACEA e AcquaLatina hanno DUE
// tabelle (committenti, cicli logistici e responsabili diversi) ma gli STESSI stati e
// le stesse regole: la lettura filtra allo stesso modo e la regressione di stato è
// riservata ad admin_plus in entrambi. Il nome tabella è l'unico parametro.

/** Tabelle registro ammesse: nome chiuso, mai concatenato da input utente. */
export type TabellaRegistro = 'misuratori_rimossi' | 'acqualatina_misuratori_rimossi';

const COLONNE_COMUNI =
  'id, intervento_id, rapportino_id, odl, data_esecuzione, esecutore, indirizzo, comune, matricola, stato, note, created_at, updated_at';

/** Il registro ACEA porta anche il PDR; quello AcquaLatina non ha la colonna. */
function colonne(tabella: TabellaRegistro): string {
  return tabella === 'misuratori_rimossi' ? `${COLONNE_COMUNI}, pdr` : COLONNE_COMUNI;
}

/** GET del registro con i filtri di modulo (data, stato, comune, esecutore). */
export async function leggiRegistro(tabella: TabellaRegistro, url: string) {
  const { searchParams } = new URL(url);
  const dataInizio = searchParams.get('data_inizio');
  const dataFine = searchParams.get('data_fine');
  const stato = searchParams.get('stato');
  const comune = searchParams.get('comune');
  const esecutore = searchParams.get('esecutore');

  let query = supabaseAdmin
    .from(tabella)
    .select(colonne(tabella))
    .order('data_esecuzione', { ascending: false })
    .order('created_at', { ascending: false });

  if (dataInizio) query = query.gte('data_esecuzione', dataInizio);
  if (dataFine) query = query.lte('data_esecuzione', dataFine);
  if (stato) query = query.eq('stato', stato);
  if (comune) query = query.ilike('comune', `%${comune}%`);
  if (esecutore) query = query.eq('esecutore', esecutore);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // `pdr` sempre presente nella risposta: il client è lo stesso per i due registri.
  const righe = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ pdr: null, ...r }));
  return NextResponse.json(righe);
}

/**
 * PATCH di stato/note. La regressione nel flusso logistico (indietro) è consentita solo
 * ad admin_plus: la distinzione "plus" vive in app_metadata.role, non in profiles.
 */
export async function aggiornaRegistro(
  tabella: TabellaRegistro,
  id: string,
  body: Record<string, unknown>,
  appMetadata: unknown,
) {
  if (!id?.trim()) return NextResponse.json({ error: 'ID richiesto.' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('stato' in body) {
    if (!(STATI_MISURATORE as readonly string[]).includes(body.stato as string)) {
      return NextResponse.json({ error: 'stato non valido' }, { status: 400 });
    }
    const ruolo = (appMetadata as { role?: unknown } | null | undefined)?.role;
    if (resolveAssignableRole(null, ruolo as never) !== 'admin_plus') {
      const { data: corrente } = await supabaseAdmin
        .from(tabella)
        .select('stato')
        .eq('id', id)
        .maybeSingle();
      if (corrente) {
        const currIdx = (STATI_MISURATORE as readonly string[]).indexOf(corrente.stato);
        const newIdx = (STATI_MISURATORE as readonly string[]).indexOf(body.stato as string);
        if (newIdx < currIdx) {
          return NextResponse.json(
            { error: 'Solo Admin Plus può riportare indietro lo stato di un misuratore.' },
            { status: 403 },
          );
        }
      }
    }
    patch.stato = body.stato;
  }

  if ('note' in body) {
    patch.note = typeof body.note === 'string' ? body.note || null : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from(tabella).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
