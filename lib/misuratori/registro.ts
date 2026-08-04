import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { STATI_MISURATORE } from '@/types/misuratori';
import { resolveAssignableRole } from '@/lib/moduleAccess';
import { selectDegradante } from '@/lib/rapportini/colonneOpzionali';

// Logica condivisa dei registri misuratori rimossi. ACEA e AcquaLatina hanno DUE
// tabelle (committenti, cicli logistici e responsabili diversi) ma gli STESSI stati e
// le stesse regole: la lettura filtra allo stesso modo e la regressione di stato è
// riservata ad admin_plus in entrambi. Il nome tabella è l'unico parametro.

/** Tabelle registro ammesse: nome chiuso, mai concatenato da input utente. */
export type TabellaRegistro = 'misuratori_rimossi' | 'acqualatina_misuratori_rimossi';

const COLONNE_COMUNI =
  'id, intervento_id, rapportino_id, odl, data_esecuzione, esecutore, indirizzo, comune, matricola, stato, note, created_at, updated_at';

/**
 * La CESTA è di ENTRAMBI i registri (migration 20260804090000): è il contenitore numerato con
 * cui la riconsegna viaggia, e il ciclo fisico è lo stesso per le due commesse — su ACEA la
 * colonna si chiamava `pallet` ed è la stessa, rinominata. A restare solo di ACEA è il PDR,
 * che è del gas. Ognuno seleziona le SUE colonne: chiedere una colonna che la tabella non ha
 * fa fallire la query intera.
 */
function colonne(tabella: TabellaRegistro): string {
  return tabella === 'misuratori_rimossi' ? `${COLONNE_COMUNI}, pdr` : COLONNE_COMUNI;
}

/**
 * Le colonne nate da migration recenti, dalla più vecchia alla più nuova.
 *
 * Si tolgono da destra man mano che la select fallisce: con il codice deployato prima della
 * migration il registro resta VIVO (senza quella colonna) invece di spegnersi tutto — una
 * select che nomina una colonna inesistente fallisce intera, non per campo. Stessa medicina
 * già usata per le colonne bozza del registro ACEA.
 *
 * Uguale per le due tabelle da quando il riferimento di magazzino è uno solo: `cesta` sta QUI
 * e non fra le comuni proprio per la finestra di deploy — su ACEA la colonna nasce da una
 * rinomina, e fra il codice nuovo e la migration applicata il registro deve restare leggibile.
 */
const COLONNE_OPZIONALI = ['cesta'];

/** GET del registro con i filtri di modulo (data, stato, comune, esecutore). */
export async function leggiRegistro(tabella: TabellaRegistro, url: string) {
  const { searchParams } = new URL(url);
  const dataInizio = searchParams.get('data_inizio');
  const dataFine = searchParams.get('data_fine');
  const stato = searchParams.get('stato');
  const comune = searchParams.get('comune');
  const esecutore = searchParams.get('esecutore');

  const esegui = (selezione: string) => {
    let query = supabaseAdmin
      .from(tabella)
      .select(selezione)
      .order('data_esecuzione', { ascending: false })
      .order('created_at', { ascending: false });

    if (dataInizio) query = query.gte('data_esecuzione', dataInizio);
    if (dataFine) query = query.lte('data_esecuzione', dataFine);
    if (stato) query = query.eq('stato', stato);
    if (comune) query = query.ilike('comune', `%${comune}%`);
    if (esecutore) query = query.eq('esecutore', esecutore);
    return query;
  };

  const { data, error } = await selectDegradante(colonne(tabella), COLONNE_OPZIONALI, esegui);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // `pdr` e `cesta` sempre presenti nella risposta: il client è lo stesso per i due registri,
  // e un campo assente diventerebbe `undefined` dove il tipo promette `| null`.
  const righe = ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => ({ pdr: null, cesta: null, ...r }));
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

  // La CESTA vale su entrambi i registri (2026-08-04): la colonna c'è di qua e di là — su ACEA
  // è quella che si chiamava `pallet` — e il gesto è lo stesso per le due commesse.
  // Su AcquaLatina la scrive l'OPERATORE dal campo e qui si CORREGGE: un numero sbagliato
  // dichiarato di sera è un contatore che l'ufficio cerca nella cesta sbagliata, e doverlo far
  // correggere dall'operatore col rapportino ormai chiuso sarebbe una porta murata.
  if ('cesta' in body) {
    patch.cesta = typeof body.cesta === 'string' ? body.cesta.trim() || null : null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from(tabella).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Assegnazione della cesta IN BLOCCO: si selezionano i misuratori che ci sono finiti dentro e
 * si scrive su tutti lo stesso numero. `cesta` vuota o nulla TOGLIE l'assegnazione (correzione
 * di un errore): l'assenza è uno stato legittimo («ancora in furgone»), non serve un secondo
 * verbo.
 *
 * Lo STATO non si tocca, ed è una scelta: qui si scrive un riferimento, mentre «dichiarare la
 * cesta È lo scarico a deposito» vale per l'operatore che ha i contatori in mano
 * (`lib/acqualatina/scaricoMisuratori`). L'ufficio che corregge un numero non sta dicendo che
 * quel contatore è appena arrivato in magazzino.
 */
export async function assegnaCesta(
  // Entrambe le tabelle hanno la colonna e lo stesso gesto.
  tabella: TabellaRegistro,
  ids: unknown,
  cesta: unknown,
) {
  const elenco = (Array.isArray(ids) ? ids : [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
  if (elenco.length === 0) {
    return NextResponse.json({ error: 'Nessun misuratore selezionato.' }, { status: 400 });
  }
  const valore = typeof cesta === 'string' ? cesta.trim() || null : null;

  let aggiornati = 0;
  for (let i = 0; i < elenco.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from(tabella)
      .update({ cesta: valore, updated_at: new Date().toISOString() })
      .in('id', elenco.slice(i, i + 200))
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    aggiornati += (data ?? []).length;
  }
  return NextResponse.json({ ok: true, aggiornati, cesta: valore });
}
