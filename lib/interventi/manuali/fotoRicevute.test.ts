import { describe, it, expect } from 'vitest';
import { partiFotoRicevute, etichettaSlotFoto } from './fotoRicevute';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

describe('partiFotoRicevute', () => {
  it('estrae solo le parti foto:* con file non vuoto', () => {
    const form = new FormData();
    form.append('dati', JSON.stringify({ committente: 'lim_massive' }));
    form.append('foto:lettura', new Blob(['xx'], { type: 'image/jpeg' }), 'lettura.jpg');
    form.append('foto:sigillo', new Blob(['yy'], { type: 'image/jpeg' }), 'sigillo.jpg');
    form.append('foto:vuota', new Blob([], { type: 'image/jpeg' }), 'vuota.jpg');
    const out = partiFotoRicevute(form);
    expect(out.map((p) => p.chiave).sort()).toEqual(['lettura', 'sigillo']);
    expect(out.every((p) => p.file.size > 0)).toBe(true);
  });
  it('ritorna [] senza parti foto', () => {
    const form = new FormData();
    form.append('dati', '{}');
    expect(partiFotoRicevute(form)).toEqual([]);
  });
});

describe('etichettaSlotFoto', () => {
  const campi: TemplateCampo[] = [
    { tipo: 'foto', chiave: 'lettura', etichetta: 'Lettura misuratore', ordine: 1 } as TemplateCampo,
    { tipo: 'testo', chiave: 'note', etichetta: 'Note', ordine: 2 } as TemplateCampo,
  ];
  it('usa l’etichetta del campo foto se la chiave combacia', () => {
    expect(etichettaSlotFoto('lettura', campi)).toBe('Lettura misuratore');
  });
  it('fallback alla chiave se lo slot non è un campo foto noto', () => {
    expect(etichettaSlotFoto('sconosciuto', campi)).toBe('sconosciuto');
    expect(etichettaSlotFoto('note', campi)).toBe('note'); // 'note' non è tipo foto
  });
});
