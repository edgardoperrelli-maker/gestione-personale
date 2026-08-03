import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isRimozioneTipo } from '@/lib/interventi/rimozioneMisuratore';
import { righeMisuratoriDaRimuovere } from '@/lib/interventi/misuratoriDaRimuovere';
import { ymdLocal } from '@/utils/date-it';
import type { TabellaRegistro } from './registro';

/*
  Ricalcolo del registro misuratori rimossi — il motore, UNO per le due commesse.

  Il gesto è lo stesso da tutt'e due le parti: si guarda il lavoro davvero chiuso in positivo
  e si ricostruisce il registro da lì. Prima esisteva solo per ACEA, dentro la sua route, e il
  registro AcquaLatina non aveva nessun modo di recuperare — la sua unica porta d'ingresso,
  l'upsert alla chiusura del rapportino, era per giunta murata da un indice parziale che
  `ON CONFLICT` non poteva agganciare (vedi 20260803120000): 212 interventi positivi, registro
  a zero, e nessun errore a dirlo perché non veniva letto.

  Copiare la route sarebbe stato il modo più rapido di far divergere di nuovo le due commesse:
  qui la differenza è dichiarata in una costante di quattro campi, e tutto il resto è lo stesso
  codice.

  Il ricalcolo è idempotente e in tre tempi — toglie ciò che non qualifica più, corregge le
  date, inserisce ciò che manca — e va bene rilanciarlo a vuoto.
*/

export type CommessaRegistro = {
  /** Tabella del registro: nome chiuso, mai concatenato da input utente. */
  tabella: TabellaRegistro;
  /** Valore di `interventi.committente` che appartiene a questa commessa. */
  committente: 'acea' | 'acqualatina';
  /**
   * ACEA ha un catalogo largo e solo alcune attività sono rimozioni: le altre — e in
   * particolare le rimozioni di impianti ABUSIVI — non devono entrare a magazzino.
   * AcquaLatina ha UNA attività ed è già una sostituzione, quindi ogni voce eseguita è per
   * definizione una rimozione. Stessa distinzione che fa il gancio dell'invio rapportino.
   */
  soloRimozioni: boolean;
  /** Il PDR è del gas: il registro AcquaLatina non ha nemmeno la colonna. */
  conPdr: boolean;
};

export const COMMESSA_ACEA: CommessaRegistro = {
  tabella: 'misuratori_rimossi',
  committente: 'acea',
  soloRimozioni: true,
  conPdr: true,
};

export const COMMESSA_ACQUALATINA: CommessaRegistro = {
  tabella: 'acqualatina_misuratori_rimossi',
  committente: 'acqualatina',
  soloRimozioni: false,
  conPdr: false,
};

export type EsitoSync = { inseriti: number; rimossi: number; aggiornati: number };

/** Errore con il messaggio del DB: la route lo traduce in 500, il motore non conosce HTTP. */
export class ErroreSync extends Error {}

const PAGINA = 1000;
/** `in(...)` con liste lunghe fa esplodere la query string: si va a blocchi, come l'import. */
const BLOCCO_IN = 200;

type InterventoQualificante = {
  id: string;
  data: string | null;
  chiuso_at: string | null;
  intervento_tipo: string | null;
};

/**
 * Gli interventi che QUALIFICANO oggi come rimozione positiva della commessa.
 *
 * La matricola NON si filtra qui: l'inserimento nasce da `rapportino_voci.matricola` (quel che
 * ha scritto l'operatore), che è una colonna DIVERSA da `interventi.matricola_contatore` —
 * filtrarla toglierebbe record legittimi. Il controllo vero è sul ramo di inserimento.
 *
 * Pre-filtro DB largo (`%rim%`, un superset) + classificazione precisa lato JS: intercetta sia
 * «Rimozione …» sia l'abbreviazione ACEA «Rim Mis/Mod radio…».
 */
