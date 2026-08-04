import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { STATI_MISURATORE, type StatoMisuratore } from '@/types/misuratori';
import { statoDopoCesta } from './cestaStato';
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
 * Il PALLET ora è di ENTRAMBI i registri (migrazione 20260803140000): il ciclo fisico è lo
 * stesso — si accumula in cesta, a cesta piena si va su un pallet, e quel numero è il
 * riferimento con cui la riconsegna viaggia. A restare solo di ACEA è il PDR, che è del gas;
 * solo di AcquaLatina è la CESTA, che l'operatore dichiara all'invio del rapportino.
 * Ognuno seleziona le SUE colonne: chiedere una colonna che la tabella non ha fa fallire la
 * query intera.
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
 */
function colonneOpzionali(tabella: TabellaRegistro): string[] {
  return tabella === 'misuratori_rimossi' ? ['pallet'] : ['pallet', 'cesta'];
}

/** Lo stato attuale della riga. `null` se non esiste: nessun chiamante deve dedurre niente. */
async function statoAttuale(tabella: TabellaRegistro, id: string): Promise<StatoMisuratore | null> {
  const { data } = await supabaseAdmin
    .from(tabella)
    .select('stato')
    .eq('id', id)
    .maybeSingle();
  return (data as { stato: StatoMisuratore } | null)?.stato ?? null;
}

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

  const { data, error } = await selectDegradante(colonne(tabella), colonneOpzionali(tabella), esegui);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // `pdr`, `pallet` e `cesta` sempre presenti nella risposta: il client è lo stesso per i due
  // registri, e un campo assente diventerebbe `undefined` dove il tipo promette `| null`.
  const righe = ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => ({ pdr: null, pallet: null, cesta: null, ...r }));
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
      const attuale = await statoAttuale(tabella, id);
      if (attuale) {
        const currIdx = (STATI_MISURATORE as readonly string[]).indexOf(attuale);
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

  // Il pallet vale su entrambi i registri dal 2026-08-03: la colonna c'è di qua e di là, e il
  // gesto («questa cesta è finita sul pallet N») è lo stesso per le due commesse.
  if ('pallet' in body) {
    patch.pallet = typeof body.pallet === 'string' ? body.pallet.trim() || null : null;
  }

  // La CESTA la scrive l'operatore dal campo; qui si CORREGGE. Un numero sbagliato dichiarato
  // di sera è un contatore che l'ufficio cerca nella cesta sbagliata: doverlo far correggere
  // dall'operatore, col rapportino ormai chiuso, sarebbe una porta murata. Solo AcquaLatina:
  // la tabella ACEA non ha la colonna e la UPDATE fallirebbe.
  if ('cesta' in body) {
    if (tabella !== 'acqualatina_misuratori_rimossi') {
      return NextResponse.json({ error: 'cesta non prevista su questo registro' }, { status: 400 });
    }
    patch.cesta = typeof body.cesta === 'string' ? body.cesta.trim() || null : null;

    /*
      Scrivere la cesta È dichiarare lo scarico, anche quando a scriverla è l'ufficio: il numero
      e lo stato devono dire la stessa cosa. Senza questo blocco la riga corretta a mano restava
      nel bacino della modale dell'operatore — che ne sovrascriveva il numero in silenzio — e la
      cesta SVUOTATA lasciava lo stato avanti, cioè un contatore che nessuno avrebbe più chiesto
      a nessuno.

      Lo stato ESPLICITO vince: quello implicito si applica solo se il corpo non ne porta uno.
      E non passa dal gate admin_plus di sopra, di proposito — chi può scrivere la cesta può
      disfare la propria scrittura, e chiedere un admin lascerebbe il buco aperto nel frattempo.
    */
    if (!('stato' in patch)) {
      // Riga inesistente: niente stato implicito, e l'UPDATE più sotto non aggancerà niente.
      const attuale = await statoAttuale(tabella, id);
      const implicito = attuale
        ? statoDopoCesta(attuale, patch.cesta as string | null)
        : null;
      if (implicito) patch.stato = implicito;
    }
  }

  /*
    L'altra faccia dell'invariante: dichiarare che il misuratore NON è in deposito toglie il
    numero di cesta, che a quel punto è falso — e un riferimento falso in magazzino costa più di
    un riferimento assente. È anche la porta da cui l'incoerenza è probabilmente entrata in
    produzione: un admin_plus che riporta indietro lo stato dalla tendina, e la cesta che resta
    scritta. Sul ritorno IMPLICITO qui sopra è un no-op: la cesta era già `null`.
  */
  if (patch.stato === 'da_consegnare_deposito' && tabella === 'acqualatina_misuratori_rimossi') {
    patch.cesta = null;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from(tabella).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  /*
    L'eco dei campi scritti. Il registro NON rifà la fetch quando il salvataggio riesce (scelta
    voluta: si aggiorna in ottimistica), quindi senza questa risposta lo stato mosso dalla cesta
    — e la cesta tolta dalla regressione — resterebbero invisibili fino al ricaricamento.
    Additiva: il registro ACEA passa dallo stesso handler e semplicemente non riceve mai la cesta.
  */
  const risposta: Record<string, unknown> = { ok: true };
  if (patch.stato !== undefined) risposta.stato = patch.stato;
  if (patch.cesta !== undefined) risposta.cesta = patch.cesta;
  return NextResponse.json(risposta);
}

/**
 * Assegnazione del pallet IN BLOCCO: il gesto vero è «la cesta è piena» — si selezionano i
 * misuratori che ci sono finiti dentro e si scrive su tutti il numero del pallet. `pallet`
 * vuoto o nullo TOGLIE l'assegnazione (correzione di un errore): l'assenza è uno stato
 * legittimo («ancora in cesta»), non serve un secondo verbo.
 */
export async function assegnaPallet(
  // Non più ristretta ad AcquaLatina: entrambe le tabelle hanno la colonna e lo stesso gesto.
  tabella: TabellaRegistro,
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
