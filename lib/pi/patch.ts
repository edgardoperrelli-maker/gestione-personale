// Campo PATCH del rapportino P.I.: crocetta "patch" + matricola obbligatoria quando spuntata.
// Le chiavi vivono nelle `risposte` della chiamata (non sono tipi campo del template):
// vedi ModalePIManuale (client) e /api/pi/[token]/intervento (server), che condividono
// questo modulo per restare coerenti (anche sugli invii offline / diretti).

/** Chiave risposta: PATCH spuntata (boolean). */
export const PATCH_KEY = 'patch';
/** Chiave risposta: numero matricola della patch (string). */
export const PATCH_MATRICOLA_KEY = 'patch_matricola';

/** True se PATCH è spuntata ma la matricola è mancante/vuota (invio da bloccare). */
export function matricolaPatchMancante(risposte: Record<string, unknown> | null | undefined): boolean {
  const r = risposte ?? {};
  if (r[PATCH_KEY] !== true) return false;
  return String(r[PATCH_MATRICOLA_KEY] ?? '').trim() === '';
}
