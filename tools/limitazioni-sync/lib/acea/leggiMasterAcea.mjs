// tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs
// PURO: mappa le righe del master ACEA (colonne risolte per NOME dal config) alla forma "grezza"
// attesa da estraiPianificabili. Bypassa l'auto-rilevamento (che cerca "matricola" esatto e
// salterebbe il DUNNING, dove la colonna è "Matricola misuratore").
import { risolviColonna } from '../colonne.mjs';

const t = (v) => String(v ?? '').trim();

/** matrix: righe dati [riga][cella] (0-based). header: array intestazione. colonne: nomi-colonna. */
export function mappaRigheMaster(matrix, header, colonne) {
  const idx = {
    odl: risolviColonna(header, colonne.odl),
    esecutore: risolviColonna(header, colonne.esecutore),
    data: risolviColonna(header, colonne.data),
    matricola: risolviColonna(header, colonne.matricola),
    indirizzo: risolviColonna(header, colonne.indirizzo),
    comune: risolviColonna(header, colonne.comune),
  };
  const cella = (row, i) => (i >= 0 && row[i] != null ? t(row[i]) : '');
  const out = [];
  for (let r = 0; r < (matrix ?? []).length; r++) {
    const row = matrix[r] ?? [];
    out.push({
      riga: r + 2, // header su riga 1 → prima riga dati = 2
      odl: cella(row, idx.odl),
      matricola: cella(row, idx.matricola),
      indirizzo: cella(row, idx.indirizzo),
      comune: cella(row, idx.comune),
      esecutore: cella(row, idx.esecutore),
      dataRaw: cella(row, idx.data),
      esitoRaw: '', // il master DUNNING non ha "esito" in lettura: sempre pianificabile
    });
  }
  return out;
}
