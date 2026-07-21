// PURA: layout ZIP delle foto per i giri task-via (BONIFICHE EXTRA).
// Struttura richiesta dall'ufficio: una cartella per VIA (quella del task-via padre)
// e, al suo interno, foto rinominate per MATRICOLA + slot (vecchio / nuovo / minibag):
//   <Via del task>/<matricola>_<slot>.<ext>
// I nomi si ricalcolano QUI dai dati correnti (post-approvazione), non dal file_name
// salvato all'upload: se il backoffice corregge la matricola, lo ZIP la riflette.

import { normalizzaAscii } from './fotoNaming';
import type { ZipEntry } from './buildZipEntries';

export type FotoManualeZip = {
  richiesta_id: string;
  storage_path: string;
  file_name: string;
  slot_chiave: string | null;
  slot_etichetta: string | null;
};

export type InfoRichiestaTaskVia = {
  /** Via del task-via padre (fallback: via dell'anagrafica) -> nome della cartella. */
  via: string | null;
  /** Matricola CORRENTE (dati_correnti, quindi post-approvazione) -> identificativo del file. */
  matricola: string | null;
  /** Identificativo di riserva (catena priorita' esistente) se la matricola manca. */
  fallbackId: string;
};

/**
 * Nome cartella dalla via, leggibile cosi' com'e' scritta (niente CamelCase):
 * rimuove solo i caratteri vietati nei filesystem, collassa gli spazi e toglie
 * punti/spazi ai bordi (Windows). Via assente/vuota -> '' (foto alla radice).
 */
export function cartellaVia(via: string | null | undefined): string {
  return String(via ?? '')
    .replace(/[\u0000-\u001f\\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
}

/** Estensione in minuscolo: dallo storage_path, poi dal file_name, fallback 'jpg'. */
function estensioneDa(storagePath: string, fileName: string): string {
  const daPath = /\.([A-Za-z0-9]{1,8})$/.exec(storagePath)?.[1];
  const daNome = /\.([A-Za-z0-9]{1,8})$/.exec(fileName)?.[1];
  return (daPath ?? daNome ?? 'jpg').toLowerCase();
}

export function buildZipEntriesTaskVia(
  foto: FotoManualeZip[],
  infoPerRichiesta: Map<string, InfoRichiestaTaskVia>,
): ZipEntry[] {
  const usati = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const f of foto) {
    const info = infoPerRichiesta.get(f.richiesta_id);
    const id =
      normalizzaAscii(String(info?.matricola ?? '').trim()) ||
      info?.fallbackId ||
      'intervento';
    const slot =
      normalizzaAscii(String(f.slot_chiave ?? '').trim()) ||
      normalizzaAscii(String(f.slot_etichetta ?? '').trim()) ||
      'foto';
    const ext = estensioneDa(f.storage_path, f.file_name);
    const cartella = cartellaVia(info?.via);
    const prefisso = cartella ? `${cartella}/` : '';

    let candidato = `${prefisso}${id}_${slot}.${ext}`;
    if (usati.has(candidato)) {
      let n = 2;
      while (usati.has(`${prefisso}${id}_${slot} (${n}).${ext}`)) n += 1;
      candidato = `${prefisso}${id}_${slot} (${n}).${ext}`;
    }

    usati.add(candidato);
    entries.push({ storagePath: f.storage_path, zipPath: candidato });
  }

  return entries;
}
