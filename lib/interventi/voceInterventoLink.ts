// Risoluzione robusta voce rapportino → intervento.
// Il collegamento storico avveniva solo per `staff + ODL` in fase di generazione:
// fragile quando l'ODL manca o l'intervento non è ancora presente. Qui agganciamo
// per più chiavi allineate (ODL, matricola, PDR), con scoping per operatore e
// scartando le chiavi ambigue per non collegare l'intervento sbagliato.

export type InterventoLinkRow = {
  id: string;
  staff_id: string | null;
  odl: string | null;
  matricola_contatore: string | null;
  pdr: string | null;
};

export type VoceLinkKey = {
  staff_id: string | null;
  odl?: string | null;
  matricola?: string | null;
  pdr?: string | null;
};

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/**
 * Costruisce un risolutore `voce → intervento_id`. Match allineato per campo e
 * scoping per `staff_id`, in ordine di affidabilità: ODL → matricola → PDR.
 * Una chiave presente su più interventi dello stesso operatore è **ambigua** e
 * viene scartata (meglio non collegare che collegare l'intervento sbagliato).
 */
export function buildVoceInterventoLinker(
  interventi: InterventoLinkRow[],
): (voce: VoceLinkKey) => string | null {
  const byOdl = new Map<string, string | null>();
  const byMatr = new Map<string, string | null>();
  const byPdr = new Map<string, string | null>();

  const put = (m: Map<string, string | null>, staff: string | null, val: unknown, id: string) => {
    const v = norm(val);
    if (!v) return;
    const k = `${staff ?? ''}|${v}`;
    if (!m.has(k)) m.set(k, id);
    else if (m.get(k) !== id) m.set(k, null); // collisione → ambiguo
  };

  for (const it of interventi) {
    put(byOdl, it.staff_id, it.odl, it.id);
    put(byMatr, it.staff_id, it.matricola_contatore, it.id);
    put(byPdr, it.staff_id, it.pdr, it.id);
  }

  const get = (m: Map<string, string | null>, staff: string | null, ...vals: unknown[]): string | null => {
    for (const val of vals) {
      const v = norm(val);
      if (!v) continue;
      const hit = m.get(`${staff ?? ''}|${v}`);
      if (hit) return hit; // null (ambiguo) o undefined → prova la chiave successiva
    }
    return null;
  };

  return (voce) => {
    const s = voce.staff_id ?? null;
    return (
      get(byOdl, s, voce.odl) ??
      get(byMatr, s, voce.matricola) ??
      get(byPdr, s, voce.pdr) ??
      null
    );
  };
}