async function interventiQualificanti(c: CommessaRegistro): Promise<InterventoQualificante[]> {
  const out: InterventoQualificante[] = [];
  // Paginato: il registro cresce e basta. Senza, PostgREST tronca a 1000 in SILENZIO — e qui
  // una troncatura non è una lista corta, è un set qualificante incompleto: al passo 3 il
  // ricalcolo cancellerebbe righe sane solo perché non le ha viste.
  for (let offset = 0; ; offset += PAGINA) {
    let q = supabaseAdmin
      .from('interventi')
      .select('id, data, chiuso_at, intervento_tipo')
      .eq('committente', c.committente)
      .eq('esito', 'eseguito_positivo')
      .order('id', { ascending: true })
      .range(offset, offset + PAGINA - 1);
    if (c.soloRimozioni) q = q.ilike('intervento_tipo', '%rim%');
    const { data, error } = await q;
    if (error) throw new ErroreSync(error.message);
    const blocco = (data ?? []) as InterventoQualificante[];
    out.push(...blocco);
    if (blocco.length < PAGINA) break;
  }
  return c.soloRimozioni ? out.filter((i) => isRimozioneTipo(i.intervento_tipo)) : out;
}

type RigaEsistente = { id: string; intervento_id: string | null; data_esecuzione: string | null };

async function registroCorrente(c: CommessaRegistro): Promise<RigaEsistente[]> {
  const out: RigaEsistente[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from(c.tabella)
      .select('id, intervento_id, data_esecuzione')
      .order('id', { ascending: true })
      .range(offset, offset + PAGINA - 1);
    if (error) throw new ErroreSync(error.message);
    const blocco = (data ?? []) as RigaEsistente[];
    out.push(...blocco);
    if (blocco.length < PAGINA) break;
  }
  return out;
}

