import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { COMMITTENTE_ACQUALATINA } from './contratto';
import type { RigaMaster } from './lookupMaster';

const PAGINA = 1000;
const CAMPI = 'odl, matricola, indirizzo, comune, cap';

/** Escapa i metacaratteri ilike (% _ \) così l'input utente non agisce da wildcard. */
export function escLike(v: string): string {
  return v.replace(/[%_\\]/g, '\\$&');
}

const riga = (r: Record<string, unknown>): RigaMaster => ({
  odl: String(r.odl ?? '').trim(),
  matricola: String(r.matricola ?? '').trim(),
  indirizzo: String(r.indirizzo ?? '').trim(),
  comune: String(r.comune ?? '').trim(),
  cap: String(r.cap ?? '').trim(),
});

/**
 * Filtro comune a tutte le letture del censimento: solo le righe dei master ATTIVI del
 * committente, e solo quelle con una matricola vera.
 *
 * Sul prod le righe senza matricola sono STRINGHE VUOTE, non NULL (6 su 8805 al 30/07):
 * servono entrambe le condizioni. L'ordine conta per il planner — `is not null` è il
 * predicato dell'indice parziale `template_master_righe_matricola_idx`, e `<> ''` lo
 * restringe senza renderlo inutilizzabile (un predicato più stretto lo implica ancora).
 */
function righeDeiMaster(masterIds: string[]) {
  return supabaseAdmin
    .from('template_master_righe')
    .select(CAMPI)
    .in('master_id', masterIds)
    .not('matricola', 'is', null)
    .neq('matricola', '');
}

/** Id dei file master ATTIVI del committente. Master spento (`attivo=false`) = fuori dal
 *  lookup senza cancellarne le righe: è la semantica dell'interruttore in
 *  /impostazioni/template-master, e va rispettata anche qui. */
export async function masterAttivi(committente = COMMITTENTE_ACQUALATINA): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('template_master')
    .select('id')
    .eq('committente', committente)
    .eq('attivo', true);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Candidati per la ricerca. Due fonti unite, come in /cerca-limitazione:
 *  (a) pre-filtro SQL ilike '%q%' = "candidato contiene q" — copre il prefisso variabile
 *      del master (q=A023041 trova 99A023041) restando leggero sul dataset intero;
 *  (b) campione ordinato (fino a 2000) per il caso inverso "q contiene candidato".
 * Il taglio e l'ordine li decide `lookupMaster`; qui si raccoglie soltanto.
 *
 * Il campione (b) è un TETTO: con più di 2000 righe per committente non copre tutto il
 * dataset, quindi il caso "q contiene candidato" può sfuggire su matricole fuori campione.
 * È lo stesso compromesso della ricerca ACEA, e non indebolisce il blocco: (a) gira su
 * tutto il dataset via indice, e il match normalizzato — che è quello che decide il
 * gradino 1 e 2 — passa sempre da lì.
 */
export async function candidatiPerRicerca(q: string, masterIds: string[]): Promise<RigaMaster[]> {
  if (masterIds.length === 0 || q.trim() === '') return [];
  const [like, campione] = await Promise.all([
    righeDeiMaster(masterIds).ilike('matricola', `%${escLike(q.trim())}%`).limit(50),
    righeDeiMaster(masterIds).order('matricola', { ascending: true }).limit(2000),
  ]);
  const perChiave = new Map<string, RigaMaster>();
  for (const r of [...(like.data ?? []), ...(campione.data ?? [])] as Array<Record<string, unknown>>) {
    const m = riga(r);
    perChiave.set(`${m.odl}|${m.matricola}`, m);
  }
  return [...perChiave.values()];
}

/** Proiezione COMPLETA per la cache offline (paginata: PostgREST tronca a 1000). */
export async function proiezioneCompleta(masterIds: string[]): Promise<RigaMaster[]> {
  if (masterIds.length === 0) return [];
  const out: RigaMaster[] = [];
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await righeDeiMaster(masterIds)
      .order('id', { ascending: true })
      .range(from, from + PAGINA - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    out.push(...batch.map(riga));
    if (batch.length < PAGINA) break;
  }
  return out;
}

/** UNA pagina della proiezione, per il download col progresso (Task 6). */
export async function paginaCensimento(masterIds: string[], from: number, to: number): Promise<RigaMaster[]> {
  if (masterIds.length === 0) return [];
  const { data, error } = await righeDeiMaster(masterIds)
    .order('id', { ascending: true })
    .range(from, to);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(riga);
}

/** Quante righe di censimento ha il committente: il `total` della barra di avanzamento. */
export async function totaleCensimento(masterIds: string[]): Promise<number> {
  if (masterIds.length === 0) return 0;
  const { count } = await supabaseAdmin
    .from('template_master_righe')
    .select('id', { count: 'exact', head: true })
    .in('master_id', masterIds)
    .not('matricola', 'is', null)
    .neq('matricola', '');
  return count ?? 0;
}

/**
 * Versione della cache: `<righe>:<max(updated_at) dei master attivi>`.
 *
 * Il conteggio da solo NON basta: ricaricare un master con lo stesso numero di righe — un
 * file corretto e ricaricato, il caso normale — lascerebbe la versione identica e il campo
 * continuerebbe a lavorare sul dato vecchio senza accorgersene. `/censimento` (ACEA) non ha
 * questo problema perché usa `max(id)` su una `bigserial`, che a ogni import cresce; qui
 * `template_master_righe.id` è un uuid e non dà nessun ordine temporale.
 *
 * `template_master.updated_at` è mantenuto dal trigger `template_master_set_updated_at` e si
 * muove a ogni modifica del file master, compreso l'interruttore `attivo`.
 */
export async function versioneCensimento(masterIds: string[]): Promise<string> {
  if (masterIds.length === 0) return '0:0';
  const { data } = await supabaseAdmin
    .from('template_master')
    .select('updated_at')
    .in('id', masterIds)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const stamp = (data as { updated_at?: string } | null)?.updated_at ?? '0';
  return `${await totaleCensimento(masterIds)}:${stamp}`;
}
