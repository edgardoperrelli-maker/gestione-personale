import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  normalizzaConfig,
  partizionaDaScaricare,
  type ConfigCeste,
  type MisuratoreDaScaricare,
} from './ceste';

/*
  Lo scarico dei misuratori in cesta, lato server.

  L'operatore chiude il rapportino, ha ancora i contatori in furgone e passa dal magazzino: è
  lì che gli si chiede in quale cesta li sta mettendo. Questo file risponde alle due domande
  del giro — «cosa deve scaricare?» e «l'ha scaricato» — e tiene fermo il vincolo che le rende
  sicure su un endpoint pubblico a token: chi è l'operatore lo dice il TOKEN, mai il client.
*/

const TABELLA = 'acqualatina_misuratori_rimossi';
const DA_SCARICARE = 'da_consegnare_deposito';
const SCARICATO = 'scaricato_deposito';

export type { MisuratoreDaScaricare };

export type Rapportino = { id: string; staff_name: string | null; data: string };

/**
 * Il rapportino appena chiuso appartiene alla commessa AcquaLatina?
 *
 * Il flowchart è esplicito — la domanda si fa SOLO su AcquaLatina — e la risposta non sta sul
 * rapportino: sta sul committente degli interventi delle sue voci. Un giro misto con anche una
 * sola voce AcquaLatina conta: i contatori d'acqua smontati sono in furgone lo stesso.
 */
export async function rapportinoAcqualatina(rapportinoId: string): Promise<boolean> {
  const { data: voci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('intervento_id')
    .eq('rapportino_id', rapportinoId)
    .not('intervento_id', 'is', null);
  const ids = ((voci ?? []) as Array<{ intervento_id: string | null }>)
    .map((v) => v.intervento_id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return false;

  // `limit(1)`: serve sapere SE ce n'è uno, non quanti sono.
  const { data } = await supabaseAdmin
    .from('interventi')
    .select('id')
    .eq('committente', 'acqualatina')
    .in('id', ids)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * I misuratori che quell'operatore ha ancora da scaricare, di qualunque data.
 *
 * Il legame operatore↔misuratore è `esecutore`, che alla chiusura del rapportino nasce da
 * `rapportini.staff_name` (vedi app/api/r/[token]/invia): stessa sorgente, confronto esatto.
 * Nome vuoto → nessuna riga, mai un filtro che cade e restituisce il magazzino intero.
 */
export async function misuratoriDaScaricare(esecutore: string | null): Promise<MisuratoreDaScaricare[]> {
  const nome = (esecutore ?? '').trim();
  if (!nome) return [];
  const { data, error } = await supabaseAdmin
    .from(TABELLA)
    // `cesta` si chiede pur non servendo qui: è il modo di accorgersi che la migration non è
    // ancora passata. Senza colonna la select fallisce, l'errore risale e la domanda allo
    // scarico non compare — meglio nessuna domanda che una conferma che poi non può scrivere.
    .select('id, matricola, odl, indirizzo, comune, data_esecuzione, cesta')
    .eq('esecutore', nome)
    .eq('stato', DA_SCARICARE)
    .order('data_esecuzione', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MisuratoreDaScaricare[];
}

/** L'intervallo delle ceste in magazzino. Tabella assente/non migrata → campo libero. */
export async function configCeste(): Promise<ConfigCeste> {
  const { data, error } = await supabaseAdmin
    .from('acqualatina_ceste')
    .select('numero_min, numero_max')
    .maybeSingle();
  // Best-effort: senza configurazione la modale chiede comunque il numero, a campo libero. Un
  // errore qui non deve impedire all'operatore di dichiarare lo scarico.
  if (error) return { numeroMin: null, numeroMax: null };
  return normalizzaConfig(data);
}

export type PayloadScarico = {
  mostra: boolean;
  oggi: MisuratoreDaScaricare[];
  arretrati: MisuratoreDaScaricare[];
  ceste: ConfigCeste;
};

const NIENTE: PayloadScarico = { mostra: false, oggi: [], arretrati: [], ceste: { numeroMin: null, numeroMax: null } };

/** Cosa mostrare all'operatore dopo l'invio. `mostra: false` = nessuna modale. */
export async function payloadScarico(rap: Rapportino): Promise<PayloadScarico> {
  if (!(await rapportinoAcqualatina(rap.id))) return NIENTE;
  const righe = await misuratoriDaScaricare(rap.staff_name);
  if (righe.length === 0) return NIENTE;
  const { oggi, arretrati } = partizionaDaScaricare(righe, rap.data);
  return { mostra: true, oggi, arretrati, ceste: await configCeste() };
}

/**
 * Registra lo scarico: scrive la cesta e porta lo stato a «scaricato deposito».
 *
 * Le DUE cose insieme, e di proposito: dichiarare la cesta È lo scarico a deposito — lo stato
 * esiste già nel vocabolario del registro (types/misuratori.ts) e inventarne un sesto per un
 * passaggio che sa già nominare sarebbe solo un altro stato da tenere allineato.
 *
 * Gli `id` che arrivano dal client sono un FILTRO, non un'autorizzazione: la scrittura è
 * comunque ancorata a `esecutore = <operatore del token>` e `stato = da_consegnare_deposito`,
 * quindi un id altrui o già scaricato non viene toccato. Il conteggio torna da quello che il
 * DB ha davvero scritto.
 */
export async function registraScarico(
  esecutore: string | null,
  ids: readonly string[],
  cesta: string,
): Promise<number> {
  const nome = (esecutore ?? '').trim();
  const valore = cesta.trim();
  const elenco = [...new Set(ids.map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (!nome || !valore || elenco.length === 0) return 0;

  let scritti = 0;
  // A blocchi: un `in(...)` lungo fa esplodere la query string (stessa medicina dell'import).
  for (let i = 0; i < elenco.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from(TABELLA)
      .update({ cesta: valore, stato: SCARICATO, updated_at: new Date().toISOString() })
      .in('id', elenco.slice(i, i + 200))
      .eq('esecutore', nome)
      .eq('stato', DA_SCARICARE)
      .select('id');
    if (error) throw new Error(error.message);
    scritti += (data ?? []).length;
  }
  return scritti;
}
