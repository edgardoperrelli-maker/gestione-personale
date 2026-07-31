// La guida vive in una modale aperta dal «?»: il paragrafo fisso sotto la tabella cresceva a ogni
// funzione e si era mangiato tre righe di registro. Questi test presidiano il CONTENUTO — che le
// funzioni della tabella restino documentate — perché è quello che un refactor perde per strada.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContenutoGuida } from './GuidaTabella';

const OGGI = '2026-07-30';   // giovedì

describe('ContenutoGuida', () => {
  it('documenta ogni famiglia di gesti della tabella', () => {
    const html = renderToStaticMarkup(<ContenutoGuida oggi={OGGI} famiglia="dunning" />);
    for (const frase of [
      'Modifica in cella', 'Copia e incolla', 'Righe spuntate', 'Quando si programma', 'Colonne',
      'calendario',                 // editor della data
      'DUNNING',                    // menu esecutore e assegnabili
      'Rapportini',                 // la modale di carico, unica via
      'Copia righe',                // copia delle spunte
      'cliccando la riga',          // selezione sulle colonne d'identità
      'appunto',                    // riga a metà
      'cronoprogramma',             // link al tabellone
    ]) {
      expect(html).toContain(frase);
    }
  });

  it('la finestra è quella vera, coi suoi estremi per esteso', () => {
    const html = renderToStaticMarkup(<ContenutoGuida oggi={OGGI} famiglia="dunning" />);
    expect(html).toContain('da giovedì 30/07 a giovedì 13/08');
    // Il lunedì dev&apos;essere raggiungibile, e la guida dice anche COME (dec. 49).
    expect(html).toContain('calendario nella barra di assegnazione');
  });

  it('senza «oggi» (server non ha risposto) resta una frase onesta, non un buco', () => {
    const html = renderToStaticMarkup(<ContenutoGuida oggi="" famiglia="dunning" />);
    expect(html).toContain('da oggi ai 14 giorni successivi');
  });

  it('nelle massive la guida nomina la SUA attività, e dice che ven/sab sono compresi', () => {
    // La regola «solo attivazioni» è del dunning: le massive si pianificano anche in quei
    // giorni (dec. 38), e la guida deve dirlo — non lasciare il dubbio.
    const html = renderToStaticMarkup(<ContenutoGuida oggi={OGGI} famiglia="massive" />);
    expect(html).toContain('LIMITAZIONI MASSIVE');
    expect(html).not.toContain('attività DUNNING');
    expect(html).toContain('venerdì e sabato compresi');
    expect(html).toContain('riguarda il dunning');
  });
});
