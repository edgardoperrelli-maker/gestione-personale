// lib/acea/gruppiServer.ts
// Assegnazione dei numeri di microarea sul registro. Lato server: legge e scrive `acea_ordini`.
//
// Sta qui e non dentro una route perche` serve a DUE chiamanti — il passaggio di geocodifica e
// l'import — e perche` un file di route Next puo` esportare solo i suoi verbi HTTP.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  assegnaGruppi, ereditaGruppi,
  type Donatore, type PuntoOrdine, type PuntoSenzaCoord,
} from './microaree';

/** Pagina delle scansioni interne: non esce dal server, puo` essere ampia. */
const PAGINA_SCAN = 1000;

/** Scrive lo stesso numero su un blocco di ODL. */
async function scriviGruppo(odls: string[], microarea: number, stimata: boolean): Promise<void> {
  for (let i = 0; i < odls.length; i += 200) {
    const { error } = await supabaseAdmin
      .from('acea_ordini')
      .update({ microarea, microarea_stimata: stimata })
      .in('odl', odls.slice(i, i + 200));
    if (error) throw error;
  }
}

/** Raggruppa le chiavi `odl|operazione` per numero, per scrivere un `update` a gruppo e non a riga. */
function odlPerNumero(perRiga: Map<string, number>): Map<number, string[]> {
  const perNumero = new Map<number, string[]>();
  for (const [chiave, n] of perRiga) {
    const odl = chiave.split('|')[0];
    const elenco = perNumero.get(n);
    if (elenco) elenco.push(odl);
    else perNumero.set(n, [odl]);
  }
  return perNumero;
}

export type EsitoGruppi = { microaree: number; senzaGruppo: number; stimati: number };

/**
 * Ricalcola i numeri di microarea su TUTTO il registro e li scrive.
 *
 * Due passate. La prima assegna i gruppi VERI, dalle coordinate. La seconda presta un gruppo a chi
 * non ne ha ancora uno, dal CAP a Roma e dal comune altrove: è quella che fa sì che un import
 * appena arrivato abbia già una zona, invece di restare a «—» proprio nei giorni in cui va
 * pianificato. I prestati restano marcati `microarea_stimata`, e in tabella si vedono con la tilde.
 */
export async function ricalcolaGruppi(): Promise<EsitoGruppi> {
  const punti: PuntoOrdine[] = [];
  const anagrafica = new Map<string, { comune: string | null; cap: string | null }>();

  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl, numero_operazione, comune, cap, lat, lng')
      .order('odl', { ascending: true })
      .order('numero_operazione', { ascending: true })
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as Array<{
      odl: string; numero_operazione: string; comune: string | null; cap: string | null;
      lat: number | null; lng: number | null;
    }>;
    for (const r of blocco) {
      const chiave = `${r.odl}|${r.numero_operazione}`;
      anagrafica.set(chiave, { comune: r.comune, cap: r.cap });
      punti.push({
        chiave,
        comune: r.comune,
        coord: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null,
      });
    }
    if (blocco.length < PAGINA_SCAN) break;
  }

  const gruppi = assegnaGruppi(punti);
  for (const [n, odls] of odlPerNumero(gruppi.perRiga)) {
    await scriviGruppo([...new Set(odls)], n, false);
  }

  // Chi resta senza: gli si presta il gruppo dominante della sua zona.
  const donatori: Donatore[] = [];
  for (const [chiave, n] of gruppi.perRiga) {
    const a = anagrafica.get(chiave);
    if (a) donatori.push({ comune: a.comune, cap: a.cap, gruppo: n });
  }
  const orfani: PuntoSenzaCoord[] = [];
  for (const [chiave, a] of anagrafica) {
    if (!gruppi.perRiga.has(chiave)) orfani.push({ chiave, comune: a.comune, cap: a.cap });
  }

  const prestati = ereditaGruppi(orfani, donatori);
  for (const [n, odls] of odlPerNumero(prestati)) {
    await scriviGruppo([...new Set(odls)], n, true);
  }

  return { microaree: gruppi.totale, senzaGruppo: gruppi.senzaGruppo, stimati: prestati.size };
}