export async function sincronizzaRegistro(c: CommessaRegistro): Promise<EsitoSync> {
  const interventi = await interventiQualificanti(c);
  const qualificanti = new Set(interventi.map((i) => i.id));

  // Data ESECUZIONE = la GIORNATA DI LAVORO dell'intervento (`data`), non `chiuso_at`.
  // `chiuso_at` è l'istante in cui il sistema ha chiuso la voce, e su un rapportino riaperto e
  // rispedito giorni dopo vale il giorno della rispedizione, non quello in cui il misuratore è
  // stato staccato. Con `chiuso_at` qui, il passo 2) qui sotto riscriveva a ogni sync la data
  // corretta con quella sbagliata: la correzione va tenuta allineata fra i due scrittori
  // (l'altro è `app/api/r/[token]/invia`).
  const dataEsecuzione = new Map(interventi.map((i) => [i.id, i.data]));

  const esistenti = await registroCorrente(c);
  const giaDentro = new Set(esistenti.map((r) => r.intervento_id).filter(Boolean));

  /*
    1) RIMOZIONE. Ogni riga il cui intervento non qualifica più esce, A PRESCINDERE dallo
    stato logistico: così il ricalcolo ripulisce anche le righe già avanzate (scaricato,
    verificato, consegnato) quando l'intervento è stato corretto da positivo a negativo o la
    rimozione riclassificata come impianto abusivo. Il guardrail «set qualificante vuoto →
    non rimuovere niente» sta dentro `righeMisuratoriDaRimuovere`.
  */
  let rimossi = 0;
  const daRimuovere = righeMisuratoriDaRimuovere(esistenti, qualificanti);
  if (daRimuovere.length > 0) {
    for (let i = 0; i < daRimuovere.length; i += BLOCCO_IN) {
      const { data, error } = await supabaseAdmin
        .from(c.tabella)
        .delete()
        .in('id', daRimuovere.slice(i, i + BLOCCO_IN))
        .select('id');
      if (error) throw new ErroreSync(error.message);
      rimossi += (data ?? []).length;
    }
  }

  /*
    2) CORREZIONE DELLA DATA. A differenza della rimozione, riscrivere `data_esecuzione` tocca
    un campo descrittivo e non il flusso logistico: si applica anche agli stati avanzati.
    Aggiornamento raggruppato per data di arrivo — le date distinte sono poche.
  */
  const daAggiornare = esistenti.filter(
    (r) =>
      r.intervento_id &&
      qualificanti.has(r.intervento_id) &&
      dataEsecuzione.get(r.intervento_id) &&
      r.data_esecuzione !== dataEsecuzione.get(r.intervento_id),
  );
  let aggiornati = 0;
  if (daAggiornare.length > 0) {
    const perData = new Map<string, string[]>();
    for (const r of daAggiornare) {
      const target = dataEsecuzione.get(r.intervento_id!)!;
      perData.set(target, [...(perData.get(target) ?? []), r.id]);
    }
    for (const [data_esecuzione, ids] of perData) {
      for (let i = 0; i < ids.length; i += BLOCCO_IN) {
        const { data, error } = await supabaseAdmin
          .from(c.tabella)
          .update({ data_esecuzione })
          .in('id', ids.slice(i, i + BLOCCO_IN))
          .select('id');
        if (error) throw new ErroreSync(error.message);
        aggiornati += (data ?? []).length;
      }
    }
  }

  // 3) INSERIMENTO: gli interventi qualificanti che il registro non ha ancora.
  const nuoviIds = interventi.map((i) => i.id).filter((id) => !giaDentro.has(id));
  if (nuoviIds.length === 0) return { inseriti: 0, rimossi, aggiornati };

  type Voce = {
    intervento_id: string;
    matricola: string | null;
    pdr: string | null;
    odl: string | null;
    via: string | null;
    comune: string | null;
    rapportino_id: string | null;
  };
  const voci: Voce[] = [];
  for (let i = 0; i < nuoviIds.length; i += BLOCCO_IN) {
    const { data, error } = await supabaseAdmin
      .from('rapportino_voci')
      .select('intervento_id, matricola, pdr, odl, via, comune, rapportino_id')
      .in('intervento_id', nuoviIds.slice(i, i + BLOCCO_IN));
    if (error) throw new ErroreSync(error.message);
    voci.push(...((data ?? []) as Voce[]));
  }

  // L'esecutore è il nome sul rapportino: la voce porta solo l'id.
  const rapIds = [...new Set(voci.map((v) => v.rapportino_id).filter((x): x is string => Boolean(x)))];
  const esecutore = new Map<string, string | null>();
  for (let i = 0; i < rapIds.length; i += BLOCCO_IN) {
    const { data, error } = await supabaseAdmin
      .from('rapportini')
      .select('id, staff_name')
      .in('id', rapIds.slice(i, i + BLOCCO_IN));
    if (error) throw new ErroreSync(error.message);
    for (const r of (data ?? []) as Array<{ id: string; staff_name: string | null }>) {
      esecutore.set(r.id, r.staff_name);
    }
  }

  /*
    Cancello finale sulla matricola, lo stesso del gancio dell'invio: senza matricola non c'è
    misuratore da riconsegnare, e la colonna è NOT NULL.

    Poi UNA riga per intervento. L'unicità è su `intervento_id`, quindi due voci dello stesso
    intervento non produrrebbero comunque due righe — ma senza questo passaggio finirebbero
    entrambe nel payload e il conteggio racconterebbe un inserimento che non è avvenuto.
  */
  const vistiPerIntervento = new Set<string>();
  const daInserire = voci
    .filter((v) => v.intervento_id && v.matricola && v.matricola.trim())
    .filter((v) => {
      if (vistiPerIntervento.has(v.intervento_id)) return false;
      vistiPerIntervento.add(v.intervento_id);
      return true;
    })
    .map((v) => {
      const riga: Record<string, unknown> = {
        intervento_id: v.intervento_id,
        rapportino_id: v.rapportino_id ?? null,
        odl: v.odl ?? null,
        data_esecuzione: dataEsecuzione.get(v.intervento_id)!,
        esecutore: esecutore.get(v.rapportino_id ?? '') ?? null,
        indirizzo: v.via ?? null,
        comune: v.comune ?? null,
        matricola: v.matricola!.trim(),
      };
      if (c.conPdr) riga.pdr = v.pdr ?? null;
      return riga;
    });

  if (daInserire.length === 0) return { inseriti: 0, rimossi, aggiornati };

  // Il conteggio viene da ciò che il DB ha DAVVERO scritto (`select` dopo l'upsert), non dalla
  // lunghezza del payload: con `ignoreDuplicates` una riga già presente non entra, e dire
  // «inseriti 212» dopo averne scritti 3 è il tipo di numero su cui poi si prendono decisioni.
  let inseriti = 0;
  for (let i = 0; i < daInserire.length; i += 500) {
    const { data, error } = await supabaseAdmin
      .from(c.tabella)
      .upsert(daInserire.slice(i, i + 500), { onConflict: 'intervento_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new ErroreSync(error.message);
    inseriti += (data ?? []).length;
  }

  return { inseriti, rimossi, aggiornati };
}
