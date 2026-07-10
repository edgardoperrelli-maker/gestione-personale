// Etichette % dei segmenti "Esiti sull'assegnato": con stackOffset="expand" recharts passa
// alle label il valore NORMALIZZATO 0..1 (non il conteggio) — il bug mostrava "1%" su tutte
// le barre (segnalato dall'utente: tooltip 59%, barra "1%"). La % deve venire dai conteggi
// della riga via `index`, ignorando del tutto `value`. Recharts 3 non renderizza in SSR
// statico (store montato via effetti), quindi si testa il content-renderer direttamente con
// i props che recharts passa in produzione.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { etichettaPctSegmento, type RigaPctEsiti } from './EsitiOperatore';

// Caso reale dal bug report: SIKORA ARTUR — 175 assegnati, 68 positivi, 104 negativi, 3 non lavorati.
const righe: RigaPctEsiti[] = [
  { positivi: 68, negativi: 104, nonLavorati: 3, assegnati: 175 },
  { positivi: 50, negativi: 50, nonLavorati: 0, assegnati: 100 },
];

// Props come li passa recharts al content di LabelList su barre stackOffset="expand":
// value = frazione normalizzata 0..1 (MAI usarla), index = riga, width/height/x/y in px.
const props = (over: Record<string, unknown>) => ({ x: 100, y: 10, width: 500, height: 22, ...over });

const render = (campo: 'positivi' | 'negativi' | 'nonLavorati', over: Record<string, unknown>) => {
  const el = etichettaPctSegmento(righe, campo, '#fff')(props(over));
  return el === null ? null : renderToStaticMarkup(el);
};

describe('etichettaPctSegmento', () => {
  it('scrive la percentuale vera dei conteggi ignorando il value normalizzato di recharts', () => {
    // value=0.983 è ciò che recharts passa davvero (fine del range impilato): NON deve influire
    expect(render('negativi', { value: 0.983, index: 0 })).toContain('>59%<'); // 104/175
    expect(render('positivi', { value: 0.389, index: 0 })).toContain('>39%<'); // 68/175
    expect(render('positivi', { value: 0.5, index: 1 })).toContain('>50%<'); // 50/100
  });

  it('il bug non torna: con la vecchia formula value/assegnati sarebbe stato 1%', () => {
    const svg = render('negativi', { value: 0.983, index: 0 });
    expect(svg).not.toContain('>1%<');
  });

  it('salta le etichette che non entrano fisicamente nel segmento', () => {
    // "2%" (3/175) su un segmento largo 15px non ci sta → null
    expect(render('nonLavorati', { value: 1, index: 0, width: 15 })).toBeNull();
    // "59%" su 500px ci sta, su 20px no
    expect(render('negativi', { value: 0.983, index: 0, width: 20 })).toBeNull();
  });

  it('non scrive mai 0% e regge index fuori range', () => {
    expect(render('nonLavorati', { value: 0, index: 1 })).toBeNull(); // 0/100
    expect(render('positivi', { value: 0.5, index: 99 })).toBeNull(); // riga inesistente
    expect(render('positivi', { value: 0.5 })).toBeNull(); // index assente
  });

  it('centra il testo nel segmento', () => {
    const svg = render('negativi', { value: 0.983, index: 0 });
    expect(svg).toContain('x="350"'); // 100 + 500/2
    expect(svg).toContain('y="21"'); // 10 + 22/2
  });
});
