// tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs
// PURO: mappa le righe del master ACEA (colonne risolte per NOME dal config) alla forma "grezza"
// attesa da estraiPianificabili. Bypassa l'auto-rilevamento (che cerca "matricola" esatto e
// salterebbe il DUNNING, dove la colonna è "Matricola misuratore").
import { risolviColonna } from '../colonne.mjs';

const t = (v) => String(v ?? '').trim();

/** Indice 1-based della riga intestazione: la prima (entro maxScan) che contiene la colonna chiave
 *  (match per NOME, robusto ad accenti/maiuscole). Fallback: 1.
 *  NB: NON usa isFileMaster (che pretende "matricola" esatto e fallirebbe sul DUNNING dove la
 *  colonna è "Matricola misuratore"). `righe` = celle per riga, 0-based (index 0 = riga 1 del foglio). */
export function trovaIntestazioneAcea(righe, nomeColonnaChiave, maxScan = 15) {
  const lista = righe ?? [];
  const lim = Math.min(maxScan, lista.length);
  for (let i = 0; i < lim; i++) {
    if (risolviColonna(lista[i] ?? [], nomeColonnaChiave) >= 0) return i + 1;
  }
  return 1;
}

/** matrix: righe dati [riga][cella] (0-based). header: array intestazione. colonne: nomi-colonna.
 *  primaRigaDati = numero di riga (1-based) della prima riga dati (header su riga prima). */
export function mappaRigheMaster(matrix, header, colonne, primaRigaDati = 2) {
  const idx = {
    odl: risolviColonna(header, colonne.odl),
    esecutore: risolviColonna(header, colonne.esecutore),
    data: risolviColonna(header, colonne.data),
    matricola: risolviColonna(header, colonne.matricola),
    indirizzo: risolviColonna(header, colonne.indirizzo),
    comune: risolviColonna(header, colonne.comune),
    attivita: risolviColonna(header, colonne.attivita), // "Operazione testo breve" (B); -1 se non configurata
    stato: risolviColonna(header, colonne.stato),
    esito: risolviColonna(header, colonne.esito), // ZAGAROLO "esito" (eseguito/no); -1 se assente
    saracinesca: risolviColonna(header, colonne.saracinesca), // ZAGAROLO "saracinesca" (SI)
    odlSaracinesca: risolviColonna(header, colonne.odlSaracinesca), // ZAGAROLO "Odl saracinesca" (figlio)
  };
  const cella = (row, i) => (i >= 0 && row[i] != null ? t(row[i]) : '');
  const out = [];
  for (let r = 0; r < (matrix ?? []).length; r++) {
    const row = matrix[r] ?? [];
    out.push({
      riga: primaRigaDati + r, // numero di riga reale nel foglio
      odl: cella(row, idx.odl),
      matricola: cella(row, idx.matricola),
      indirizzo: cella(row, idx.indirizzo),
      comune: cella(row, idx.comune),
      esecutore: cella(row, idx.esecutore),
      attivita: cella(row, idx.attivita), // attività specifica della riga (es. SOSPENSIONE)
      dataRaw: cella(row, idx.data),
      esitoRaw: '', // il master DUNNING non ha "esito" in lettura: sempre pianificabile
      statoRaw: cella(row, idx.stato), // Stato Operazione (DUNNING); '' se colonne.stato assente
      esito: cella(row, idx.esito), // ZAGAROLO esito (eseguito/no)
      saracinesca: cella(row, idx.saracinesca), // ZAGAROLO saracinesca (SI)
      odlSaracinesca: cella(row, idx.odlSaracinesca), // ZAGAROLO Odl saracinesca (figlio)
    });
  }
  return out;
}
