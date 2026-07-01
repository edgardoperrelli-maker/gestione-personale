import { describe, it, expect } from 'vitest';
import { preparaRigheMasterSnapshot } from './masterSnapshotIngest';

describe('preparaRigheMasterSnapshot', () => {
  it('per le saracinesche (odl padre "DA CHIEDERE") usa l\'Odl figlio come chiave → non le collassa', () => {
    const out = preparaRigheMasterSnapshot([
      { odl: 'DA CHIEDERE', matricola: 'M1', saracinesca: 'SI', esito: 'eseguito', odlSaracinesca: '912354706' },
      { odl: 'DA CHIEDERE', matricola: 'M2', saracinesca: 'SI', esito: 'eseguito', odlSaracinesca: '912354717' },
    ]);
    expect(out.map((r) => r.odl)).toEqual(['912354706', '912354717']);
    expect(out[0].odl_saracinesca).toBe('912354706');
    expect(out[0].saracinesca).toBe('SI');
  });

  it('dedup per odl (prima vince) sulle righe normali', () => {
    const out = preparaRigheMasterSnapshot([
      { odl: '111', attivita: 'A' },
      { odl: '111', attivita: 'B' },
      { odl: '222', attivita: 'C' },
    ]);
    expect(out.map((r) => r.odl)).toEqual(['111', '222']);
    expect(out[0].attivita).toBe('A');
  });

  it('scarta le righe senza odl né Odl saracinesca', () => {
    const out = preparaRigheMasterSnapshot([{ odl: '', attivita: 'X' }, { odl: '  ' }]);
    expect(out).toEqual([]);
  });

  it('righe normali: odl invariato, odl_saracinesca null', () => {
    const out = preparaRigheMasterSnapshot([{ odl: '999', attivita: 'Limitazione' }]);
    expect(out[0].odl).toBe('999');
    expect(out[0].odl_saracinesca).toBeNull();
  });

  it('due saracinesche stesso Odl figlio → dedup a una', () => {
    const out = preparaRigheMasterSnapshot([
      { odl: 'DA CHIEDERE', saracinesca: 'SI', odlSaracinesca: '900' },
      { odl: 'DA CHIEDERE', saracinesca: 'SI', odlSaracinesca: '900' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].odl).toBe('900');
  });

  it('senza ordine vero (vuoto o DA CHIEDERE/RICHIEDERE) usa MAT:matricola', () => {
    const out = preparaRigheMasterSnapshot([
      { odl: '', matricola: '202015', saracinesca: 'SI', esito: 'eseguito' },
      { odl: 'DA CHIEDERE', matricola: '202016', saracinesca: 'SI', esito: 'eseguito' },
      { odl: 'DA RICHIEDERE', matricola: '202017' },
    ]);
    expect(out.map((r) => r.odl)).toEqual(['MAT:202015', 'MAT:202016', 'MAT:202017']);
  });

  it('ODL numerico vero resta invariato (DUNNING/ZAGAROLO ordinati)', () => {
    const out = preparaRigheMasterSnapshot([{ odl: '912345', matricola: 'M1' }]);
    expect(out[0].odl).toBe('912345');
  });

  it('Odl saracinesca ha precedenza anche con matricola presente', () => {
    const out = preparaRigheMasterSnapshot([{ odl: 'DA CHIEDERE', matricola: 'M1', odlSaracinesca: '912354706' }]);
    expect(out[0].odl).toBe('912354706');
  });

  it('due righe manuali stessa matricola → dedup a una (MAT:)', () => {
    const out = preparaRigheMasterSnapshot([
      { odl: '', matricola: '999', saracinesca: 'SI', esito: 'eseguito' },
      { odl: '', matricola: '999', saracinesca: 'SI', esito: 'eseguito' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].odl).toBe('MAT:999');
  });
});
