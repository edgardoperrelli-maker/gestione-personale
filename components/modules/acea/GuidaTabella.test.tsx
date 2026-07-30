// La guida vive in una modale aperta dal «?»: il paragrafo fisso sotto la tabella cresceva a ogni
// funzione e si era mangiato tre righe di registro. Questi test presidiano il CONTENUTO — che le
// funzioni della tabella restino documentate — perché è quello che un refactor perde per strada.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContenutoGuida } from './GuidaTabella';

const GIORNI = [
  { data: '2026-07-30', etichetta: 'Oggi', esteso: 'giovedì 30/07', soloAttivazioni: false },
  { data: '2026-07-31', etichetta: 'Domani', esteso: 'venerdì 31/07', soloAttivazioni: true },
];

describe('ContenutoGuida', () => {
  it('documenta ogni famiglia di gesti della tabella', () => {
    const html = renderToStaticMarkup(<ContenutoGuida giorni={GIORNI} famiglia="dunning" />);
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

  it('la finestra è quella vera, scritta per esteso', () => {
    const html = renderToStaticMarkup(<ContenutoGuida giorni={GIORNI} famiglia="dunning" />);
    expect(html).toContain('giovedì 30/07 o venerdì 31/07');
  });

  it('senza finestra (server non ha risposto) resta una frase onesta, non un buco', () => {
    const html = renderToStaticMarkup(<ContenutoGuida giorni={[]} famiglia="dunning" />);
    expect(html).toContain('oggi o il giorno lavorativo successivo');
  });

  it('nelle massive la guida nomina la SUA attività, e dice che ven/sab sono compresi', () => {
    // La regola «solo attivazioni» è del dunning: le massive si pianificano anche in quei
    // giorni (dec. 38), e la guida deve dirlo — non lasciare il dubbio.
    const html = renderToStaticMarkup(<ContenutoGuida giorni={GIORNI} famiglia="massive" />);
    expect(html).toContain('LIMITAZIONI MASSIVE');
    expect(html).not.toContain('attività DUNNING');
    expect(html).toContain('venerdì e sabato compresi');
    expect(html).toContain('riguarda il dunning');
  });
});
