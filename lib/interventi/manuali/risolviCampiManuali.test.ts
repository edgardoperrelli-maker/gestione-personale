import { describe, it, expect } from 'vitest';
import { risolviCampiManuali } from './risolviCampiManuali';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const fotoA: TemplateCampo = { tipo: 'foto', chiave: 'a', etichetta: 'A', ordine: 1 } as TemplateCampo;
const fotoB: TemplateCampo = { tipo: 'foto', chiave: 'b', etichetta: 'B', ordine: 1 } as TemplateCampo;

describe('risolviCampiManuali', () => {
  it('usa override quando ha almeno un campo', () => {
    expect(risolviCampiManuali([fotoA], [fotoB])).toEqual([fotoA]);
  });
  it('eredita lo standard quando override è vuoto', () => {
    expect(risolviCampiManuali([], [fotoB])).toEqual([fotoB]);
  });
  it('eredita lo standard quando override è null/undefined', () => {
    expect(risolviCampiManuali(null, [fotoB])).toEqual([fotoB]);
    expect(risolviCampiManuali(undefined, [fotoB])).toEqual([fotoB]);
  });
  it('ritorna [] quando entrambi vuoti/assenti', () => {
    expect(risolviCampiManuali([], [])).toEqual([]);
    expect(risolviCampiManuali(null, null)).toEqual([]);
  });
});
