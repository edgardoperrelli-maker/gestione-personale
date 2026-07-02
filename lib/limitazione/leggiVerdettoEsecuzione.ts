// I/O: legge dal DB il verdetto "matricola già eseguita" (vedi verdettoEsecuzione.ts per la
// logica pura). Condiviso da due punti di blocco:
//  - GET /cerca-limitazione: blocco lato ricerca, mostra l'avviso all'operatore.
//  - POST /intervento-manuale: blocco lato server all'invio finale. Necessario perché il flusso
//    è offline-first (accodaManuale → sincronizzaToken): la ricerca può essere avvenuta molto
//    prima dell'invio effettivo (foto multiple da caricare, coda offline), quindi il verdetto
//    "non bloccato" ottenuto in ricerca può essere superato da un esito positivo registrato nel
//    frattempo. Senza questa ri-verifica un secondo "+" sulla stessa matricola entra comunque in
//    coda e dipende dalla revisione manuale per essere scartato (caso ODL 912215400).
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verdettoEsecuzione, type VerdettoEsecuzione } from './verdettoEsecuzione';

// Scope del blocco anti-duplicato: stesso cliente ACEA sotto due etichette
// ('acea' = interventi da ODL, 'lim_massive' = interventi caricati a mano dal "+").
export const COMMITTENTI_BLOCCO_ESECUZIONE = ['acea', 'lim_massive'];

/** Escapa i metacaratteri ilike (% _ \) così l'input utente non agisce da wildcard. */
export function escLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

/** Verdetto "già eseguita" per la matricola, fonte DB: un intervento ACEA con esito
 *  'eseguito_positivo' OPPURE una voce di rapportino con `eseguito = SI`, nello scope
 *  COMMITTENTI_BLOCCO_ESECUZIONE. Lo stato ordine (COMPLETATO) NON conta. Pre-filtro SQL
 *  ilike '%q%'; il match per matricola normalizzata e la regola "vince il positivo" sono
 *  in verdettoEsecuzione. */
export async function leggiVerdettoEsecuzione(q: string): Promise<VerdettoEsecuzione> {
  const like = `%${escLike(q)}%`;
  // Le due fonti sono indipendenti → in parallelo.
  const [intRes, vociRes] = await Promise.all([
    supabaseAdmin.from('interventi')
      .select('odl, matricola_contatore, data')
      .in('committente', COMMITTENTI_BLOCCO_ESECUZIONE)
      // ATTENZIONE: questo filtro è ciò che garantisce "lo STATO COMPLETATO non blocca": un
      // intervento completato con esito negativo NON entra qui. NON allargare a `stato` o ad
      // altri esiti, o si reintroduce il falso blocco sui completati-negativi.
      .eq('esito', 'eseguito_positivo')
      .ilike('matricola_contatore', like).limit(100),
    supabaseAdmin.from('rapportino_voci')
      .select('odl, matricola, risposte, interventi(committente)')
      .ilike('matricola', like).limit(100),
  ]);

  const interventiPositivi = ((intRes.data ?? []) as Array<{
    odl: string | null; matricola_contatore: string | null; data: string | null;
  }>).map((r) => ({ odl: r.odl, matricola_contatore: r.matricola_contatore, data: r.data }));

  // Una voce conta solo se l'intervento collegato è nello scope ACEA (committente via embedded FK).
  const voci = ((vociRes.data ?? []) as Array<{
    odl: string | null; matricola: string | null; risposte: Record<string, unknown> | null;
    interventi: { committente: string | null } | { committente: string | null }[] | null;
  }>)
    .filter((v) => {
      const c = Array.isArray(v.interventi) ? v.interventi[0]?.committente : v.interventi?.committente;
      return typeof c === 'string' && COMMITTENTI_BLOCCO_ESECUZIONE.includes(c);
    })
    .map((v) => ({ odl: v.odl, matricola: v.matricola, eseguito: String(v.risposte?.['eseguito'] ?? '') }));

  return verdettoEsecuzione(q, interventiPositivi, voci);
}
