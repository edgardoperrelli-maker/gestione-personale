import { describe, it, expect } from 'vitest';
import { attivitaDaClassificare } from './riconciliaAlias';
import { aliasKey } from './attivitaCanonica';

describe('attivitaDaClassificare', () => {
  const esistenti = new Set<string>([aliasKey('acea', 'LIMITAZIONE MASSIVA')]);

  it('propone solo le attività NON già in alias, come "Da classificare" sul committente grezzo', () => {
    const r = attivitaDaClassificare(
      [
        { committente: 'acea', intervento_tipo: 'Limitazione massiva' }, // già in alias
        { committente: 'acea', intervento_tipo: 'Nuova attività X' }, // nuova
      ],
      esistenti,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      committente_orig: 'acea',
      chiave: 'NUOVA ATTIVITA X',
      committente_eff: 'acea',
      macrogruppo: 'Da classificare',
      attivita_pulita: 'Nuova attività X',
      attivo: true,
    });
  });

  it('deduplica le varianti che collassano sulla stessa chiave (una sola riga)', () => {
    const r = attivitaDaClassificare(
      [
        { committente: 'acea', intervento_tipo: 'PULIZIA POZZETTO' },
        { committente: 'acea', intervento_tipo: 'Pulizia  pozzetto' },
        { committente: 'acea', intervento_tipo: 'pulizia pozzetto ' },
      ],
      new Set(),
    );
    expect(r).toHaveLength(1);
    expect(r[0].chiave).toBe('PULIZIA POZZETTO');
  });

  it('distingue per committente (stessa chiave, committenti diversi = due righe)', () => {
    const r = attivitaDaClassificare(
      [
        { committente: 'acea', intervento_tipo: 'Test' },
        { committente: 'italgas', intervento_tipo: 'Test' },
      ],
      new Set(),
    );
    expect(r).toHaveLength(2);
    expect(new Set(r.map((x) => x.committente_orig))).toEqual(new Set(['acea', 'italgas']));
  });

  it('deriva la voce quando il testo lo consente (LIMITAZ→10) e la lascia null altrimenti', () => {
    const r = attivitaDaClassificare(
      [
        { committente: 'acea', intervento_tipo: 'Limitazione speciale' },
        { committente: 'acea', intervento_tipo: 'Cosa ignota' },
      ],
      new Set(),
    );
    const byChiave = Object.fromEntries(r.map((x) => [x.chiave, x.voce]));
    expect(byChiave['LIMITAZIONE SPECIALE']).toBe(10);
    expect(byChiave['COSA IGNOTA']).toBeNull();
  });

  it('ignora i testi vuoti (senza attività: gestiti dalle regole per comune)', () => {
    const r = attivitaDaClassificare(
      [
        { committente: 'acea', intervento_tipo: '' },
        { committente: 'acea', intervento_tipo: '   ' },
        { committente: 'acea', intervento_tipo: null },
        { committente: '', intervento_tipo: 'X' },
      ],
      new Set(),
    );
    expect(r).toHaveLength(0);
  });
});
