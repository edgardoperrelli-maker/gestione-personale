import { describe, it, expect } from 'vitest';
import { gruppiPerRapportino, type RigaSelezionataPerRapportino } from './caricaSuRapportino';

const ATTIVI = [
  { id: 's1', display_name: 'DANIELE BELLOMO' },
  { id: 's2', display_name: 'SPAGNOLI LUCA' },
];

const riga = (over: Partial<RigaSelezionataPerRapportino> = {}): RigaSelezionataPerRapportino => ({
  pianificato_a: 'DANIELE BELLOMO', pianificato_il: '2026-07-30', ...over,
});

describe('gruppiPerRapportino', () => {
  it('raggruppa per (esecutore, giorno) e conta le righe', () => {
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga(), riga(), riga({ pianificato_a: 'SPAGNOLI LUCA' })],
      ATTIVI,
    );
    expect(nonPronte).toBe(0);
    expect(gruppi).toEqual([
      { staffId: 's1', nome: 'DANIELE BELLOMO', data: '2026-07-30', righe: 2 },
      { staffId: 's2', nome: 'SPAGNOLI LUCA', data: '2026-07-30', righe: 1 },
    ]);
  });

  it('lo stesso esecutore su due giorni fa due gruppi: due rapportini diversi', () => {
    const { gruppi } = gruppiPerRapportino(
      [riga(), riga({ pianificato_il: '2026-07-31' })],
      ATTIVI,
    );
    expect(gruppi.map((g) => g.data)).toEqual(['2026-07-30', '2026-07-31']);
  });

  it('senza esecutore o senza data la riga non è pronta: si conta, non si inventa', () => {
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga({ pianificato_a: null }), riga({ pianificato_il: null }), riga()],
      ATTIVI,
    );
    expect(nonPronte).toBe(2);
    expect(gruppi).toHaveLength(1);
  });

  it('un APPUNTO non si carica: non c’è nessun intervento dietro', () => {
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga({ pianificazione_parziale: true })],
      ATTIVI,
    );
    expect(nonPronte).toBe(1);
    expect(gruppi).toEqual([]);
  });

  it('il nome si risolve senza badare a maiuscole e spazi doppi', () => {
    const { gruppi } = gruppiPerRapportino(
      [riga({ pianificato_a: '  daniele   bellomo ' })],
      ATTIVI,
    );
    expect(gruppi[0]?.staffId).toBe('s1');
  });

  it('un nome che non risolve sugli attivi non è pronto', () => {
    // Capita quando la tabella mostra l'uuid di ripiego o l'elenco attivi non è caricato.
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga({ pianificato_a: 'uuid-non-nome' })],
      ATTIVI,
    );
    expect(nonPronte).toBe(1);
    expect(gruppi).toEqual([]);
  });

  it('selezione vuota: niente gruppi, niente non-pronte', () => {
    expect(gruppiPerRapportino([], ATTIVI)).toEqual({ gruppi: [], nonPronte: 0 });
  });
});
