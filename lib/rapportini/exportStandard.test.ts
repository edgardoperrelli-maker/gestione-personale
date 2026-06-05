import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildRapportinoXlsx } from './exportStandard';

async function readBack(buf: Buffer): Promise<unknown[][]> {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
}

describe('buildRapportinoXlsx', () => {
  it('colonne dinamiche: info_snapshot + ORDINE + campi', async () => {
    const rap = {
      staff_name: 'Mario', data: '2026-06-03',
      info_snapshot: [
        { chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 1 },
        { chiave: 'via', etichetta: 'INDIRIZZO', ordine: 2 },
      ],
      campi_snapshot: [
        { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
        { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
      ],
    };
    const voci = [{ ordine: 1, matricola: 'M1', via: 'VIA ROMA 1', risposte: { att_cess: true, note: 'ok' } }];
    const rows = await readBack(await buildRapportinoXlsx(rap as never, voci as never));
    expect((rows[5] as unknown[]).slice(0, 5)).toEqual(['MATRICOLA', 'INDIRIZZO', 'ORDINE', 'ATT/CESS', 'Note']);
    expect((rows[6] as unknown[]).slice(0, 5)).toEqual(['M1', 'VIA ROMA 1', 1, 'X', 'ok']);
  });

  it('nasconde le colonne interamente vuote (info e campi)', async () => {
    const rap = {
      staff_name: 'Mario', data: '2026-06-03',
      info_snapshot: [
        { chiave: 'matricola', etichetta: 'MATRICOLA', ordine: 1 },
        { chiave: 'pdr', etichetta: 'PDR', ordine: 2 },
        { chiave: 'via', etichetta: 'INDIRIZZO', ordine: 3 },
      ],
      campi_snapshot: [
        { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
        { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
      ],
    };
    const voci = [
      { ordine: 1, matricola: 'M1', pdr: '', via: 'VIA ROMA 1', risposte: { att_cess: false, note: 'ok' } },
    ];
    const rows = await readBack(await buildRapportinoXlsx(rap as never, voci as never));
    expect((rows[5] as unknown[]).slice(0, 4)).toEqual(['MATRICOLA', 'INDIRIZZO', 'ORDINE', 'Note']);
    expect((rows[6] as unknown[]).slice(0, 4)).toEqual(['M1', 'VIA ROMA 1', 1, 'ok']);
  });

  it('info_snapshot vuoto → fallback agli 11 campi', async () => {
    const rap = { staff_name: 'X', data: '2026-06-03', info_snapshot: [], campi_snapshot: [] };
    const rows = await readBack(await buildRapportinoXlsx(rap as never, [] as never));
    expect((rows[5] as unknown[]).slice(0, 12)).toEqual([
      'NOMINATIVO', 'MATRICOLA', 'PDR', 'ODS/ODL', 'VIA', 'COMUNE', 'CAP', 'RECAPITO', 'ATTIVITA', 'ACCESSIBILITA', 'FASCIA ORARIA', 'ORDINE',
    ]);
  });
});
