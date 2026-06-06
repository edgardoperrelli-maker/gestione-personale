import { describe, it, expect } from 'vitest';
import { normalizzaAscii, nomeFotoFile } from './fotoNaming';

describe('normalizzaAscii', () => {
  it('rimuove accenti e spazi', () => {
    expect(normalizzaAscii('Foto contatore')).toBe('FotoContatore');
    expect(normalizzaAscii('Attività à è ì ò ù')).toBe('AttivitaAEIOU');
  });
  it('rimuove i caratteri speciali', () => {
    expect(normalizzaAscii('Via G. D\'Annunzio, 12/B')).toBe('ViaGDAnnunzio12B');
  });
  it('stringa vuota o solo simboli → stringa vuota', () => {
    expect(normalizzaAscii('  ')).toBe('');
    expect(normalizzaAscii('***')).toBe('');
  });
});

describe('nomeFotoFile', () => {
  it('usa il PDR quando presente (priorità massima)', () => {
    const nome = nomeFotoFile(
      'Foto contatore',
      { pdr: '12345', matricola: 'M99', odl: 'O77', indirizzo: 'Via Roma 1' },
      'jpg',
    );
    expect(nome).toBe('FotoContatore_12345.jpg');
  });

  it('usa la matricola se manca il PDR', () => {
    const nome = nomeFotoFile('Foto sigillo', { matricola: 'MAT-77' }, 'jpg');
    expect(nome).toBe('FotoSigillo_MAT77.jpg');
  });

  it('usa l\'ODL se mancano PDR e matricola', () => {
    const nome = nomeFotoFile('Foto matricola', { odl: 'ODL 9001' }, 'png');
    expect(nome).toBe('FotoMatricola_ODL9001.png');
  });

  it('usa l\'indirizzo se mancano PDR, matricola e ODL', () => {
    const nome = nomeFotoFile('Foto panoramica', { indirizzo: 'Via San Giovanni, 3' }, 'jpg');
    expect(nome).toBe('FotoPanoramica_ViaSanGiovanni3.jpg');
  });

  it('fallback a "intervento" se nessun identificativo', () => {
    const nome = nomeFotoFile('Foto contatore', {}, 'jpg');
    expect(nome).toBe('FotoContatore_intervento.jpg');
  });

  it('normalizza etichette con accenti/spazi e identificativo', () => {
    const nome = nomeFotoFile('Foto attività à', { pdr: 'PDR 0042' }, 'JPEG');
    expect(nome).toBe('FotoAttivitaA_PDR0042.jpeg');
  });

  it('etichetta vuota → "foto" come base', () => {
    const nome = nomeFotoFile('   ', { pdr: '7' }, 'jpg');
    expect(nome).toBe('foto_7.jpg');
  });
});
