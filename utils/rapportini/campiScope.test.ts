import { describe, it, expect } from 'vitest';
import { campiPerScope } from './campiScope';

const campi = [
  { chiave: 'prima', etichetta: 'Prima', tipo: 'foto', ordine: 1, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'dopo', etichetta: 'Dopo', tipo: 'foto', ordine: 2, scope_foto: 'misuratore', obbligatoria: true },
  { chiave: 'resina1', etichetta: 'Resina 1', tipo: 'foto', ordine: 3, scope_foto: 'fase' },
  { chiave: 'interc', etichetta: 'Intercettazione', tipo: 'foto', ordine: 4, scope_foto: 'accessoria' },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 5 },
  { chiave: 'vecchia_foto', etichetta: 'Foto', tipo: 'foto', ordine: 6 }, // senza scope → default misuratore
];

describe('campiPerScope', () => {
  it('partiziona i campi foto per scope (default misuratore)', () => {
    const r = campiPerScope(campi as never);
    expect(r.misuratore.map((c) => c.chiave)).toEqual(['prima', 'dopo', 'vecchia_foto']);
    expect(r.fase.map((c) => c.chiave)).toEqual(['resina1']);
    expect(r.accessoria.map((c) => c.chiave)).toEqual(['interc']);
  });
  it('esclude i campi non-foto', () => {
    const r = campiPerScope(campi as never);
    const tutte = [...r.misuratore, ...r.fase, ...r.accessoria];
    expect(tutte.some((c) => c.chiave === 'note')).toBe(false);
  });
  it('ordina per ordine crescente', () => {
    const r = campiPerScope([
      { chiave: 'b', etichetta: 'B', tipo: 'foto', ordine: 2, scope_foto: 'misuratore' },
      { chiave: 'a', etichetta: 'A', tipo: 'foto', ordine: 1, scope_foto: 'misuratore' },
    ] as never);
    expect(r.misuratore.map((c) => c.chiave)).toEqual(['a', 'b']);
  });
});
