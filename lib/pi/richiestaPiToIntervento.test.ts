import { describe, it, expect } from 'vitest';
import { richiestaPiToIntervento, CHIAVI_PI } from './richiestaPiToIntervento';
import type { DatiInterventoManuale } from '@/lib/interventi/manuali/types';

const dati: DatiInterventoManuale = {
  committente: 'altro',
  anagrafica: { [CHIAVI_PI.indirizzo]: 'Via Aretina 59', [CHIAVI_PI.comune]: 'Firenze' },
  risposte: {
    [CHIAVI_PI.nSegnalazione]: 'ST-897-G-2025',
    [CHIAVI_PI.oraInizio]: '21:30',
    [CHIAVI_PI.oraFine]: '23:00',
    [CHIAVI_PI.assistenteTe]: 'Alessandrini',
    [CHIAVI_PI.note]: 'Messa in sicurezza',
  },
};

describe('richiestaPiToIntervento', () => {
  const rec = richiestaPiToIntervento(dati, { data: '2026-06-25', staff_id: 's1' });

  it('emette origine=pronto_intervento e committente=altro (non inquina la coda manuali)', () => {
    expect(rec.origine).toBe('pronto_intervento');
    expect(rec.committente).toBe('altro');
  });
  it('mappa indirizzo/comune e N° segnalazione su rif_esterno', () => {
    expect(rec.indirizzo).toBe('Via Aretina 59');
    expect(rec.comune).toBe('Firenze');
    expect(rec.rif_esterno).toBe('ST-897-G-2025');
  });
  it('intervento completato/positivo con data e staff dal contesto', () => {
    expect(rec.stato).toBe('completato');
    expect(rec.esito).toBe('eseguito_positivo');
    expect(rec.data).toBe('2026-06-25');
    expect(rec.staff_id).toBe('s1');
  });
  it('campi vuoti → null', () => {
    const r = richiestaPiToIntervento({ committente: 'altro', anagrafica: {}, risposte: {} }, { data: '2026-06-25', staff_id: 's1' });
    expect(r.indirizzo).toBeNull();
    expect(r.rif_esterno).toBeNull();
  });
});
