import { INFO_CAMPI_DISPONIBILI, valoreInfo, type InfoChiave, type VoceInfo } from './infoCampi';

/**
 * Configurazione della RIGA IN LISTA: la schermata con tutti i task, quella che l'operatore
 * vede PRIMA di aprire il dettaglio. Il titolo della riga resta governato da `titolo_campi`
 * (è lo stesso della card di dettaglio); qui si decidono gli altri due slot della riga:
 *
 *   [n] TITOLO ...................... meta      ← `meta`, a destra del titolo
 *       sub ..................... [Da fare]    ← `sub`, la seconda riga
 */
export interface ListaCampi {
  /** Seconda riga della card (l'indirizzo, storicamente). */
  sub: InfoChiave[];
  /** Testo compatto a destra del titolo. */
  meta: InfoChiave[];
}

/** Storico: la seconda riga era `VIA · COMUNE`, cablata nel form. */
export const LISTA_SUB_DEFAULT: InfoChiave[] = ['via', 'comune'];
/** Storico: accanto al titolo c'erano attività e fascia oraria. */
export const LISTA_META_DEFAULT: InfoChiave[] = ['attivita', 'fascia_oraria'];

const CHIAVI_NOTE = new Set<string>(INFO_CAMPI_DISPONIBILI.map((c) => c.chiave));

/**
 * Chiave ASSENTE (non è un array) → default storico: i flussi mai configurati non cambiano
 * aspetto. Array VUOTO → slot spento: l'admin l'ha svuotato apposta e la riga deve obbedire.
 * È la differenza che rende la configurazione davvero reversibile in entrambi i versi.
 */
function chiaviValide(valore: unknown, fallback: InfoChiave[]): InfoChiave[] {
  if (!Array.isArray(valore)) return fallback;
  return valore.filter((k): k is InfoChiave => typeof k === 'string' && CHIAVI_NOTE.has(k));
}

/** Risolve lo snapshot `lista_campi` del template in una config completa e sicura. */
export function resolveListaCampi(snapshot: unknown): ListaCampi {
  const s = (snapshot ?? {}) as { sub?: unknown; meta?: unknown };
  return {
    sub: chiaviValide(s.sub, LISTA_SUB_DEFAULT),
    meta: chiaviValide(s.meta, LISTA_META_DEFAULT),
  };
}

/** Fascia compatta per la riga: se il valore è "GG/MM/AAAA HH:MM" resta il solo orario. */
export function fasciaBreve(raw: string): string {
  const t = raw.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, '').trim();
  return t || raw.trim();
}

/** Valore di un campo COME LO MOSTRA LA RIGA (la fascia si accorcia: lo spazio è poco). */
export function valoreRiga(voce: VoceInfo, chiave: InfoChiave): string {
  const v = valoreInfo(voce, chiave);
  return chiave === 'fascia_oraria' ? fasciaBreve(v) : v;
}

/** Testo di uno slot: i valori non vuoti, nell'ordine scelto, separati da " · ". */
export function testoRiga(voce: VoceInfo, chiavi: InfoChiave[]): string {
  return chiavi.map((k) => valoreRiga(voce, k)).filter(Boolean).join(' · ');
}
