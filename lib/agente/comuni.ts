// lib/agente/comuni.ts
// Comuni delle limitazioni massive: il comune È il nome del file master scansionato
// dall'agente (LABICO.xlsx → LABICO). Helper puri, condivisi tra UI (/hub/agente) e API
// (esegui-ora, acea-stato) perché la lista dei valori ammessi deve essere UNA sola.
import type { AgenteFileColonneRow } from '@/lib/agente/uiTypes';

/** Master DUNNING (cartella LIMITAZIONI CON ORDINE): non è un comune, sta fuori dalla scansione. */
export const TARGET_DUNNING = 'dunning';
/** Nessun filtro comune: tutti i master delle limitazioni massive. */
export const TARGET_TUTTI = 'TUTTI';

/** Riga di agente_file_colonne ridotta ai campi che servono qui (le API ne leggono solo 2). */
export type FileMaster = Pick<AgenteFileColonneRow, 'file' | 'is_master'>;

export type OpzioneComune = { value: string; label: string };

/** Nome file → comune normalizzato ('  Labico.XLSX ' → 'LABICO'). '' se non resta nulla. */
export function comuneDaFile(file: string): string {
  return file.trim().replace(/\.xlsx$/i, '').trim().toUpperCase();
}

/** Comuni dai soli file master: dedup + ordine alfabetico, nomi vuoti scartati. */
export function comuniMaster(rows: readonly FileMaster[]): string[] {
  const comuni = new Set<string>();
  for (const r of rows) {
    if (r.is_master !== true) continue;
    const c = comuneDaFile(r.file ?? '');
    if (c !== '') comuni.add(c);
  }
  return [...comuni].sort((a, b) => a.localeCompare(b, 'it'));
}

/** 'SAN CESAREO' → 'San Cesareo' (solo per l'etichetta a video; il valore resta maiuscolo). */
export function etichettaComune(comune: string): string {
  return comune
    .toLowerCase()
    .split(' ')
    .map((p) => (p === '' ? p : p[0].toUpperCase() + p.slice(1)))
    .join(' ');
}

/** Opzioni del select "quale master aggiornare con lo stato ODL da ACEA". */
export function opzioniAceaTarget(rows: readonly FileMaster[]): OpzioneComune[] {
  const comuni = comuniMaster(rows);
  const opzioni: OpzioneComune[] = [{ value: TARGET_DUNNING, label: 'DUNNING — Limitazioni con ordine' }];
  // Senza master non c'è nulla da fare sulle massive: niente "Tutti i comuni" fantasma.
  if (comuni.length > 0) {
    opzioni.push({ value: TARGET_TUTTI, label: 'Tutti i comuni — Limitazioni massive' });
    for (const c of comuni) opzioni.push({ value: c, label: `${etichettaComune(c)} — Limitazioni massive` });
  }
  return opzioni;
}

/** Opzioni del select comune accanto a "Esegui ora" (filtro valido SOLO per il lancio manuale). */
export function opzioniComuneGiro(rows: readonly FileMaster[]): OpzioneComune[] {
  return [
    { value: TARGET_TUTTI, label: 'Tutti i comuni' },
    ...comuniMaster(rows).map((c) => ({ value: c, label: etichettaComune(c) })),
  ];
}

/**
 * Valida il comune richiesto da un'API contro i master noti.
 * '' / assente / TUTTI → null (nessun filtro). Comune sconosciuto → errore (mai degrado silenzioso).
 */
export function normalizzaComune(
  input: unknown,
  rows: readonly FileMaster[],
): { ok: true; comune: string | null } | { ok: false; errore: string } {
  if (typeof input !== 'string') return { ok: true, comune: null };
  const c = input.trim().toUpperCase();
  if (c === '' || c === TARGET_TUTTI) return { ok: true, comune: null };
  const noti = comuniMaster(rows);
  if (!noti.includes(c)) {
    return {
      ok: false,
      errore: `Comune non riconosciuto: "${input}". Comuni disponibili: ${noti.join(', ') || '(nessun file master rilevato)'}.`,
    };
  }
  return { ok: true, comune: c };
}
