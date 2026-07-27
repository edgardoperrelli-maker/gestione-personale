export type TerritoryStyle = {
  bg: string;
  border: string;
  text: string;
  band: string;
};

// I colori dei territori sono definiti come CSS variabili in globals.css, con valori diversi per il
// tema scuro (:root, tinte CHIARE) e chiaro (html.light, tinte SCURE). getTerritoryStyle ritorna
// riferimenti var(--terr-…): così i colori cambiano AUTOMATICAMENTE allo switch del tema, senza
// bisogno di ri-render JS (il vecchio approccio leggeva il tema al render e restava "vecchio").
// Esportata per la guardia in `territoryColors.test.ts`: un territorio fuori da questa mappa non
// rompe niente, prende il grigio del fallback e tace — quindi il difetto si vede solo misurandolo.
export const SLUG_TERRITORI: Record<string, string> = {
  FIRENZE: 'firenze',
  AURELIA: 'aurelia',
  'LAZIO EST': 'lazioest',
  PADOVA: 'padova',
  PERUGIA: 'perugia',
  'LAZIO CENTRO': 'laziocentro',
  NAPOLI: 'napoli',
  ACEA: 'acea',
  'ACQUA LATINA': 'acqualatina',
  MILANO: 'milano',
  MAGAZZINO: 'magazzino',
};

export function getTerritoryStyle(territoryName?: string | null): TerritoryStyle {
  const key = (territoryName ?? '').trim().toUpperCase();
  const slug = SLUG_TERRITORI[key] ?? 'fallback';
  return {
    bg: `var(--terr-${slug}-bg)`,
    border: `var(--terr-${slug}-bd)`,
    text: `var(--terr-${slug}-text)`,
    band: `var(--terr-${slug}-band)`,
  };
}
