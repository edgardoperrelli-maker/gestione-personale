// lib/acea/colonneExport.ts
// PURA: nomi delle colonne dell'export ACEA e validazione del file prima di scrivere una riga.
//
// Il formato dell'export è confermato stabile dal committente: il parser assume queste colonne
// senza riconoscimento dinamico. La validazione non serve a indovinare un formato nuovo — serve
// a far fallire l'import in modo RUMOROSO se qualcosa cambia, invece di importare dati sbagliati.

/** Nome del foglio prodotto dal Cruscotto. */
export const FOGLIO_ATTESO = 'Esportazione SAPUI5';

/** Contratto e fornitore della commessa: firma di provenienza del file. */
export const CONTRATTO_COMMESSA = '3600002158';
export const FORNITORE_COMMESSA = '25617';

/** Colonne senza le quali il parsing non è affidabile: la loro assenza rifiuta il file. */
export const COLONNE_OBBLIGATORIE = [
  'Ordine',
  'Numero Operazione',
  'Stato Operazione',
  'Tipo di ordine',
  'Operazione testo breve',
  'Data documento',
  'Contratto',
  'Fornitore',
] as const;

export type EsitoValidazione = { ok: true } | { ok: false; motivo: string; dettagli?: string[] };

/** Verifica che l'intestazione contenga tutte le colonne obbligatorie. */
export function validaIntestazione(header: readonly string[]): EsitoValidazione {
  const presenti = new Set(header.map((h) => String(h ?? '').trim()));
  const mancanti = COLONNE_OBBLIGATORIE.filter((c) => !presenti.has(c));
  if (mancanti.length > 0) {
    return {
      ok: false,
      motivo: 'Il file non ha il formato dell\'export del Cruscotto ACEA: colonne mancanti.',
      dettagli: mancanti,
    };
  }
  return { ok: true };
}

/**
 * Verifica che il file appartenga a QUESTA commessa.
 *
 * Nell'export `Contratto` e `Fornitore` hanno un solo valore su tutte le righe: se un admin
 * carica per sbaglio l'export di un'altra commessa, l'import lo rifiuta prima di toccare il DB.
 */
export function validaProvenienza(
  righe: readonly { contratto: string | null; fornitore: string | null }[],
  attesi: { contratto?: string; fornitore?: string } = {},
): EsitoValidazione {
  if (righe.length === 0) {
    return { ok: false, motivo: 'Il file non contiene righe con un ordine valido.' };
  }
  const contrattoAtteso = attesi.contratto ?? CONTRATTO_COMMESSA;
  const fornitoreAtteso = attesi.fornitore ?? FORNITORE_COMMESSA;

  const contrattiEstranei = new Set<string>();
  const fornitoriEstranei = new Set<string>();
  for (const r of righe) {
    const c = String(r.contratto ?? '').trim();
    const f = String(r.fornitore ?? '').trim();
    if (c !== contrattoAtteso) contrattiEstranei.add(c || '(vuoto)');
    if (f !== fornitoreAtteso) fornitoriEstranei.add(f || '(vuoto)');
  }
  if (contrattiEstranei.size > 0) {
    return {
      ok: false,
      motivo: `Il file contiene ordini di un altro contratto (atteso ${contrattoAtteso}).`,
      dettagli: [...contrattiEstranei].slice(0, 5),
    };
  }
  if (fornitoriEstranei.size > 0) {
    return {
      ok: false,
      motivo: `Il file contiene ordini di un altro fornitore (atteso ${fornitoreAtteso}).`,
      dettagli: [...fornitoriEstranei].slice(0, 5),
    };
  }
  return { ok: true };
}
