// tools/limitazioni-sync/lib/acea/aggiornaStato.mjs
// PURE: aggancia le righe del master per Ordine e SOVRASCRIVE Stato Operazione.
import { trovaHeader, valoreCella } from './parseExport.mjs';
import { norm } from '../match.mjs';

export function aggiornaStato(ws, righeExport, { masterColonnaOdl, masterColonnaStato }) {
  const { riga, idx } = trovaHeader(ws, [masterColonnaOdl, masterColonnaStato]);
  if (riga < 0) return { erroreColonne: true, aggiornate: 0, invariate: 0, nonAgganciate: [], righe: [] };
  const iOdl = idx[masterColonnaOdl];
  const iStato = idx[masterColonnaStato];

  const mappa = new Map();
  for (const r of righeExport) if (r.ordine) mappa.set(r.ordine, r.stato);

  const visti = new Set();
  let aggiornate = 0;
  let invariate = 0;
  const righe = [];

  for (let r = riga + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ordine = norm(valoreCella(row.getCell(iOdl + 1).value));
    if (!ordine || !mappa.has(ordine)) continue;
    visti.add(ordine);
    const nuovo = String(mappa.get(ordine) ?? '').trim();
    const cell = row.getCell(iStato + 1);
    const precedente = String(valoreCella(cell.value) ?? '').trim();
    if (precedente === nuovo) { invariate++; continue; }
    cell.value = nuovo === '' ? null : nuovo;
    aggiornate++;
    righe.push({
      riga: r, odl: ordine, tipo: 'acea-stato', comune: '', matricola: '',
      esecutore: '', esito: nuovo, sigillo: '', data: '',
      note: precedente ? `era: ${precedente}` : '',
    });
  }

  const nonAgganciate = [...mappa.keys()].filter((o) => !visti.has(o));
  return { erroreColonne: false, aggiornate, invariate, nonAgganciate, righe };
}
