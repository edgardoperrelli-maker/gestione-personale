// PURA: validazione bloccante dell'import contro la tassonomia (spec §6).
// Un solo errore → l'INTERO file è rifiutato (nessun import parziale).
import type { Task } from '@/utils/routing/types';
import { chiaveTassonomia, risolviGruppo, type TassonomiaRiga } from './tassonomia';

export type ErroreImport = {
  tipo: 'descrizione_mancante' | 'descrizione_sconosciuta' | 'gruppo_incoerente';
  valore: string;      // il testo incriminato ('' per descrizione_mancante)
  righe: number[];     // numeri riga dal campo Task.ordine (ordine nel file)
  atteso?: string;     // solo gruppo_incoerente: il gruppo derivato dalla tassonomia
};

export type EsitoValidazione =
  | { ok: true; righe: Array<{ task: Task; descrizioneCanonica: string; gruppo: string }> }
  | { ok: false; errori: ErroreImport[] };

export function validaImport(
  tasks: Task[],
  committente: string,
  index: Map<string, TassonomiaRiga>,
): EsitoValidazione {
  const righeOk: Array<{ task: Task; descrizioneCanonica: string; gruppo: string }> = [];
  const mancanti: number[] = [];
  const sconosciute = new Map<string, number[]>();   // chiave norm → righe
  const incoerenti: ErroreImport[] = [];

  for (const t of tasks ?? []) {
    const riga = t.ordine ?? 0;
    const descr = String(t.attivita ?? '').trim();
    if (!descr) { mancanti.push(riga); continue; }
    const ris = risolviGruppo(committente, descr, index);
    if (!ris) {
      const k = chiaveTassonomia(descr);
      if (!sconosciute.has(k)) sconosciute.set(k, []);
      sconosciute.get(k)!.push(riga);
      continue;
    }
    const gruppoFile = String(t.gruppoFile ?? '').trim();
    if (gruppoFile && gruppoFile.toUpperCase() !== ris.gruppo.toUpperCase()) {
      incoerenti.push({ tipo: 'gruppo_incoerente', valore: gruppoFile, righe: [riga], atteso: ris.gruppo });
      continue;
    }
    righeOk.push({ task: t, descrizioneCanonica: ris.descrizione, gruppo: ris.gruppo });
  }

  const errori: ErroreImport[] = [];
  if (mancanti.length) errori.push({ tipo: 'descrizione_mancante', valore: '', righe: mancanti });
  for (const [k, righe] of sconosciute) errori.push({ tipo: 'descrizione_sconosciuta', valore: k, righe });
  errori.push(...incoerenti);

  return errori.length > 0 ? { ok: false, errori } : { ok: true, righe: righeOk };
}
