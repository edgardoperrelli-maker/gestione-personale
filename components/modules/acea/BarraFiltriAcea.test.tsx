// Il badge della scheda «Riaperture»: quante riaperture aperte NON hanno un esecutore.
//
// Sta sul tasto e non nei contatori di testa perché deve farsi vedere da qualunque scheda, e la
// risposta giusta al vederlo — aprire le riaperture — è il click che gli sta sotto. Questi test
// presidiano le tre regole di quel numero: si disegna col suo valore, sparisce a zero (un «0» in
// un badge d'avviso è una rassicurazione che occupa lo spazio di un allarme), e sparisce quando il
// server non l'ha saputo calcolare (un numero inventato è peggio della sua assenza).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COLONNE_DUNNING } from '@/lib/acea/colonneTabella';
import { filtriVuoti } from '@/lib/acea/filtriOrdini';
import BarraFiltriAcea from './BarraFiltriAcea';

const barra = (riapertureDaAssegnare: number | null) => renderToStaticMarkup(
  <BarraFiltriAcea
    filtri={filtriVuoti()}
    onChange={() => {}}
    colonne={COLONNE_DUNNING}
    totale={100}
    caricate={100}
    riapertureDaAssegnare={riapertureDaAssegnare}
  />,
);

describe('BarraFiltriAcea — badge della scheda Riaperture', () => {
  it('mostra il numero, e dice cosa conta', () => {
    const html = barra(3);
    expect(html).toContain('>3<');
    expect(html).toContain('3 riaperture senza esecutore');
  });

  it('al singolare parla al singolare', () => {
    expect(barra(1)).toContain('1 riapertura senza esecutore');
  });

  it('a zero non disegna niente', () => {
    expect(barra(0)).not.toContain('senza esecutore');
  });

  it('senza il dato (server non ha risposto) non disegna niente', () => {
    expect(barra(null)).not.toContain('senza esecutore');
  });

  it('le schede restano tutte, badge o non badge', () => {
    for (const html of [barra(3), barra(null)]) {
      for (const etichetta of ['Da lavorare', 'Riaperture', 'Chiusi', 'Tutti']) {
        expect(html).toContain(etichetta);
      }
    }
  });
});
