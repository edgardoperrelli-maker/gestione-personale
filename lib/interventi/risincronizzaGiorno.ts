// lib/interventi/risincronizzaGiorno.ts
// Il catch-up di UN giorno: riaggancia le voci scollegate agli interventi e riapplica l'esito
// corrente di ogni voce compilata, senza inviare niente. Idempotente.
//
// Estratto da `POST /api/interventi/risincronizza` per essere riusabile su un INTERVALLO: il
// modulo Live naviga solo [oggi−7, oggi] (`clampDataLive`), quindi il suo bottone non poteva
// nemmeno vedere i giorni dove le voci orfane si sono accumulate — 41 delle 42 misurate il
// 17/08/2026 stanno prima di quella finestra. La route del giorno resta identica e chiama questa.

import type { SupabaseClient } from '@supabase/supabase-js';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import { esitoScrivibile } from '@/lib/interventi/scritturaEsito';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export type EsitoRisincronizza = { agganciate: number; completati: number };

export type OpzioniRisincronizza = {
  /**
   * Passa solo sulle voci SCOLLEGATE invece che su tutte quelle del giorno.
   *
   * Il catch-up del singolo giorno (bottone del Live) le vuole tutte: e` un «riallinea questa
   * giornata». Il recupero su TUTTO lo storico no — quelle giornate hanno 3.988 voci in totale
   * contro 83 orfane, e scorrerle tutte significa migliaia di round-trip in fila: la prima
   * passata del 17/08/2026 e` morta al tetto dei 300 secondi a meta` lavoro.
   */
  soloOrfane?: boolean;
};

type VoceRow = {
  id: string;
  intervento_id: string | null;
  raw_json: unknown;
  risposte: Record<string, unknown> | null;
  updated_at: string;
  campi_snapshot?: unknown;
  odl: string | null;
  matricola: string | null;
  pdr: string | null;
  approvazione_stato: string | null;
};

export async function risincronizzaGiorno(
  db: SupabaseClient,
  data: string,
  opts: OpzioniRisincronizza = {},
): Promise<EsitoRisincronizza> {
  const { data: interventi } = await db
    .from('interventi')
    .select('id, staff_id, odl, matricola_contatore, pdr')
    .eq('data', data)
    .neq('stato', 'annullato');

  /*
    Gli interventi che una voce ce l'hanno già restano fuori dai candidati: un intervento ha UNA
    voce sola, ed è l'invariante su cui poggiano il positivo che non si declassa e la voce che
    segue lo spostamento. Senza questa esclusione il catch-up FABBRICA lo stato che quelle regole
    esistono per impedire — una voce orfana che non trova il proprio ODL scivola sul PDR (che è
    del PUNTO, non del contatore) e prende l'intervento del contatore accanto, che una sua voce
    ce l'ha già. Stessa ragione del guard sulle voci rifiutate (migration 20260810160000).
  */
  const idInterventi = ((interventi ?? []) as Array<{ id: string }>).map((i) => i.id);
  const conVoce = new Set<string>();
  for (let i = 0; i < idInterventi.length; i += 200) {
    const { data: occupati } = await db
      .from('rapportino_voci').select('intervento_id').in('intervento_id', idInterventi.slice(i, i + 200));
    for (const o of (occupati ?? []) as Array<{ intervento_id: string | null }>) {
      if (o.intervento_id) conVoce.add(String(o.intervento_id));
    }
  }
  const resolve = buildVoceInterventoLinker(
    ((interventi ?? []) as InterventoLinkRow[]).filter((i) => !conVoce.has(String(i.id))),
  );

  const { data: raps } = await db
    .from('rapportini').select('id, staff_id, campi_snapshot').eq('data', data);

  let agganciate = 0;
  let completati = 0;

  // Catch-up completo: per OGNI voce assicura il collegamento (aggancia quelle scollegate)
  // e riapplica l'esito sull'intervento. `updated_at` della voce = ORA REALE DI COMPILAZIONE.
  for (const rap of (raps ?? []) as Array<{ id: string; staff_id: string | null; campi_snapshot: unknown }>) {
    const campi = (rap.campi_snapshot ?? []) as TemplateCampo[];
    const q = db
      .from('rapportino_voci')
      .select('id, intervento_id, raw_json, risposte, updated_at, campi_snapshot, odl, matricola, pdr, approvazione_stato')
      .eq('rapportino_id', rap.id);
    const { data: voci } = await (opts.soloOrfane ? q.is('intervento_id', null) : q);

    for (const v of (voci ?? []) as VoceRow[]) {
      let interventoId = v.intervento_id;
      if (!interventoId) {
        const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
        // Fallback alle COLONNE della voce, come generazione/salvataggio/invio: senza, lo
        // strumento di recupero non recuperava proprio le voci che lo motivano — quelle il cui
        // `raw_json` non porta le chiavi (ODL 957327236) rispondevano «agganciate: 0».
        const found = resolve({
          staff_id: rap.staff_id,
          odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
          matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
          pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
          // Il recupero massivo passa su TUTTE le voci del giorno, rifiutate comprese: senza
          // questo campo rimetterebbe in piedi proprio i collegamenti che stiamo togliendo.
          approvazione_stato: v.approvazione_stato,
        });
        if (found) {
          interventoId = found;
          await db.from('rapportino_voci').update({ intervento_id: found }).eq('id', v.id);
          agganciate += 1;
          conVoce.add(found);   // occupato da adesso: la voce dopo non lo prende
        }
      }
      if (!interventoId) continue;
      // Voce neutra → non tocca (non riapre nel recupero). Esito valutato sui campi
      // DELLA voce (flusso del suo gruppo attività, fallback rapportino).
      const campiV = Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
        ? (v.campi_snapshot as TemplateCampo[])
        : campi;
      const patch = esitoInterventoDaVoce(v.risposte ?? {}, campiV);
      if (!patch) continue;
      // Il positivo non si declassa da una voce che non è la sua, nemmeno in un recupero
      // massivo che passa su tutto lo storico.
      const scrivibile = await esitoScrivibile(db, interventoId, patch.esito);
      if (!scrivibile.scrivi) continue;
      const { error: e } = await db
        .from('interventi')
        .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: v.updated_at })
        .eq('id', interventoId)
        .neq('stato', 'annullato');
      if (!e) completati += 1;
    }
  }

  return { agganciate, completati };
}
