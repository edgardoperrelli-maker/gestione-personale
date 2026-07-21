// PURA: raggruppa le richieste manuali "Italgas mobile" (committente='italgas', foto
// vecchio/nuovo/minibag) per VIA, indipendentemente dal collegamento al task-via padre.
//
// Perché non ci si può fidare di `parent_voce_id`: (1) può essere assente — l'operatore
// crea il "+" da un rapportino ITALGAS classico, senza passare da un contenitore task-via
// (caso reale: TODINI EMANUELE 15/07, 4 richieste, tutte parent_voce_id=null); (2) può essere
// ORFANO — punta a una voce che non esiste più nel rapportino, es. dopo una rigenerazione del
// piano che ricrea le voci con nuovi id (caso reale: ANNACCARATO GIOELE 14/07, 8 richieste su
// 12 con parent_voce_id che non risolve a nessuna riga). In entrambi i casi la via resta
// leggibile nell'anagrafica della richiesta stessa: si raggruppa su QUELLA.
// Quando il collegamento risolve, si preferisce la via del contenitore (l'indirizzo assegnato
// dall'ufficio) a quella scritta dall'operatore, per assorbire piccole differenze di battitura.

export type RichiestaItalgas = {
  id: string;
  parentVoceId: string | null;
  viaAnagrafica: string | null;
  matricola: string | null;
};

export type ViaVoce = { id: string; via: string | null };

export type GruppoViaItalgas = {
  /** Testo della via così com'è (prima occorrenza per il gruppo); null = via assente. */
  via: string | null;
  richiestaIds: string[];
};

/**
 * Chiave di confronto: solo alfanumerico maiuscolo (stessa convenzione di `normalizzaAscii`
 * in fotoNaming.ts). Non usata per la visualizzazione (quella resta il testo originale).
 * Serve alfanumerico e non solo trim/collasso spazi: nei dati reali la stessa via viene
 * scritta a volte con lo spazio prima del civico e a volte senza (es. "PUGLIE 21" /
 * "PUGLIE21", "MONTALE 11" / "MONTALE11" — casi verificati sul DB di produzione), quindi un
 * collasso spazi da solo non le riconoscerebbe come la stessa via.
 */
export function normalizzaViaChiave(via: string | null | undefined): string {
  return String(via ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Via "risolta" di una richiesta: quella del contenitore se il collegamento risolve, altrimenti la propria. */
export function viaRisoltaRichiesta(r: RichiestaItalgas, vociById: Map<string, ViaVoce>): string | null {
  const parent = r.parentVoceId ? vociById.get(r.parentVoceId) : undefined;
  const viaParent = parent?.via?.trim();
  return viaParent ? parent!.via : r.viaAnagrafica;
}

/** Raggruppa le richieste per via risolta (chiave normalizzata, via visualizzata = prima occorrenza). */
export function raggruppaPerVia(
  richieste: RichiestaItalgas[],
  vociById: Map<string, ViaVoce>,
): GruppoViaItalgas[] {
  const gruppi = new Map<string, GruppoViaItalgas>();
  for (const r of richieste) {
    const via = viaRisoltaRichiesta(r, vociById);
    const chiave = normalizzaViaChiave(via);
    let g = gruppi.get(chiave);
    if (!g) {
      g = { via, richiestaIds: [] };
      gruppi.set(chiave, g);
    }
    g.richiestaIds.push(r.id);
  }
  return [...gruppi.values()];
}

/** Sottoinsieme delle richieste la cui via risolta corrisponde (case/spazi-insensitive) a `viaFiltro`. */
export function richiesteDelGruppo(
  richieste: RichiestaItalgas[],
  vociById: Map<string, ViaVoce>,
  viaFiltro: string | null,
): RichiestaItalgas[] {
  const chiave = normalizzaViaChiave(viaFiltro);
  return richieste.filter((r) => normalizzaViaChiave(viaRisoltaRichiesta(r, vociById)) === chiave);
}
