import 'server-only';
import type { User } from '@supabase/supabase-js';

/**
 * Il client admin si carica a richiesta, non all'import: `lib/supabaseAdmin` costruisce il
 * client al primo `import`, e chi registra (es. `sincronizzaRapportini`) è coperto da test
 * unitari che girano senza chiavi Supabase. Caricarlo qui in cima li farebbe fallire tutti
 * al solo import, prima ancora di eseguire una riga.
 */
async function admin() {
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  return supabaseAdmin;
}

/**
 * Registro delle azioni per utenza (tabella `audit_azioni`, modulo Impostazioni › Log).
 *
 * Nasce dopo il 03/08/2026, quando un rapportino con una giornata di lavoro dentro è sparito
 * insieme al suo piano e non è stato possibile risalire a chi l'avesse cancellato. La regola
 * che ne deriva: ogni operazione che DISTRUGGE qualcosa dice prima cosa sta per distruggere.
 *
 * REGOLA D'ORO: registrare non deve mai far fallire l'operazione registrata. Ogni errore qui
 * finisce in console e viene ingoiato — un log che rompe il salvataggio di un piano è peggio
 * del log mancante.
 */

/** Nomi puntati e stabili: sono la chiave di ricerca del modulo, non cambiarli a cuor leggero. */
export type NomeAzione =
  | 'piano.crea'
  | 'piano.salva'
  | 'piano.elimina'
  | 'piano.residuo.elimina'
  | 'piano.operatore.rimuovi'
  | 'rapportino.orfano.elimina'
  | 'rapportino.conflitto.sostituisci';

export type AttoreAudit = {
  id: string | null;
  email: string | null;
};

export type AzioneAudit = {
  azione: NomeAzione;
  attore: AttoreAudit;
  entita?: string | null;
  entitaId?: string | null;
  esito?: 'ok' | 'errore';
  statoHttp?: number | null;
  /** Cosa è stato toccato: conteggi e identificativi. Non ricopiarci dentro interi record. */
  dettaglio?: Record<string, unknown>;
  /** Passa la Request per prendere metodo, percorso, IP e user agent senza ripeterli a mano. */
  req?: Request | null;
};

/** Estrae l'attore da quel che tornano `requireUser`/`requireAdmin`. */
export function attoreDa(user: User | null | undefined): AttoreAudit {
  return { id: user?.id ?? null, email: user?.email ?? null };
}

/**
 * Dietro il proxy di Vercel `request.ip` non c'è: l'originale sta in `x-forwarded-for`, dove il
 * primo valore della lista è il client e gli altri sono gli hop intermedi.
 */
function ipDa(req: Request | null | undefined): string | null {
  if (!req) return null;
  const inoltrato = req.headers.get('x-forwarded-for');
  if (inoltrato) return inoltrato.split(',')[0]?.trim() || null;
  return req.headers.get('x-real-ip');
}

function percorsoDa(req: Request | null | undefined): string | null {
  if (!req) return null;
  try {
    const url = new URL(req.url);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Scrive una riga nel registro. Non attende garanzie: se il database non risponde, l'azione
 * applicativa prosegue comunque.
 */
export async function registraAzione(input: AzioneAudit): Promise<void> {
  try {
    const db = await admin();
    const { error } = await db.from('audit_azioni').insert({
      utente_id: input.attore.id,
      utente_email: input.attore.email,
      azione: input.azione,
      entita: input.entita ?? null,
      entita_id: input.entitaId ?? null,
      esito: input.esito ?? 'ok',
      stato_http: input.statoHttp ?? null,
      metodo: input.req?.method ?? null,
      percorso: percorsoDa(input.req),
      dettaglio: input.dettaglio ?? {},
      ip: ipDa(input.req),
      user_agent: input.req?.headers.get('user-agent') ?? null,
    });
    if (error) console.error('[audit] insert fallita:', input.azione, error.message);
  } catch (err) {
    console.error('[audit] eccezione:', input.azione, err instanceof Error ? err.message : err);
  }
}

/**
 * Fotografa cosa si porterebbe via l'eliminazione di un piano PRIMA di eseguirla: dopo il
 * CASCADE quei numeri non sono più recuperabili da nessuna parte, ed è esattamente
 * l'informazione che serviva per l'incidente del 03/08.
 */
export async function fotografaPiano(pianoId: string): Promise<Record<string, unknown>> {
  try {
    const db = await admin();
    const [piano, rapportini, interventi] = await Promise.all([
      db.from('mappa_piani').select('data, territorio, stato').eq('id', pianoId).maybeSingle(),
      db.from('rapportini').select('id, staff_id, staff_name, stato').eq('piano_id', pianoId),
      db.from('interventi').select('id, stato').eq('piano_id', pianoId),
    ]);
    const righeInt = (interventi.data ?? []) as Array<{ stato: string }>;
    const righeRap = (rapportini.data ?? []) as Array<{
      id: string; staff_id: string; staff_name: string | null; stato: string;
    }>;
    return {
      piano_data: piano.data?.data ?? null,
      piano_territorio: piano.data?.territorio ?? null,
      piano_stato: piano.data?.stato ?? null,
      n_rapportini: righeRap.length,
      // Il numero che pesa: un rapportino inviato o con lavoro chiuso dentro non si rifà.
      n_rapportini_inviati: righeRap.filter((r) => r.stato === 'inviato').length,
      rapportini: righeRap.map((r) => ({
        id: r.id, staff_id: r.staff_id, staff_name: r.staff_name, stato: r.stato,
      })),
      n_interventi: righeInt.length,
      n_interventi_completati: righeInt.filter((i) => i.stato === 'completato').length,
    };
  } catch (err) {
    console.error('[audit] fotografaPiano:', err instanceof Error ? err.message : err);
    return { errore_fotografia: true };
  }
}
