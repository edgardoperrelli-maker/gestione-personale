// L'altezza della tabella è DERIVATA, non calcolata.
//
// Prima la scontava da sé (`clamp(320px, calc(100dvh - 22rem), 1400px)`): quel `22rem` era la somma
// a mano di testa, contatori, barra filtri e barra azioni, ed era corto di un'ottantina di pixel —
// quindi la pagina scorreva per mostrare una tabella che a sua volta scorreva. Peggio: ogni ritocco
// alla testa avrebbe richiesto di riaggiornare quel numero, e nessuno se ne sarebbe accorto perché
// il difetto non dà errori, si vede solo scorrendo.
//
// Ora la tabella è l'ultimo anello di una catena flex che parte da `h-[calc(100dvh-6rem)]` sulla
// pagina. Questi test presidiano i due modi in cui quella catena si rompe: un'altezza fissa che
// torna dentro, e un `min-h-0` che sparisce.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COLONNE_DUNNING } from '@/lib/acea/colonneTabella';
import TabellaOrdini from './TabellaOrdini';

const VISIBILI = new Set(COLONNE_DUNNING.filter((c) => c.predefinita).map((c) => c.chiave));

const html = renderToStaticMarkup(
  <TabellaOrdini
    righe={[]}
    colonne={COLONNE_DUNNING}
    colonneVisibili={VISIBILI}
    oggi="2026-07-28"
    selezione={{}}
    onSelezione={() => {}}
  />,
);

describe('TabellaOrdini — altezza della vista', () => {
  it('prende l’altezza che le lascia il contenitore', () => {
    expect(html).toContain('height:100%');
  });

  it('non sconta più a mano la cornice di pagina', () => {
    // Il numero magico: se torna, torna anche il doppio scorrimento.
    expect(html).not.toContain('22rem');
    expect(html).not.toContain('clamp(');
  });

  it('può rimpicciolirsi sotto il proprio contenuto', () => {
    // Senza `min-h-0` un figlio flex non scende sotto l'altezza del contenuto: 5.000 righe
    // virtualizzate uscirebbero dallo schermo invece di scorrere.
    expect(html).toContain('flex min-h-0 flex-1');
  });

  it('ha una rete sotto e una sopra', () => {
    // Se un antenato perde il suo `min-h-0`, `height: 100%` si risolve su un genitore ad altezza
    // automatica: senza tetto la tabella crescerebbe quanto le sue righe, decine di migliaia di
    // pixel. Col tetto il guasto resta una tabella alta uno schermo.
    expect(html).toContain('max-height:100dvh');
    expect(html).toContain('min-height:240px');
  });
});

describe('TabellaOrdini — la colonna CAP', () => {
  it('è a schermo con il suo imbuto, perché è la zona su cui si pianifica', () => {
    expect(html).toContain('Ordina per CAP');
  });
});
