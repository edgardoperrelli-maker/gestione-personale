import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { RigaMaster } from './lookupMaster';

/**
 * Il censimento AcquaLatina che il campo consulta: la fonte è il REGISTRO
 * (`acqualatina_ordini`), non più `template_master_righe`.
 *
 * PERCHÉ È CAMBIATA (13/08/2026, ODL 12386221). `template_master_righe` è lo *staging*
 * dell'import: le righe del file così com'è arrivato. Il registro è quello che l'ufficio
 * guarda e corregge — ci finiscono le correzioni anagrafiche del sync, l'adozione della
 * matricola sulle righe entrate senza, la pianificazione. Cercare sullo staging significava
 * cercare su una fotografia scaduta, e sull'ODL 12386221 è successo tutto insieme:
 *
 *   · a registro: ODL 12386221, matricola 309532, VIA APPIA 130 Terracina, aperto;
 *   · nei master ATTIVI: l'ODL c'è (file «1BATTENTE», che porta gli ordini del sito e non le
 *     matricole: 499 righe su 499 senza) ma con matricola vuota, e le righe senza matricola
 *     non sono censimento; la 309532 stava solo nelle copie SPENTE del master di luglio.
 *
 * Risultato in campo: «Misuratore non censito. Non eseguire l'intervento», su un ordine che
 * l'ufficio vedeva aperto nella sua lista. Con il registro come fonte il campo e l'ufficio
 * guardano lo stesso dato, e accendere o spegnere un file master non cambia più cosa la
 * squadra riesce a trovare.
 *
 * Resta fuori la riga di registro SENZA matricola (10 su 4.205 al 13/08): non è censimento,
 * è un ordine che aspetta ancora di sapere quale contatore c'è sotto. La conferma in campo si
 * gioca sulla matricola («sul contatore c'è scritto…?») e su una riga vuota non avrebbe niente
 * da chiedere — quel caso è materia dell'ufficio, e il blocco è il modo giusto di dirlo.
 */

const PAGINA = 1000;
/** L'indirizzo il registro lo tiene SPEZZATO (ordina per civico numerico): si ricompone qui. */
const CAMPI = 'odl, matricola, via, civico, comune, cap';

/** Escapa i metacaratteri ilike (% _ \) così l'input utente non agisce da wildcard. */
export function escLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

const t = (v: unknown): string => String(v ?? '').trim();

const riga = (r: Record<string, unknown>): RigaMaster => ({
  odl: t(r.odl),
  matricola: t(r.matricola),
  indirizzo: [t(r.via), t(r.civico)].filter(Boolean).join(' '),
  comune: t(r.comune),
  cap: t(r.cap),
});

/**
 * Filtro comune a tutte le letture del censimento: le righe del registro con una matricola vera.
 *
 * Le righe senza matricola sono STRINGHE VUOTE, non NULL (i battenti del sito entrano così):
 * servono entrambe le condizioni, come sullo staging da cui questa lettura viene.
 */
function righeCensite() {
  return supabaseAdmin
    .from('acqualatina_ordini')
    .select(CAMPI)
    .not('matricola', 'is', null)
    .neq('matricola', '');
}

/**
 * Candidati per la ricerca. Tre fonti unite:
 *  (a) pre-filtro SQL ilike '%q%' sulla MATRICOLA = "candidato contiene q" — copre il prefisso
 *      variabile del catalogo (q=A023041 trova 99A023041) restando leggero sul dataset intero;
 *  (b) pre-filtro SQL ilike '%q%' sull'ODL — l'operatore ha in mano il battente, e il numero
 *      che ci legge sopra è l'ordine, non la matricola. Senza questa riga il gradino «ODL
 *      esatto» di `lookupMaster` non avrebbe mai una riga su cui scattare;
 *  (c) campione ordinato (fino a 2000) per il caso inverso "q contiene candidato".
 * Il taglio e l'ordine li decide `lookupMaster`; qui si raccoglie soltanto.
 *
 * Il campione (c) è un TETTO: con più righe di così non copre tutto il registro, quindi il caso
 * "q contiene candidato" può sfuggire su matricole fuori campione. È lo stesso compromesso della
 * ricerca ACEA, e non indebolisce il blocco: (a) e (b) girano su tutto il dataset, e i match che
 * decidono i gradini 1–3 — matricola normalizzata e ODL esatto — passano sempre da lì.
 */
export async function candidatiPerRicerca(q: string): Promise<RigaMaster[]> {
  const query = q.trim();
  if (query === '') return [];
  const like = `%${escLike(query)}%`;
  const [perMatricola, perOdl, campione] = await Promise.all([
    righeCensite().ilike('matricola', like).limit(50),
    righeCensite().ilike('odl', like).limit(50),
    righeCensite().order('matricola', { ascending: true }).limit(2000),
  ]);
  const perChiave = new Map<string, RigaMaster>();
  for (const r of [
    ...(perMatricola.data ?? []),
    ...(perOdl.data ?? []),
    ...(campione.data ?? []),
  ] as Array<Record<string, unknown>>) {
    const m = riga(r);
    perChiave.set(`${m.odl}|${m.matricola}`, m);
  }
  return [...perChiave.values()];
}

/** Proiezione COMPLETA per la cache offline (paginata: PostgREST tronca a 1000). */
export async function proiezioneCompleta(): Promise<RigaMaster[]> {
  const out: RigaMaster[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await righeCensite()
      .order('id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    out.push(...batch.map(riga));
    if (batch.length < PAGINA) break;
  }
  return out;
}

/** UNA pagina della proiezione, per il download col progresso. */
export async function paginaCensimento(from: number, to: number): Promise<RigaMaster[]> {
  const { data, error } = await righeCensite().order('id', { ascending: true }).range(from, to);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(riga);
}

/** Quante righe di censimento ha la commessa: il `total` della barra di avanzamento. */
export async function totaleCensimento(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('acqualatina_ordini')
    .select('id', { count: 'exact', head: true })
    .not('matricola', 'is', null)
    .neq('matricola', '');
  return count ?? 0;
}

/**
 * Versione della cache: `<righe>:<max(aggiornato_il) del registro>`.
 *
 * Il conteggio da solo NON basta: un sync di sole CORREZIONI — l'anagrafica che il committente
 * ha sistemato, la matricola adottata da una riga entrata senza — non cambia il numero di righe,
 * e il campo continuerebbe a lavorare sul dato vecchio senza accorgersene. `aggiornato_il` si
 * muove a ogni UPDATE grazie al trigger `acqualatina_ordini_set_aggiornato_il` (migration
 * `20260813090000`): senza quel trigger questa riga qui sarebbe una bugia.
 */
export async function versioneCensimento(): Promise<string> {
  const totale = await totaleCensimento();
  if (totale === 0) return '0:0';
  const { data } = await supabaseAdmin
    .from('acqualatina_ordini')
    .select('aggiornato_il')
    .not('matricola', 'is', null)
    .neq('matricola', '')
    .order('aggiornato_il', { ascending: false })
    .limit(1)
    .maybeSingle();
  return `${totale}:${(data as { aggiornato_il?: string } | null)?.aggiornato_il ?? '0'}`;
}
