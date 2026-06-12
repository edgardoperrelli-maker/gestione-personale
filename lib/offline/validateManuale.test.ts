import { describe, it, expect } from 'vitest';
import { validaManualeClient } from './validateManuale';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'foto_contatore', tipo: 'foto', etichetta: 'Foto contatore', ordine: 1, obbligatoria: true } as TemplateCampo,
];

describe('validaManualeClient', () => {
  it('ok con anagrafica valida e foto obbligatorie presenti', () => {
    const r = validaManualeClient({ anagrafica: { pdr: '123', via: 'Roma' }, campiTemplate: campi, slotFotoPresenti: { foto_contatore: true } });
    expect(r.ok).toBe(true);
  });
  it('errore se manca identificativo/indirizzo', () => {
    const r = validaManualeClient({ anagrafica: { note: 'x' }, campiTemplate: campi, slotFotoPresenti: { foto_contatore: true } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/identificativo|indirizzo/i);
  });
  it('errore se manca una foto obbligatoria', () => {
    const r = validaManualeClient({ anagrafica: { pdr: '123', via: 'Roma' }, campiTemplate: campi, slotFotoPresenti: { foto_contatore: false } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/foto/i);
  });
  it('esito negativo → foto non obbligatorie (ok anche senza foto)', () => {
    const campiNeg = [
      ...campi,
      { chiave: 'assente', etichetta: 'Assente', tipo: 'crocetta', ordine: 2 } as TemplateCampo,
    ];
    const r = validaManualeClient({
      anagrafica: { pdr: '123', via: 'Roma' },
      campiTemplate: campiNeg,
      slotFotoPresenti: { foto_contatore: false },
      risposte: { assente: true },
    });
    expect(r.ok).toBe(true);
  });
});
