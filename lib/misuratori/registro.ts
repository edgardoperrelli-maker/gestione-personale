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

/**
 * Il registro ACEA porta anche il PDR; quello AcquaLatina ha il PALLET di riferimento
 * (il numero assegnato a cesta piena, con cui la riconsegna viaggia). Ognuno seleziona
 * le SUE colonne: chiedere una colonna che la tabella non ha fa fallire la query intera.
 */
function colonne(tabella: TabellaRegistro): string {
  return tabella === 'misuratori_rimossi'
    ? `${COLONNE_COMUNI}, pdr`
    : `${COLONNE_COMUNI}, pallet`;
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
  // `pdr` e `pallet` sempre presenti nella risposta: il client è lo stesso per i due registri,
  // e un campo assente diventerebbe `undefined` dove il tipo promette `| null`.
  const righe = ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => ({ pdr: null, pallet: null, ...r }));
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

  // Il pallet esiste solo sul registro AcquaLatina: sull'altro non c'è la colonna, e accettarlo
  // farebbe fallire l'update intero con un errore che parla di schema invece che di dominio.
  if ('pallet' in body) {
    if (tabella !== 'acqualatina_misuratori_rimossi') {
      return NextResponse.json({ error: 'pallet non previsto su questo registro' }, { status: 400 });
    }
    patch.pallet = typeof body.pallet === 'string' ? body.pallet.trim() || null : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from(tabella).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Assegnazione del pallet IN BLOCCO: il gesto vero è «la cesta è piena» — si selezionano i
 * misuratori che ci sono finiti dentro e si scrive su tutti il numero del pallet. `pallet`
 * vuoto o nullo TOGLIE l'assegnazione (correzione di un errore): l'assenza è uno stato
 * legittimo («ancora in cesta»), non serve un secondo verbo.
 */
export async function assegnaPallet(
  tabella: Extract<TabellaRegistro, 'acqualatina_misuratori_rimossi'>,
  ids: unknown,
  pallet: unknown,
) {
  const elenco = (Array.isArray(ids) ? ids : [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  if (elenco.length === 0) {
    return NextResponse.json({ error: 'Nessun misuratore selezionato.' }, { status: 400 });
  }
  const valore = typeof pallet === 'string' ? pallet.trim() || null : null;

  let aggiornati = 0;
  for (let i = 0; i < elenco.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from(tabella)
      .update({ pallet: valore, updated_at: new Date().toISOString() })
      .in('id', elenco.slice(i, i + 200))
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    aggiornati += (data ?? []).length;
  }
  return NextResponse.json({ ok: true, aggiornati, pallet: valore });
}
