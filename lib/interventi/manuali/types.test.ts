import { describe, it, expect } from 'vitest';
import {
  STATI_RICHIESTA,
  CORSIE_RICHIESTA,
  type StatoRichiesta,
  type CorsiaRichiesta,
  type DatiInterventoManuale,
  type RigaRichiesta,
} from './types';

describe('types interventi manuali', () => {
  it('STATI_RICHIESTA elenca i 5 stati', () => {
    expect(STATI_RICHIESTA).toEqual(['in_attesa', 'approvato', 'rifiutato', 'auto_liberi', 'annullato']);
  });
  it('CORSIE_RICHIESTA elenca le 2 corsie', () => {
    expect(CORSIE_RICHIESTA).toEqual(['normale', 'liberi']);
  });
  it('DatiInterventoManuale separa anagrafica e risposte', () => {
    const d: DatiInterventoManuale = {
      committente: 'italgas',
      anagrafica: { nominativo: 'Mario Rossi', via: 'Via Roma 1', comune: 'Roma' },
      risposte: { att_cess: true, note: 'urgente' },
    };
    expect(d.anagrafica.nominativo).toBe('Mario Rossi');
    expect(d.risposte.att_cess).toBe(true);
  });
  it('RigaRichiesta usa StatoRichiesta e CorsiaRichiesta', () => {
    const r: RigaRichiesta = {
      id: 'r1', rapportino_id: 'rap1', voce_id: 'v1', intervento_id: null,
      staff_id: 's1', staff_name: 'Mario', committente: 'acea', data: '2026-06-06',
      stato: 'in_attesa' as StatoRichiesta, corsia: 'normale' as CorsiaRichiesta,
      dati_operatore: {}, dati_correnti: {}, note: null, motivo_rifiuto: null,
      created_at: '2026-06-06T10:00:00Z',
    };
    expect(r.stato).toBe('in_attesa');
    expect(r.corsia).toBe('normale');
  });
});
