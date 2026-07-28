// Vista ingrandita: la tabella deve smettere di avere un'altezza CALCOLATA e prendere quella che
// il contenitore le lascia.
//
// Sono due dettagli di layout che nessuno nota finché non si rompono, e si rompono in modi opposti:
// tenere il `clamp(...)` tarato sulla pagina lascerebbe mezzo schermo vuoto sotto la tabella;
// togliere `min-h-0` farebbe l'inverso, perché un figlio flex ha `min-height: auto` e si rifiuta di
// scendere sotto l'altezza del contenuto — con 5.000 righe virtualizzate la tabella traboccherebbe
// fuori dal riquadro e il piede finirebbe sotto il bordo dello schermo.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COLONNE_DUNNING } from '@/lib/acea/colonneTabella';
import TabellaOrdini from './TabellaOrdini';

const VISIBILI = new Set(COLONNE_DUNNING.filter((c) => c.predefinita).map((c) => c.chiave));

const rendi = (ingrandita: boolean) =>
  renderToStaticMarkup(
    <TabellaOrdini
      righe={[]}
      colonne={COLONNE_DUNNING}
      colonneVisibili={VISIBILI}
      oggi="2026-07-28"
      selezione={{}}
      onSelezione={() => {}}
      ingrandita={ingrandita}
    />,
  );

describe('TabellaOrdini — altezza della vista', () => {
  it('in pagina tiene la sua quota di schermo', () => {
    const html = rendi(false);
    expect(html).toContain('height:clamp(320px, calc(100dvh - 22rem), 1400px)');
    // `flex-1` da solo non basta come controprova: le intestazioni lo usano per i loro bottoni.
    expect(html).not.toContain('flex min-h-0 flex-1');
  });

  it('ingrandita prende tutta l’altezza disponibile', () => {
    const html = rendi(true);
    expect(html).toContain('height:100%');
    // Nessun residuo dell'altezza di pagina: le due misure insieme darebbero la più piccola.
    expect(html).not.toContain('100dvh - 22rem');
  });

  it('ingrandita il riquadro può rimpicciolirsi sotto il contenuto', () => {
    const html = rendi(true);
    expect(html).toContain('flex min-h-0 flex-1');
  });

  it('la tabella resta la stessa: cambia l’altezza, non le funzioni', () => {
    // L'intestazione con ordinamento, la spunta «seleziona tutte» e il ruolo di griglia sono la
    // ragione per cui l'ingrandimento è un riquadro in pagina e non la Fullscreen API — che
    // lascerebbe fuori dal disegno i pannelli dei filtri, portati su `document.body`.
    for (const html of [rendi(false), rendi(true)]) {
      expect(html).toContain('role="grid"');
      expect(html).toContain('Seleziona tutte le righe caricate');
      expect(html).toContain('Ordina per ODL');
    }
  });
});
