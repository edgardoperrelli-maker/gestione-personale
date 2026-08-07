// CHE COSA offre la barra, scheda per scheda.
//
// È la domanda a cui l'utente risponde col gesto — spunta delle righe e si aspetta l'azione giusta
// — ed è la prima cosa che un refactor perde, perché sono tutti rami di uno stesso `&&`. Il caso
// che ha fatto nascere questi test: sui «Chiusi» compariva «Pianifica», ma il server salta gli
// ordini chiusi con `ordine_chiuso` (vedi `lib/acea/pianificazione.ts`) — un bottone che poteva
// soltanto fallire, in una barra che ha per regola di non far premere un rifiuto prevedibile.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BarraAzioni from './BarraAzioni';

const BASE = {
  famiglia: 'massive' as const,
  chiavi: ['912214964|0010'],
  onAnnullaSelezione: () => {},
  onPianificato: () => {},
  operatori: [],
  oggi: '2026-08-06',
  giorno: '2026-08-06',
  onGiorno: () => {},
  onCopiaRighe: async () => true,
};

const rendi = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<BarraAzioni {...BASE} {...props} />);

describe('BarraAzioni — dove si assegna', () => {
  it('offre la pianificazione: giorno, operatore, «Pianifica»', () => {
    const html = rendi();
    expect(html).toContain('Pianifica');
    expect(html).toContain('Assegna a');
    expect(html).toContain('Giorno di lavoro');
  });

  it('e «Segna TOP», che è una priorità di lavorazione', () => {
    expect(rendi()).toContain('Segna TOP');
  });

  it('senza nessuno in tabellone manda a compilarlo', () => {
    expect(rendi()).toContain('compila il tabellone');
  });
});

describe('BarraAzioni — dove NON si assegna', () => {
  const SOLA_ESTRAZIONE = { soloEstrazione: true };

  it('«Pianifica» non c’è, e con lui giorno e operatore', () => {
    const html = rendi(SOLA_ESTRAZIONE);
    expect(html).not.toContain('Pianifica');
    expect(html).not.toContain('Assegna a');
    expect(html).not.toContain('Giorno di lavoro');
  });

  it('via anche «Segna TOP»: è lo stesso gesto', () => {
    expect(rendi(SOLA_ESTRAZIONE)).not.toContain('Segna TOP');
  });

  it('e via l’invito a compilare il tabellone, che qui non serve a niente', () => {
    // Mandava a riempire un cronoprogramma per un'assegnazione che su questa scheda non si fa.
    expect(rendi(SOLA_ESTRAZIONE)).not.toContain('compila il tabellone');
  });

  it('quello che serve a portare fuori un elenco resta', () => {
    const html = rendi(SOLA_ESTRAZIONE);
    expect(html).toContain('Copia le righe spuntate');
    expect(html).toContain('Deseleziona');
  });
});

describe('BarraAzioni — l’export al posto dell’assegnazione', () => {
  it('c’è quando è LUI l’azione della scheda', () => {
    // Sui «Chiusi»: lo storico spuntato si porta fuori — un consuntivo, un controllo, un allegato.
    expect(rendi({ soloEstrazione: true, onEsporta: () => {} })).toContain('Esporta');
  });

  it('non c’è dove il gesto è un altro', () => {
    // Sulle schede in cui si assegna la primaria è «Pianifica», e sulle saracinesche l'estrazione
    // ha già il suo comando col tracciato per ACEA: due export nella stessa barra sarebbero due
    // file che si somigliano e non sono la stessa cosa.
    expect(rendi()).not.toContain('Esporta');
    expect(rendi({ soloEstrazione: true })).not.toContain('Esporta');
  });
});

describe('BarraAzioni — senza righe spuntate', () => {
  it('non offre niente: non c’è nessuna riga su cui agire', () => {
    for (const props of [{}, { soloEstrazione: true, onEsporta: () => {} }]) {
      const html = rendi({ ...props, chiavi: [] });
      expect(html).not.toContain('Pianifica');
      expect(html).not.toContain('Esporta');
      expect(html).not.toContain('Deseleziona');
    }
  });
});
