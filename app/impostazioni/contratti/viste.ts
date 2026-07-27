// Le tre viste del modulo Contratti (§7bis: viste di modulo = fogliette + route
// dedicata + breadcrumb di rientro). Definite una volta sola: la landing le rende
// come FogliettaCard, ogni vista figlia rende le altre due come rientro laterale.
//
// Sono viste e non tab perché sono tre CONTESTI diversi su dataset diversi —
// anagrafica, economico, operativo. Le tab restano ai filtri di dato sullo stesso
// dataset, dove trasformarli in pagine rallenterebbe chi lavora.

export type VistaContratti = 'commesse' | 'prezzi' | 'attivita';

export const VISTE: Record<VistaContratti, { titolo: string; href: string; desc: string }> = {
  commesse: {
    titolo: 'Commesse',
    href: '/impostazioni/contratti/commesse',
    desc: 'Committenti, contratti e territori di copertura',
  },
  prezzi: {
    titolo: 'Prezzi',
    href: '/impostazioni/contratti/prezzi',
    desc: 'Listino per attività, con gli extra a prezzo proprio',
  },
  attivita: {
    titolo: 'Attività',
    href: '/impostazioni/contratti/attivita',
    desc: 'Lavorazioni a contratto e flusso operatore che le copre',
  },
};

export const ORDINE_VISTE: VistaContratti[] = ['commesse', 'prezzi', 'attivita'];

/** Le altre due viste, nell'ordine di modulo: il rientro laterale di una vista figlia. */
export function altreViste(corrente: VistaContratti) {
  return ORDINE_VISTE.filter((v) => v !== corrente).map((v) => VISTE[v]);
}
