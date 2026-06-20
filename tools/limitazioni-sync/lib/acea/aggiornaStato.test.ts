// tools/limitazioni-sync/lib/acea/aggiornaStato.test.ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { aggiornaStato } from './aggiornaStato.mjs';

function master() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('PIANIFICAZIONE');
  ws.addRow(['Ordine', 'Stato Operazione', 'Esecutore']);
  ws.addRow([957276080, 'Intervento Richiesto', 'CIARALLO']);
  ws.addRow([957289327, 'Ricevuto', 'PRATESI']);
  ws.addRow([999999999, 'Intervento Richiesto', '']);
  return ws;
}

describe('aggiornaStato', () => {
  it('sovrascrive Stato Operazione per Ordine, traccia il precedente, non tocca le altre colonne', () => {
    const ws = master();
    const rep = aggiornaStato(ws, [
      { ordine: '957276080', stato: 'completato' },
      { ordine: '957289327', stato: 'Ricevuto' }, // invariata
      { ordine: '111', stato: 'completato' },       // non agganciata
    ], { masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione' });

    expect(rep.erroreColonne).toBe(false);
    expect(rep.aggiornate).toBe(1);
    expect(rep.invariate).toBe(1);
    expect(rep.nonAgganciate).toEqual(['111']);
    expect(ws.getRow(2).getCell(2).value).toBe('completato');
    expect(ws.getRow(2).getCell(3).value).toBe('CIARALLO'); // Esecutore intatto
    expect(rep.righe[0]).toMatchObject({ riga: 2, odl: '957276080', esito: 'completato', note: 'era: Intervento Richiesto' });
  });

  it('erroreColonne=true se mancano le colonne', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('X');
    ws.addRow(['Pippo']);
    const rep = aggiornaStato(ws, [{ ordine: '1', stato: 'x' }], { masterColonnaOdl: 'Ordine', masterColonnaStato: 'Stato Operazione' });
    expect(rep.erroreColonne).toBe(true);
  });
});
