// Lo stato «portale» ACEA, rinfrescato dall'IMPORT del Cruscotto invece che da un agente.
//
// `acea_portale_snapshot` è la terza colonna dell'audit e il gate storico del SAL: dice quali
// ordini ACEA ha consuntivato e con quale causa di scostamento. La scriveva un agente Playwright
// su un PC in ufficio, ritirato il 04/08/2026 — da allora la tabella era ferma al 29/07 e il
// pre-SAL smetteva di vedere tutto ciò che ACEA chiudeva dopo (265 ordini pagabili al 06/08).
//
// La sorgente viva è il file che l'ufficio carica dal modulo ACEA: le stesse colonne, con la
// stessa semantica, dentro un giro che si fa comunque. Aggiornarla qui la riporta al passo con i
// dati senza dipendere da nessuna macchina accesa (decisione utente 2026-08-06).
//
// SOLO gli ODL presenti nel file vengono toccati: l'export è finestrato, e cancellare ciò che non
// contiene vorrebbe dire perdere lo storico degli ordini più vecchi a ogni import.
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizzaStatoPortale } from '@/lib/produzione/statoPortale';
import type { RigaOrdineAcea } from './tipi';

/** Righe scritte e ODL distinti coperti: l'import lo riporta, come fa per ogni sua scrittura. */
export interface EsitoPortaleSnapshot {
  odl: number;
  righe: number;
}

const BLOCCO = 500;

/**
 * Riscrive lo stato portale degli ODL presenti nel file.
 *
 * Un ordine ha più operazioni; qui conta l'ULTIMA (numero operazione massimo), come ovunque nel
 * motore: è quella che porta l'esito e la causale con cui ACEA chiude — mai il primo tentativo.
 */
export async function aggiornaPortaleSnapshot(
  db: SupabaseClient,
  righe: readonly RigaOrdineAcea[],
  runId: string,
): Promise<EsitoPortaleSnapshot> {
  const ultima = new Map<string, { op: number; riga: RigaOrdineAcea }>();
  for (const r of righe) {
    const odl = (r.odl ?? '').trim();
    if (!odl) continue;
    const op = parseInt(String(r.numero_operazione ?? '').trim(), 10) || 0;
    const prev = ultima.get(odl);
    if (!prev || op >= prev.op) ultima.set(odl, { op, riga: r });
  }
  if (ultima.size === 0) return { odl: 0, righe: 0 };

  const raccoltoAt = new Date().toISOString();
  const rows = [...ultima.values()].map(({ riga }) => ({
    odl: (riga.odl ?? '').trim(),
    stato: riga.stato_desc ?? riga.stato ?? '',
    stato_norm: normalizzaStatoPortale(riga.stato_desc ?? riga.stato),
    causa_scostamento: riga.causale ?? null,
    operatore: [riga.operatore_cognome, riga.operatore_nome].filter(Boolean).join(' ').trim() || null,
    raccolto_at: raccoltoAt,
    run_id: runId,
  }));

  let scritte = 0;
  for (let i = 0; i < rows.length; i += BLOCCO) {
    const blocco = rows.slice(i, i + BLOCCO);
    const { error } = await db.from('acea_portale_snapshot').upsert(blocco, { onConflict: 'odl' });
    if (error) throw error;
    scritte += blocco.length;
  }
  return { odl: ultima.size, righe: scritte };
}
