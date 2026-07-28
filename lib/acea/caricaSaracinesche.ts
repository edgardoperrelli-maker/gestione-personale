import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { valoreSaracinesca } from '@/lib/limitazione/exportLimMassive';
import {
  isAttivitaSaracinesca, type Dichiarazione, type Famiglia, type OrdineSostituzione,
} from '@/lib/acea/saracinesche';
import { COMMITTENTI_ACEA } from '@/lib/acea/vociRapportino';

/**
 * Lettura delle due popolazioni del ciclo saracinesche. La logica sta tutta in `saracinesche.ts`:
 * qui si legge soltanto.
 *
 * La query PARTE dalle voci di rapportino, non dagli interventi: le voci con una chiave saracinesca
 * valorizzata sono poche centinaia, mentre lo storico completato è decine di migliaia di righe.
 * Guidarla dagli interventi significherebbe sfiorare il timeout della function a ogni apertura
 * della pagina.
 */

const PAGE = 1000;
const CHUNK = 200;
/**
 * Identificativi per richiesta quando si risolvono gli interventi.
 *
 * NON si alza per fare meno richieste: la lista di uuid finisce nella URL, e un uuid sono 37
 * caratteri. A 900 la richiesta superava i 33 KB e veniva rifiutata prima ancora di arrivare a
 * PostgREST — un `Bad Request` nudo, senza dettaglio, che ha portato giù la lettura dell'intero
 * registro. 200 stanno in ~7 KB, sotto il limite di qualunque proxy.
 *
 * Il risparmio di andate e ritorno si prende altrove: proiettando le colonne (payload) e tenendo
 * il risultato in memoria per un minuto, non allungando la URL.
 */
const CHUNK_ID = 200;

/**
 * Le dichiarazioni cambiano solo quando un operatore chiude un rapportino: non a ogni pagina.
 *
 * Senza questa memoria ogni caricamento della tabella rifaceva l'intero giro — scansione dei
 * rapportini più la risoluzione degli interventi — per un insieme che resta identico per ore. Un
 * minuto di ritardo su una spunta «SI» non cambia nessuna decisione; venti richieste in più a
 * ogni pagina si vedono tutte.
 */
const TTL_CACHE_MS = 60_000;
let cache: { odl: Set<string>; quando: number } | null = null;

/** Le due chiavi con cui i template salvano la saracinesca (storicamente divergenti). */
const CHIAVI = ['sostituzione_valvola', 'sost_valvola'] as const;

type VoceRow = { intervento_id: string | null; risposte: Record<string, unknown> | null };

async function vociConChiave(db: SupabaseClient, chiave: (typeof CHIAVI)[number]): Promise<VoceRow[]> {
  const out: VoceRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from('rapportino_voci')
      .select('intervento_id, risposte')
      .not(`risposte->>${chiave}`, 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as VoceRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * I soli ODL su cui un operatore ha DICHIARATO una saracinesca sostituita.
 *
 * Versione leggera di `caricaDichiarazioni` per chi deve solo sapere «questo ODL ce l'ha o no»:
 * la tabella del registro lo chiede a ogni pagina, e ricostruire nomi e agganci al registro
 * sarebbe lavoro buttato.
 *
 * La FONTE è questa e non `acea_master_snapshot.saracinesca`. Quella colonna è la fotografia del
 * vecchio foglio compilato a mano, e non concorda: dice SI su ordini dove una saracinesca non è
 * nemmeno contemplata — «Rimozione misuratore per morosità» — mentre l'operatore, nel rapportino,
 * non ha dichiarato niente. Il rapportino è la dichiarazione di chi c'è stato; il foglio è una
 * copia invecchiata, e usarlo riempiva la vista di righe che con le saracinesche non c'entrano.
 */
export async function odlConSaracinescaDichiarata(db: SupabaseClient): Promise<Set<string>> {
  const ora = Date.now();
  if (cache && ora - cache.quando < TTL_CACHE_MS) return cache.odl;

  /*
    Si scaricano SOLO i due valori estratti, non l'oggetto `risposte` intero.

    `risposte` pesa ~1,2 KB a riga e la tabella ne ha 11.000: chiederla tutta per leggerne due
    campi voleva dire trascinarsi megabyte di JSON a ogni caricamento della tabella. Con la
    proiezione il payload scende a poche decine di byte per riga.
  */
  const voci: VoceRow[] = [];
  for (const chiave of CHIAVI) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db
        .from('rapportino_voci')
        .select(`intervento_id, sostituzione_valvola:risposte->${CHIAVI[0]}, sost_valvola:risposte->${CHIAVI[1]}`)
        .not(`risposte->>${chiave}`, 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        intervento_id: string | null; sostituzione_valvola: unknown; sost_valvola: unknown;
      }>;
      voci.push(...rows.map((r) => ({
        intervento_id: r.intervento_id,
        risposte: { sostituzione_valvola: r.sostituzione_valvola, sost_valvola: r.sost_valvola },
      })));
      if (rows.length < PAGE) break;
    }
  }

  const ids = [...new Set(
    voci
      .filter((v) => v.intervento_id
        && valoreSaracinesca(v.risposte?.['sostituzione_valvola'], v.risposte?.['sost_valvola'])
          .toUpperCase() === 'SI')
      .map((v) => v.intervento_id as string),
  )];

  const odl = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK_ID) {
    const { data, error } = await db
      .from('interventi')
      .select('odl')
      // Solo interventi COMPLETATI: una dichiarazione su un intervento ancora aperto non è un
      // lavoro fatto, è un lavoro previsto.
      .eq('stato', 'completato')
      .not('odl', 'is', null)
      .in('committente', [...COMMITTENTI_ACEA])
      .in('id', ids.slice(i, i + CHUNK_ID));
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ odl: string | null }>) if (r.odl) odl.add(r.odl);
  }

  cache = { odl, quando: ora };
  return odl;
}

