import { describe, it, expect } from 'vitest';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiFoto, validaFotoObbligatorie } from './validaFotoObbligatorie';

const campi: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'foto_contatore', etichetta: 'Foto contatore', tipo: 'foto', obbligatoria: true, ordine: 2 },
  { chiave: 'foto_sigillo', etichetta: 'Foto sigillo', tipo: 'foto', obbligatoria: true, ordine: 3 },
  { chiave: 'foto_extra', etichetta: 'Foto extra', tipo: 'foto', obbligatoria: false, ordine: 4 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 5 },
];

describe('campiFoto', () => {
  it('filtra solo i campi di tipo foto, in ordine', () => {
    expect(campiFoto(campi).map((c) => c.chiave)).toEqual([
      'foto_contatore', 'foto_sigillo', 'foto_extra',
    ]);
  });
});

describe('validaFotoObbligatorie', () => {
  it('ok quando tutti gli slot obbligatori hanno una foto', () => {
    const res = validaFotoObbligatorie(campi, {
      foto_contatore: true,
      foto_sigillo: true,
      // foto_extra mancante ma facoltativo
    });
    expect(res).toEqual({ ok: true, mancanti: [] });
  });

  it('elenca le etichette degli obbligatori mancanti', () => {
    const res = validaFotoObbligatorie(campi, { foto_contatore: true });
    expect(res.ok).toBe(false);
    expect(res.mancanti).toEqual(['Foto sigillo']);
  });

  it('uno slot presente ma con valore falsy conta come mancante', () => {
    const res = validaFotoObbligatorie(campi, {
      foto_contatore: true,
      foto_sigillo: false,
    });
    expect(res.ok).toBe(false);
    expect(res.mancanti).toEqual(['Foto sigillo']);
  });

  it('nessun campo foto obbligatorio → sempre ok', () => {
    const soloFacoltativi: TemplateCampo[] = [
      { chiave: 'foto_extra', etichetta: 'Foto extra', tipo: 'foto', obbligatoria: false, ordine: 1 },
    ];
    expect(validaFotoObbligatorie(soloFacoltativi, {})).toEqual({ ok: true, mancanti: [] });
  });
});
