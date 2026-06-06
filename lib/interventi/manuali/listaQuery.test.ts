import { describe, it, expect } from 'vitest';
import { parseFiltroLista } from './listaQuery';

describe('parseFiltroLista', () => {
  it('default: stato in_attesa, nessun range/staff', () => {
    expect(parseFiltroLista(new URLSearchParams())).toEqual({
      stato: 'in_attesa', from: null, to: null, staff: null,
    });
  });
  it('stato valido viene preso', () => {
    expect(parseFiltroLista(new URLSearchParams({ stato: 'approvato' })).stato).toBe('approvato');
  });
  it('stato sconosciuto → fallback in_attesa', () => {
    expect(parseFiltroLista(new URLSearchParams({ stato: 'pippo' })).stato).toBe('in_attesa');
  });
  it('stato=tutti → null (nessun filtro stato)', () => {
    expect(parseFiltroLista(new URLSearchParams({ stato: 'tutti' })).stato).toBeNull();
  });
  it('from/to validi (YYYY-MM-DD) passano, formati errati → null', () => {
    const f = parseFiltroLista(new URLSearchParams({ from: '2026-06-01', to: 'xx' }));
    expect(f.from).toBe('2026-06-01');
    expect(f.to).toBeNull();
  });
  it('staff trim, vuoto → null', () => {
    expect(parseFiltroLista(new URLSearchParams({ staff: ' s1 ' })).staff).toBe('s1');
    expect(parseFiltroLista(new URLSearchParams({ staff: '  ' })).staff).toBeNull();
  });
});