/** Famiglia di ripiego per una dichiarazione il cui ODL non è (ancora) nel registro. */
function famigliaDaGruppo(gruppo: string | null): Famiglia {
  return String(gruppo ?? '').toUpperCase().includes('MASSIV') ? 'massive' : 'dunning';
}

/**
 * Saracinesche dichiarate sostituite: una riga per intervento completato la cui voce dice SI.
 *
 * Impianto e famiglia arrivano dal registro tramite l'ODL; se l'ODL non c'è — l'export copre una
 * finestra, le dichiarazioni no — la riga resta, con la matricola dell'intervento e la famiglia
 * dedotta dal gruppo attività. Scartarla nasconderebbe proprio il lavoro più vecchio, che è quello
 * a credito da più tempo.
 */
export async function caricaDichiarazioni(db: SupabaseClient): Promise<Dichiarazione[]> {
  const voci = (await Promise.all(CHIAVI.map((k) => vociConChiave(db, k)))).flat();

  const conSi = voci.filter(
    (v) =>
      v.intervento_id
      && valoreSaracinesca(v.risposte?.['sostituzione_valvola'], v.risposte?.['sost_valvola'])
        .toUpperCase() === 'SI',
  );
  const ids = [...new Set(conSi.map((v) => v.intervento_id as string))];
  if (ids.length === 0) return [];

  type InterventoRow = {
    id: string; odl: string | null; data: string | null; comune: string | null;
    matricola_contatore: string | null; gruppo_attivita: string | null; staff_id: string | null;
  };
  const interventi: InterventoRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db
      .from('interventi')
      .select('id, odl, data, comune, matricola_contatore, gruppo_attivita, staff_id')
      .eq('stato', 'completato')
      .not('odl', 'is', null)
      .in('committente', [...COMMITTENTI_ACEA])
      .in('id', ids.slice(i, i + CHUNK));
    if (error) throw error;
    interventi.push(...((data ?? []) as InterventoRow[]));
  }
  if (interventi.length === 0) return [];

  // Nome dell'operatore: serve a chi deve andare a chiedere l'ordine, per sapere a chi domandare.
  const staffIds = [...new Set(interventi.map((i) => i.staff_id).filter((s): s is string => !!s))];
  const nomi = new Map<string, string | null>();
  for (let i = 0; i < staffIds.length; i += CHUNK) {
    const { data } = await db.from('staff').select('id, display_name').in('id', staffIds.slice(i, i + CHUNK));
    for (const s of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
      nomi.set(String(s.id), s.display_name ?? null);
    }
  }

  // Impianto e famiglia dal registro, per ODL.
  const odlUnici = [...new Set(interventi.map((i) => String(i.odl)).filter(Boolean))];
  type OrdineRow = { odl: string; impianto: string | null; matricola: string | null; famiglia: string | null };
  const registro = new Map<string, OrdineRow>();
  for (let i = 0; i < odlUnici.length; i += CHUNK) {
    const { data, error } = await db
      .from('acea_ordini')
      .select('odl, impianto, matricola, famiglia')
      .in('odl', odlUnici.slice(i, i + CHUNK));
    if (error) throw error;
    for (const r of (data ?? []) as OrdineRow[]) if (!registro.has(r.odl)) registro.set(r.odl, r);
  }

  return interventi.map((i) => {
    const reg = registro.get(String(i.odl));
    return {
      odl: String(i.odl),
      impianto: reg?.impianto ?? null,
      matricola: reg?.matricola ?? i.matricola_contatore ?? null,
      famiglia: (reg?.famiglia as Famiglia | undefined) ?? famigliaDaGruppo(i.gruppo_attivita),
      data: i.data ?? null,
      operatore: i.staff_id ? (nomi.get(i.staff_id) ?? null) : null,
      comune: i.comune ?? null,
    };
  });
}

/**
 * Ordini di sostituzione saracinesca presenti nel registro.
 *
 * Due `ilike` invece di un `or` composito, poi il filtro vero in memoria con la stessa funzione
 * pura che i test coprono: il database restringe, la decisione resta in un posto solo.
 */
export async function caricaOrdiniSostituzione(db: SupabaseClient): Promise<OrdineSostituzione[]> {
  type Riga = {
    odl: string; numero_operazione: string; attivita: string | null; famiglia: string | null;
    aperto: boolean; stato: string; data_creazione: string | null; comune: string | null;
    impianto: string | null; matricola: string | null;
  };
  const viste = new Map<string, Riga>();
  for (const pattern of ['%saracinesc%', '%valvol%']) {
    const { data, error } = await db
      .from('acea_ordini')
      .select('odl, numero_operazione, attivita, famiglia, aperto, stato, data_creazione, comune, impianto, matricola')
      .ilike('attivita', pattern);
    if (error) throw error;
    for (const r of (data ?? []) as Riga[]) viste.set(`${r.odl}|${r.numero_operazione}`, r);
  }

  return [...viste.values()]
    .filter((r) => isAttivitaSaracinesca(r.attivita))
    .map((r) => ({
      odl: r.odl,
      numero_operazione: r.numero_operazione,
      impianto: r.impianto,
      matricola: r.matricola,
      famiglia: (r.famiglia as Famiglia | null) ?? null,
      aperto: r.aperto === true,
      stato: r.stato,
      data_creazione: r.data_creazione,
      comune: r.comune,
    }));
}
