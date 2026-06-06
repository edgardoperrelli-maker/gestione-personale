// PURA: calcola il path di ciascuna foto dentro lo ZIP.
// Regola (design §8): si usa file_name; su collisione di file_name si separano
// in sottocartelle '<identificativo>/'; eventuali collisioni residue ricevono un
// suffisso progressivo ' (n)' prima dell'estensione. storagePath è preservato per il download.

export type FotoZip = {
  richiesta_id: string;
  storage_path: string;
  file_name: string;
};

export type ZipEntry = {
  storagePath: string; // sorgente nel bucket (per il download)
  zipPath: string;     // destinazione nell'archivio
};

/** Identificativo per la sottocartella: parte dopo l'ultimo '_' senza estensione; fallback richiesta_id. */
function identificativoDa(fileName: string, fallback: string): string {
  const senzaExt = fileName.replace(/\.[^.]+$/, '');
  const us = senzaExt.lastIndexOf('_');
  const id = us >= 0 ? senzaExt.slice(us + 1) : '';
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

  // 2) assegna il path, de-duplicando i path finali con suffisso progressivo
  const usati = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const f of foto) {
    const collide = (conta.get(f.file_name) ?? 0) > 1;
    const cartella = collide ? `${identificativoDa(f.file_name, f.richiesta_id)}/` : '';
    let candidato = `${cartella}${f.file_name}`;

    if (usati.has(candidato)) {
      const { base, ext } = splitExt(f.file_name);
      let n = 2;
      while (usati.has(`${cartella}${base} (${n})${ext}`)) n += 1;
      candidato = `${cartella}${base} (${n})${ext}`;
    }

    usati.add(candidato);
    entries.push({ storagePath: f.storage_path, zipPath: candidato });
  }

  return entries;
}
