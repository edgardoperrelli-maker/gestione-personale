import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { normMatricola } from '@/lib/limitazione/matricoleSimili';
import { escLike } from '@/lib/limitazione/leggiVerdettoEsecuzione';
import { censitoDaOrdine, prefissiMatricola, type OrdineCensito } from './censitiMassive';

/**
 * Il registro come censimento dei misuratori massive: le due letture che alimentano il "+".
 *
 * Solo gli APERTI, come le schede-comune (`comuniMassiveAperti`): il censimento è la coda di
 * lavoro, e un ordine che ACEA ha già chiuso non è un misuratore da lavorare oggi. Tiene anche
 * corta la copia che finisce sul telefono.
 */

const CAMPI = 'odl, matricola, impianto, via, civico, cap, comune, nominativo';
const PAGINA = 1000;

/** Un ODL per volta: più operazioni dello stesso ordine sono lo stesso passaggio sul posto. */
function perOdl(righe: readonly OrdineCensito[]): CensitoMisuratore[] {
  const visti = new Set<string>();
  const out: CensitoMisuratore[] = [];
  for (const r of righe) {
    if (!r.odl || visti.has(r.odl)) continue;
    if (String(r.matricola ?? '').trim() === '') continue;
    visti.add(r.odl);
    out.push(censitoDaOrdine(r));
  }
  return out;
}

const base = (db: SupabaseClient) =>
  db.from('acea_ordini').select(CAMPI).eq('famiglia', 'massive').eq('aperto', true);

/**
 * I candidati del registro che la matricola letta potrebbe ESSERE: se stessa e i suoi tronconi.
 *
 * È la lettura del percorso veloce — quello che si paga a ogni scansione andata a buon fine —
 * quindi è un `in` su `matricola_norm`, indicizzata, con una decina di valori: i prefissi
 * progressivi di ciò che si è letto (`prefissiMatricola`), perché l'export ACEA tronca in coda le
 * matricole lunghe e il registro ne conserva solo un pezzo.
 *
 * La decisione fra «trovato» e «forse intendevi» NON è qui: sta in `decidiRicercaMisuratore`, la
 * stessa regola che usa il campo offline.
 */
export async function candidatiMassivePerPrefisso(
  db: SupabaseClient,
  q: string,
): Promise<CensitoMisuratore[]> {
  const n = normMatricola(q);
  if (n === '') return [];
  const { data, error } = await base(db).in('matricola_norm', prefissiMatricola(n));
  if (error) throw error;
  return perOdl((data ?? []) as unknown as OrdineCensito[]);
}

/**
 * I candidati che CONTENGONO ciò che si è letto: il caso opposto al troncone — si legge un pezzo
 * di una matricola che il registro ha intera (prefisso variabile, `A023041` dentro `99A023041`).
 *
 * Si paga solo quando l'esatto non c'è, cioè sulla strada dei suggerimenti.
 */
export async function candidatiMassivePerContenimento(
  db: SupabaseClient,
  q: string,
): Promise<CensitoMisuratore[]> {
  const n = normMatricola(q);
  if (n === '') return [];
  const { data, error } = await base(db).ilike('matricola_norm', `%${escLike(n)}%`).limit(50);
  if (error) throw error;
  return perOdl((data ?? []) as unknown as OrdineCensito[]);
}

/** Tutto il censimento massive aperto, per la cache offline del telefono. */
export async function censimentoMassive(db: SupabaseClient): Promise<CensitoMisuratore[]> {
  const righe: OrdineCensito[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await base(db)
      .order('odl', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    const blocco = (data ?? []) as unknown as OrdineCensito[];
    righe.push(...blocco);
    if (blocco.length < PAGINA) break;
  }
  return perOdl(righe);
}

/**
 * Firma del censimento massive: quante righe aperte e quand'è l'ultimo aggiornamento.
 *
 * Entra nella versione della cache offline. `aggiornato_il` da solo non basterebbe — una chiusura
 * non tocca le righe rimaste — e il conteggio da solo nemmeno: insieme, un import che aggiunge,
 * chiude o corregge una riga fa cambiare la versione e il telefono riscarica.
 */
export async function firmaCensimentoMassive(db: SupabaseClient): Promise<string> {
  const { count } = await db
    .from('acea_ordini')
    .select('odl', { count: 'exact', head: true })
    .eq('famiglia', 'massive')
    .eq('aperto', true);
  const { data } = await db
    .from('acea_ordini')
    .select('aggiornato_il')
    .eq('famiglia', 'massive')
    .eq('aperto', true)
    .order('aggiornato_il', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultimo = (data as { aggiornato_il: string | null } | null)?.aggiornato_il ?? '';
  return `${count ?? 0}@${ultimo}`;
}
