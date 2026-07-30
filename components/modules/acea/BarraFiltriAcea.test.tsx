// Il triangolo rosso della scheda «Riaperture»: quante attivazioni aperte NON hanno una data di
// pianificazione. Hanno un giorno di cardine — quella fuori calendario è quella che scade domani
// e sparisce senza che nessuno la veda.
//
// Sta sul tasto e non nei contatori di testa perché deve farsi vedere da qualunque scheda, e la
// risposta giusta al vederlo — aprire le riaperture — è il click che gli sta sotto. Questi test
// presidiano le tre regole di quel numero: si disegna col suo valore, sparisce a zero (uno «0»
// accanto a un triangolo d'allarme è una rassicurazione che occupa lo spazio di un allarme), e
// sparisce quando il server non l'ha saputo calcolare (un numero inventato è peggio della sua
// assenza). Nessun altro numero sulle schede: i conteggi per scheda sono stati provati e tolti —
// cinque numeri sempre accesi erano rumore, e il rumore copre proprio l'allarme.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COLONNE_DUNNING } from '@/lib/acea/colonneTabella';
import { filtriVuoti } from '@/lib/acea/filtriOrdini';
import BarraFiltriAcea from './BarraFiltriAcea';

const barra = (
  riapertureSenzaData: number | null,
  famiglia: 'dunning' | 'massive' = 'dunning',
  comuni: string[] = [],
) => renderToStaticMarkup(
  <BarraFiltriAcea
    filtri={filtriVuoti()}
    onChange={() => {}}
    colonne={COLONNE_DUNNING}
    totale={100}
    caricate={100}
    famiglia={famiglia}
    comuni={comuni}
    riapertureSenzaData={riapertureSenzaData}
  />,
);

describe('BarraFiltriAcea — triangolo della scheda Riaperture', () => {
  it('mostra il numero col triangolo, e dice cosa conta', () => {
    const html = barra(3);
    expect(html).toContain('lucide-triangle-alert');
    expect(html).toContain('3 attivazioni senza data di pianificazione');
  });

  it('al singolare parla al singolare', () => {
    expect(barra(1)).toContain('1 attivazione senza data di pianificazione');
  });

  it('a zero non disegna niente', () => {
    const html = barra(0);
    expect(html).not.toContain('senza data');
    expect(html).not.toContain('lucide-triangle-alert');
  });

  it('senza il dato (server non ha risposto) non disegna niente', () => {
    expect(barra(null)).not.toContain('senza data');
  });

  it('le schede restano nude: nessun conteggio di righe sui tasti', () => {
    // I conteggi per scheda sono stati provati e tolti: il tasto porta solo l'allarme.
    const html = barra(3);
    for (const etichetta of ['Da lavorare', 'Riaperture', 'Chiusi', 'Tutti']) {
      expect(html).toContain(etichetta);
    }
    expect(html).not.toContain('>100<');
  });
});

/*
  In massive le schede sono i COMUNI (il lavoro da pianificare di ogni paese) più i due riepiloghi
  su tutti: «Chiusi» e «Sostituzione saracinesca». Né «Tutti» né una «Da lavorare» generica: la
  prima diluiva le altre, la seconda è la somma delle schede-comune. E niente «Riaperture»: sono
  ordini di dunning (RIAT/REVO sul ripristino da morosità) — una scheda strutturalmente vuota non
  è una vista, è una domanda senza risposta.
*/
describe('BarraFiltriAcea — vista massive', () => {
  const COMUNI = ['LABICO', 'RIANO', 'ZAGAROLO'];

  it('un tasto per comune, poi Chiusi e Sostituzione saracinesca', () => {
    const html = barra(null, 'massive', COMUNI);
    for (const etichetta of [...COMUNI, 'Chiusi', 'Sostituzione saracinesca']) {
      expect(html).toContain(etichetta);
    }
  });

  it('niente «Tutti», niente «Da lavorare», niente «Riaperture»', () => {
    const html = barra(null, 'massive', COMUNI);
    expect(html).not.toContain('Tutti');
    expect(html).not.toContain('Da lavorare');
    expect(html).not.toContain('Riaperture');
  });

  it('nemmeno il triangolo, anche se il numero arrivasse: non c’è il tasto su cui metterlo', () => {
    expect(barra(3, 'massive', COMUNI)).not.toContain('senza data');
  });

  it('senza comuni aperti restano i due riepiloghi: la campagna è finita, la storia resta', () => {
    const html = barra(null, 'massive');
    expect(html).toContain('Chiusi');
    expect(html).toContain('Sostituzione saracinesca');
  });
});
