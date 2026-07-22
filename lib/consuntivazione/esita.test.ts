import { describe, it, expect } from 'vitest';
import { valutaEsito, calcolaEsitazione, type DatiEsitazione } from './esita';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NO'] },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
];

const base: Omit<DatiEsitazione, 'risposte'> = {
  interventoId: 'int-1',
  committente: 'acea',
  interventoTipo: 'RIMOZIONE CONTATORE',
  campi,
  esecutori: [
    { staff_id: 's1', staff_name: 'MARIO' },
    { staff_id: 's2', staff_name: 'LUIGI' },
  ],
  consuntivatoDa: 'user-1',
  nowIso: '2026-07-22T10:00:00.000Z',
  esecuzioneIso: '2026-07-20T08:30:00.000Z',
  positivoOriginale: null,
  voce: { matricola: 'MAT123', pdr: 'PDR9', via: 'VIA ROMA 1', comune: 'ROMA', odl: 'ODL1' },
  rapportinoId: 'rap-1',
};

describe('valutaEsito', () => {
  it('verde → positivo', () => expect(valutaEsito({ eseguito: 'SI' }, campi)).toBe('positivo'));
  it('rossa → negativo', () => expect(valutaEsito({ eseguito: 'NO', note: 'ASSENTE' }, campi)).toBe('negativo'));
  it('neutro → neutro', () => expect(valutaEsito({}, campi)).toBe('neutro'));
});

describe('calcolaEsitazione', () => {
  it('positivo ACEA rimozione con matricola → completato + registro misuratori + voce KPI 12 (ERC)', () => {
    const r = calcolaEsitazione({ ...base, risposte: { eseguito: 'SI' } });
    expect(r.esitoVoce).toBe('positivo');
    expect(r.patch.stato).toBe('completato');
    expect(r.patch.esito).toBe('eseguito_positivo');
    expect(r.patch.staff_id).toBe('s1'); // primario
    expect(r.patch.esecutori).toHaveLength(2);
    expect(r.patch.voce).toBe(12); // RIMOZIONE CONTATORE → ERC
    expect(r.patch.chiuso_at).toBe('2026-07-20T08:30:00.000Z');
    expect(r.patch.assegnato_at).toBe('2026-07-20T08:30:00.000Z');
    expect(r.patch.consuntivato_da).toBe('user-1');
    expect(r.misuratore).not.toBeNull();
    expect(r.misuratore?.matricola).toBe('MAT123');
    expect(r.misuratore?.esecutore).toBe('MARIO'); // nome del primario
    expect(r.misuratore?.data_esecuzione).toBe('2026-07-20');
  });

  it('negativo → completato senza esito e senza registro, nota nel motivo', () => {
    const r = calcolaEsitazione({ ...base, risposte: { eseguito: 'NO', note: 'ACCESSO NEGATO' } });
    expect(r.esitoVoce).toBe('negativo');
    expect(r.patch.stato).toBe('completato');
    expect(r.patch.esito).toBeNull();
    expect(r.patch.esito_motivo).toBe('ACCESSO NEGATO');
    expect(r.misuratore).toBeNull();
  });

  it('doppio positivo → annullato + da_riconciliare, nessun registro', () => {
    const r = calcolaEsitazione({
      ...base,
      risposte: { eseguito: 'SI' },
      positivoOriginale: { id: 'altro-int', data: '2026-07-10' },
    });
    expect(r.decisione.tipo).toBe('annulla_doppio_positivo');
    expect(r.patch.stato).toBe('annullato');
    expect(r.patch.esito).toBeNull();
    expect(r.patch.da_riconciliare).toBe(true);
    expect(r.patch.riconciliazione_rif_id).toBe('altro-int');
    expect(r.misuratore).toBeNull();
  });

  it('positivo su ODL con positivo negativo altrove (chiudi_e_riconcilia non scatta su positivo): originale = se stesso → normale', () => {
    const r = calcolaEsitazione({
      ...base,
      risposte: { eseguito: 'SI' },
      positivoOriginale: { id: 'int-1', data: '2026-07-20' }, // stesso intervento (re-invio)
    });
    expect(r.decisione.tipo).toBe('normale');
    expect(r.patch.stato).toBe('completato');
    expect(r.misuratore).not.toBeNull();
  });

  it('negativo su ODL già positivo altrove → chiudi_e_riconcilia (completato + da_riconciliare)', () => {
    const r = calcolaEsitazione({
      ...base,
      risposte: { eseguito: 'NO', note: 'GIA FATTO' },
      positivoOriginale: { id: 'altro-int', data: '2026-07-10' },
    });
    expect(r.decisione.tipo).toBe('chiudi_e_riconcilia');
    expect(r.patch.stato).toBe('completato');
    expect(r.patch.da_riconciliare).toBe(true);
    expect(r.misuratore).toBeNull();
  });

  it('positivo NON-ACEA → nessun registro misuratori', () => {
    const r = calcolaEsitazione({ ...base, committente: 'italgas', risposte: { eseguito: 'SI' } });
    expect(r.patch.esito).toBe('eseguito_positivo');
    expect(r.misuratore).toBeNull();
  });

  it('positivo ACEA ma tipo ABUSIVO → escluso dal registro (isRimozioneTipo false)', () => {
    const r = calcolaEsitazione({ ...base, interventoTipo: 'RIMOZIONE CONTATORE ABUSIVO', risposte: { eseguito: 'SI' } });
    expect(r.misuratore).toBeNull();
    expect(r.patch.voce).toBe(6); // ABUSIVO → ERA
  });

  it('positivo ACEA rimozione ma matricola voce vuota → nessun registro', () => {
    const r = calcolaEsitazione({ ...base, voce: { ...base.voce, matricola: '  ' }, risposte: { eseguito: 'SI' } });
    expect(r.misuratore).toBeNull();
  });
});
