import { describe, it, expect } from 'vitest';
import { buildInterventoConsuntivoBase, buildVoceConsuntivo } from './nuovoOrdine';
import { buildTassonomiaIndex, chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const tass: TassonomiaRiga[] = [
  {
    committente: 'acea',
    descrizione: 'RIMOZIONE MISURATORE',
    descrizioneNorm: chiaveTassonomia('RIMOZIONE MISURATORE'),
    gruppo: 'RIMOZIONI',
    attivo: true,
  } as TassonomiaRiga,
];
const indice = buildTassonomiaIndex(tass);

const campi: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', ordine: 1, opzioni: ['SI', 'NO'] },
];

describe('buildInterventoConsuntivoBase', () => {
  it('classifica via tassonomia, origine consuntivo, mappa anagrafica', () => {
    const rec = buildInterventoConsuntivoBase(
      'acea',
      { odl: ' ODL9 ', pdr: 'P1', via: 'VIA A', comune: 'ROMA', matricola: 'M1', attivita: 'rimozione misuratore', coordinate: '41.9, 12.5' },
      { data: '2026-07-20', territorio_id: 'terr-1' },
      indice,
    );
    expect(rec.origine).toBe('consuntivo');
    expect(rec.created_from_mappa).toBe(false);
    expect(rec.odl).toBe('ODL9'); // trim
    expect(rec.intervento_tipo).toBe('RIMOZIONE MISURATORE'); // forma canonica
    expect(rec.gruppo_attivita).toBe('RIMOZIONI');
    expect(rec.matricola_contatore).toBe('M1');
    expect(rec.territorio_id).toBe('terr-1');
    expect(rec.lat).toBeCloseTo(41.9);
    expect(rec.lng).toBeCloseTo(12.5);
  });

  it('attività fuori tassonomia → gruppo null, testo grezzo conservato', () => {
    const rec = buildInterventoConsuntivoBase('acea', { attivita: 'PIPPO SCONOSCIUTO' }, { data: '2026-07-20' }, indice);
    expect(rec.gruppo_attivita).toBeNull();
    expect(rec.intervento_tipo).toBe('PIPPO SCONOSCIUTO');
  });
});

describe('buildVoceConsuntivo', () => {
  it('voce contenitore manuale approvata con campi_snapshot e risposte', () => {
    const voce = buildVoceConsuntivo({
      rapportinoId: 'rap-1',
      committente: 'acea',
      anagrafica: { odl: 'ODL9', matricola: 'M1', via: 'VIA A', attivita: 'RIMOZIONE MISURATORE' },
      risposte: { eseguito: 'SI' },
      campi,
    });
    expect(voce.manuale).toBe(true);
    expect(voce.approvazione_stato).toBe('approvato');
    expect(voce.matricola).toBe('M1');
    expect(voce.odl).toBe('ODL9');
    expect(voce.campi_snapshot).toEqual(campi);
    expect(voce.risposte).toEqual({ eseguito: 'SI' });
    expect(voce.raw_json._consuntivo).toBe(true);
    expect('richiesta_id' in voce).toBe(false); // niente coda interventi_manuali
  });
});
