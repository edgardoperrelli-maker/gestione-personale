import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync(resolve(__dirname, '../../app/r/[token]/page.tsx'), 'utf8');
const form = readFileSync(
  resolve(__dirname, '../../components/modules/rapportini/RapportinoForm.tsx'),
  'utf8',
);
const lista = readFileSync(
  resolve(__dirname, '../../components/modules/rapportini/RapportinoLista.tsx'),
  'utf8',
);
const card = readFileSync(
  resolve(__dirname, '../../components/modules/rapportini/VoceCard.tsx'),
  'utf8',
);

describe("il TOP arriva all'operatore", () => {
  it('la pagina lo legge DAL REGISTRO, non dalla voce', () => {
    // Fotografarlo in raw_json come la nota lo renderebbe cieco alle marcature fatte a giro già
    // partito, che sono il caso per cui la funzione esiste.
    expect(pagina).toMatch(/odlTop/);
    expect(pagina).toMatch(/from '@\/lib\/acea\/top'/);
    expect(pagina).toMatch(/from\('acea_ordini'\)/);
  });

  it('la lettura è RESILIENTE: un flag decorativo non può spegnere il rapportino', () => {
    // Le altre letture accessorie della pagina (note tramandate, ODL positivi) fanno lo stesso:
    // l'errore si logga e si prosegue senza.
    const blocco = pagina.match(/odlDaEvidenziare[\s\S]{0,900}/)?.[0] ?? '';
    expect(blocco).toMatch(/console\.error/);
  });

  it('le voci TOP vanno in cima, con ordinamento stabile', () => {
    expect(form).toMatch(/ordinaTopPrima\(/);
  });

  it("l'indice resta quello VERO: si riordina la lista, non i dati", () => {
    // `onApri(r.index)` deve continuare ad aprire la card giusta dopo il riordino.
    expect(form).toMatch(/index: idx/);
    expect(lista).toMatch(/onApri\(r\.index\)/);
  });

  it('la riga e la card mostrano un badge testuale, non solo un colore', () => {
    expect(lista).toMatch(/PILL_TOP/);
    expect(card).toMatch(/Da fare per primo/);
  });

  it('il banner della card sta su UNA riga: sul telefono lo spazio è del lavoro', () => {
    // La frase per esteso andava a capo su schermo stretto e si mangiava due righe di card.
    // Il «chi lo dice» è passato nel title, che non occupa spazio.
    const banner = card.match(/\{top && \([\s\S]*?\n {6}\)\}/)?.[0] ?? '';
    expect(banner).not.toBe('');
    expect(banner).toMatch(/title="Segnalato da ACEA come prioritario"/);
    expect(banner).not.toMatch(/text-sm/);
  });
});
