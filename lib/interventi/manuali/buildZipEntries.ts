// PURA: calcola il path di ciascuna foto dentro lo ZIP.
// Regola (design §8): si usa file_name (formato `<identificativo>_<Etichetta>.<ext>`);
// su collisione di file_name si separano in sottocartelle '<identificativo>/'; eventuali
// collisioni residue ricevono un suffisso con la MATRICOLA (quando nota e distinta tra le
// richieste colliding) o, in mancanza, un contatore progressivo ' (n)' prima dell'estensione.
// storagePath è preservato per il download.

import { normalizzaAscii } from './fotoNaming';

export type FotoZip = {
  richiesta_id: string;
  storage_path: string;
  file_name: string;
  /**
   * Matricola (dati correnti), se nota. Usata SOLO per disambiguare una collisione tra
   * richieste DIVERSE che producono lo stesso file_name — es. priorità nome-foto che non
   * inizia per matricola (ODL/via), con due interventi sotto lo stesso ODL/via: senza questo
   * le foto restano indistinguibili ("(2)", "(3)"...) pur essendo di misuratori diversi.
   */
  matricola?: string | null;
};

export type ZipEntry = {
  storagePath: string; // sorgente nel bucket (per il download)
  zipPath: string;     // destinazione nell'archivio
};

/**
 * Identificativo per la sottocartella: il nome ha formato `<identificativo>_<Etichetta>.<ext>`
 * (vedi nomeFotoFile), quindi si prende la parte PRIMA del primo '_'. Con la regola storica
 * (parte dopo l'ultimo '_') le cartelle su collisione uscivano intitolate all'ETICHETTA dello
 * slot (es. "FotoContatoreVecchio/") invece che all'identificativo. Fallback: richiesta_id.
 */
function identificativoDa(fileName: string, fallback: string): string {
  const senzaExt = fileName.replace(/\.[^.]+$/, '');
  const us = senzaExt.indexOf('_');
  const id = us > 0 ? senzaExt.slice(0, us) : '';
  return id || fallback;
}

function splitExt(fileName: string): { base: string; ext: string } {
  const m = fileName.match(/^(.*?)(\.[^.]+)?$/);
  return { base: m?.[1] ?? fileName, ext: m?.[2] ?? '' };
}

export function buildZipEntries(foto: FotoZip[]): ZipEntry[] {
  // 1) quali file_name collidono (compaiono >1 volta)?
  const conta = new Map<string, number>();
  for (const f of foto) conta.set(f.file_name, (conta.get(f.file_name) ?? 0) + 1);

  // 1-bis) tra i colliding, quali file_name hanno OGNI entry con una matricola nota e tutte
  // distinte tra loro? Solo in quel caso (copertura totale, niente ambiguità residua) si usa
  // la matricola come suffisso per TUTTE le entry di quel gruppo — simmetrico, più chiaro di
  // un contatore muto. Copertura parziale o matricole duplicate → fallback al contatore per
  // l'intero gruppo (evita di mescolare i due stili sullo stesso file_name).
  const matricolePerNome = new Map<string, Set<string>>();
  for (const f of foto) {
    if ((conta.get(f.file_name) ?? 0) <= 1) continue;
    const m = normalizzaAscii(f.matricola ?? '');
    if (!m) continue;
    let set = matricolePerNome.get(f.file_name);
    if (!set) { set = new Set(); matricolePerNome.set(f.file_name, set); }
    set.add(m);
  }

  // 2) assegna il path, de-duplicando i path finali
  const usati = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const f of foto) {
    const collide = (conta.get(f.file_name) ?? 0) > 1;
    const cartella = collide ? `${identificativoDa(f.file_name, f.richiesta_id)}/` : '';
    const { base, ext } = splitExt(f.file_name);

    const matricoleDistinte = matricolePerNome.get(f.file_name);
    const tutteConMatricolaDistinta =
      collide && !!matricoleDistinte && matricoleDistinte.size === conta.get(f.file_name);

    let candidato = tutteConMatricolaDistinta
      ? `${cartella}${base} (${normalizzaAscii(f.matricola ?? '')})${ext}`
      : `${cartella}${f.file_name}`;

    if (usati.has(candidato)) {
      let n = 2;
      while (usati.has(`${cartella}${base} (${n})${ext}`)) n += 1;
      candidato = `${cartella}${base} (${n})${ext}`;
    }

    usati.add(candidato);
    entries.push({ storagePath: f.storage_path, zipPath: candidato });
  }

  return entries;
}
