// PURA: le due liste di campi che governano le FOTO di un "+" operatore.
//
// Regola unica da cui discende tutto: il server non può pretendere più di quanto la modale abbia
// mostrato. Il "+" è offline-first — quando il sync respinge, il foglio è chiuso da un pezzo e
// l'operatore è altrove — e un item respinto NON torna in coda da solo (`sincronizzaToken` scarta
// per sempre i bloccati). Quindi un obbligo comparso solo lato server non protegge nulla: blocca
// la pratica e basta. Il 07/08/2026 sono stati 12 invii con lo stesso 422 e una giornata persa.
//
// Vive qui, fuori dalla route, perché sia verificabile davvero: finché l'espressione stava
// inline, i test potevano solo ri-scriverla e illudersi di averla provata.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { risolviCampiManuali } from './risolviCampiManuali';
import { isSoloRichiesta } from './soloRichiesta';

/**
 * I campi su cui si decide QUALI foto sono obbligatorie: esattamente quelli che la modale ha
 * reso in campo (eredità override→standard). Mai il flusso del gruppo, che descrive le stesse
 * foto con chiavi proprie — «RAPPORTINO LIMITAZIONI MASSIVE» chiama `sost_valvola` la foto che
 * il modello del "+" chiama `sostituzione_valvola` — e pretenderebbe slot mai esistiti.
 *
 * Vuoto sui committenti "solo richiesta" (AcquaLatina): lì la modale si ferma all'anagrafica e
 * non raccoglie nemmeno una foto, e non avendo AcquaLatina un modello "+" proprio erediterebbe
 * il template del RAPPORTINO — anche quando è uno con quattro foto obbligatorie.
 */
export function campiGateFoto(
  committente: string | null | undefined,
  override: TemplateCampo[] | null | undefined,
  standard: TemplateCampo[] | null | undefined,
): TemplateCampo[] {
  return isSoloRichiesta(committente) ? [] : risolviCampiManuali(override, standard);
}

/**
 * I campi su cui si riconosce l'ESITO NEGATIVO che esonera dalle foto: l'unione del cancello e
 * del flusso.
 *
 * Perché l'unione, e non il solo flusso. Il client valuta esonero e obbligo sulla STESSA lista
 * (quella del cancello): leggere il negativo soltanto nel flusso significa che, se l'`eseguito`
 * sta nel modello e non nel flusso, il client toglie l'obbligo e il server lo tiene — e siamo di
 * nuovo a un 422 che dal telefono non si può togliere. Che `campiEffettivi` possa non avere
 * l'`eseguito` non è un'ipotesi: `campiPerEsito`, nella route, esiste da tempo proprio per
 * rimediarvi (regressione PLENZICH 45 vs 32).
 *
 * Con l'unione la frase «riconoscere un esito negativo può solo TOGLIERE obblighi» torna vera
 * rispetto al CLIENT, non solo rispetto al server preso da solo.
 */
export function campiEsonero(
  gate: TemplateCampo[] | null | undefined,
  effettivi: TemplateCampo[] | null | undefined,
): TemplateCampo[] {
  return [...(gate ?? []), ...(effettivi ?? [])];
}

/**
 * I campi in cui cercare l'etichetta di uno slot foto RICEVUTO. Il cancello viene per primo: le
 * chiavi arrivate dal telefono sono le sue, e cercarle nel flusso — che le chiama diversamente —
 * fa ripiegare sulla chiave grezza, che poi finisce in `slot_etichetta` e nel nome del file
 * consegnato al committente.
 */
export function campiEtichettaFoto(
  gate: TemplateCampo[] | null | undefined,
  effettivi: TemplateCampo[] | null | undefined,
): TemplateCampo[] {
  return [...(gate ?? []), ...(effettivi ?? [])];
}
