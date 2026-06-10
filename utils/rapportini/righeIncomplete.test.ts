import { describe, it, expect } from 'vitest';
import { righeIncomplete } from './righeIncomplete';

const campi = [
  { chiave: 'prima', etichetta: 'Prima', tipo: 'foto', ordine: 1, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'dopo', etichetta: 'Dopo', tipo: 'foto', ordine: 2, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'resina', etichetta: 'Resina', tipo: 'foto', ordine: 3, scope_foto: 'fase', obbligatoria: true },
  { chiave: 'interc', etichetta: 'Intercettazione', tipo: 'foto', ordine: 4, scope_foto: 'accessoria' },
] as never;

const voce = { id: 'v1', via: 'Via Roma 1', risposte: { resina: 'path/r.jpg' } };

describe('righeIncomplete', () => {
  it('riga senza foto obbligatoria → incompleta', () => {
    const r = righeIncomplete([voce] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg' } }] as never, campi);
    expect(r.ok).toBe(false);
    expect(r.dettagli[0]).toMatchObject({ tipo: 'riga', matricola: 'M1', campiMancanti: ['Dopo'] });
  });
  it('riga completa + fase presente → ok', () => {
    const r = righeIncomplete([voce] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg', dopo: 'd.jpg' } }] as never, campi);
    expect(r.ok).toBe(true);
    expect(r.dettagli).toEqual([]);
  });
  it('civico con fase obbligatoria mancante → incompleto', () => {
    const voceNoFase = { id: 'v1', via: 'Via Roma 1', risposte: {} };
    const r = righeIncomplete([voceNoFase] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg', dopo: 'd.jpg' } }] as never, campi);
    expect(r.ok).toBe(false);
    expect(r.dettagli.some((d) => d.tipo === 'civico' && d.campiMancanti.includes('Resina'))).toBe(true);
  });
  it('accessorie ignorate', () => {
    const r = righeIncomplete([voce] as never, [{ id: 'r1', voce_id: 'v1', matricola: 'M1', risposte: { prima: 'p.jpg', dopo: 'd.jpg' } }] as never, campi);
    expect(r.ok).toBe(true);
  });
  it('nessuna riga → ok', () => {
    const r = righeIncomplete([voce] as never, [] as never, campi);
    expect(r.ok).toBe(true);
  });
});
