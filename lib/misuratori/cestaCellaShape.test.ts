import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  La CESTA si scrive NELLA CELLA, una riga alla volta, oltre che in blocco dalla barra della
  selezione. Questi test tengono ferme le tre regole che rendono l'editor sicuro — le stesse
  della nota, che le aveva imparate a caro prezzo: Escape annulla, niente PATCH a vuoto, e
  nessun doppio commit. Sono guardie di forma sul sorgente: la logica vera vive nel browser.

  Erediti dal `palletCellaShape.test.ts` che questi test sostituiscono: cesta e pallet erano
  la stessa cosa con due nomi, e il 2026-08-04 sono diventati uno solo.
*/

const tabella = readFileSync(
  resolve(__dirname, '../../components/modules/misuratori/MisuratoriTabella.tsx'),
  'utf8',
);
const client = readFileSync(
  resolve(__dirname, '../../components/modules/misuratori/MisuratoriClient.tsx'),
  'utf8',
);

describe('cesta scrivibile nella cella', () => {
  it('la cella ha un editor, non solo testo', () => {
    expect(tabella).toMatch(/editingCesta === row\.id \? \(/);
    expect(tabella).toMatch(/data-cesta-btn=\{row\.id\}/);
  });

  it('Escape ANNULLA e il blur che segue non committa', () => {
    // Senza il flag, l'unmount dell'editor fa scattare un blur che salverebbe il valore
    // appena rifiutato: l'Escape diventerebbe un salva travestito da annulla.
    expect(tabella).toMatch(/annullaCesta\.current = true/);
    expect(tabella).toMatch(/if \(annullaCesta\.current\) \{ annullaCesta\.current = false; return; \}/);
  });

  it('nessuna PATCH a vuoto: aprire e chiudere senza toccare non è un salvataggio', () => {
    expect(tabella).toMatch(/if \(pulito === \(cestaOriginale \?\? ''\)\.trim\(\)\) return;/);
  });

  it('guardia di rientro: un gesto, una PATCH', () => {
    // Su Invio l'editor si smonta e il blur che segue richiamerebbe il commit una seconda volta.
    expect(tabella).toMatch(/if \(editingCesta !== id\) return;/);
  });

  it('il campo NON è numerico: la cesta è un riferimento, non una quantità', () => {
    // `type="number"` mangerebbe gli zeri di testa e le frecce del mouse potrebbero cambiarla
    // per sbaglio scorrendo la tabella.
    // I commenti si tolgono PRIMA di cercare: quello dentro la cella spiega la scelta CITANDO
    // `type="number"`, e senza questa riga il test leggeva la spiegazione invece dell'attributo.
    const senzaCommenti = tabella.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const cella = senzaCommenti.match(/aria-label=\{`Cesta per il misuratore[\s\S]*?\/>/)?.[0] ?? '';
    expect(cella).not.toBe('');
    expect(cella).toMatch(/inputMode="numeric"/);
    expect(cella).not.toMatch(/type="number"/);
  });

  it('il client accetta la cesta nella PATCH (e la applica in ottimistica)', () => {
    // Senza `cesta` nel tipo la cella non compilerebbe; senza lo spread la riga tornerebbe al
    // valore vecchio fino al prossimo caricamento.
    const firma = client.match(/patch: \{[^}]*\}/)?.[0] ?? '';
    expect(firma).toMatch(/stato\?: StatoMisuratore/);
    expect(firma).toMatch(/note\?: string/);
    expect(firma).toMatch(/cesta\?: string/);
    expect(client).toMatch(/r\.id === id \? \{ \.\.\.r, \.\.\.patch \}/);
  });

  it("l'assegnazione in blocco dalla barra resta: le due strade convivono", () => {
    // La cella serve a CORREGGERE una riga; il gesto massivo — «questi sono finiti nella stessa
    // cesta» — resta quello della barra, e toglierlo per far posto all'editor sarebbe stato un
    // pessimo scambio.
    expect(client).toMatch(/handleAssegnaCesta/);
  });

  it("l'endpoint del blocco segue l'apiBase: ogni commessa scrive sul SUO registro", () => {
    // Con l'URL cablato, il registro ACEA avrebbe scritto su quello AcquaLatina.
    expect(client).toMatch(/fetch\(`\$\{apiBase\}\/cesta`/);
  });

  it('sovrascrivere una cesta già diversa si dichiara, non si fa in silenzio', () => {
    // Su AcquaLatina quel numero l'ha dichiarato l'OPERATORE con i contatori in mano: la
    // spunta di testa non deve poterlo cancellare senza che nessuno lo dica.
    expect(client).toMatch(/chiediConferma\(\{/);
    expect(client).toMatch(/già in un'altra cesta/);
  });
});

describe('cesta e pallet erano la stessa cosa: ne resta UNO', () => {
  const pdf = readFileSync(
    resolve(__dirname, '../../components/modules/misuratori/exportMisuratoriPdf.ts'),
    'utf8',
  );
  const registro = readFileSync(resolve(__dirname, './registro.ts'), 'utf8');
  const riferimenti = readFileSync(resolve(__dirname, './riferimenti.ts'), 'utf8');
  const tipi = readFileSync(resolve(__dirname, '../../types/misuratori.ts'), 'utf8');

  /** Il sorgente senza commenti: la storia della fusione si RACCONTA, e cita il nome vecchio. */
  const soloCodice = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('nessun campo, prop o rotta `pallet` nel modulo', () => {
    for (const [nome, src] of [
      ['tabella', tabella], ['client', client], ['pdf', pdf],
      ['registro', registro], ['riferimenti', riferimenti], ['tipi', tipi],
    ] as const) {
      expect(soloCodice(src), `${nome} non deve più nominare il pallet`).not.toMatch(/pallet/i);
    }
  });

  it('il filtro non prende più il campo come parametro: il riferimento è uno', () => {
    // Finché i campi erano due il parametro evitava due gemelle divergenti. Con un campo solo
    // è una scelta da passare che non esiste più.
    expect(riferimenti).toMatch(/export function filtraPerRiferimento<T extends ConRiferimento>\(\s*righe: readonly T\[\],\s*filtro: string,\s*\)/);
  });
});

describe('cesta: stessa funzione sulle due commesse', () => {
  const paginaAcea = readFileSync(
    resolve(__dirname, '../../app/hub/misuratori/acea/page.tsx'),
    'utf8',
  );
  const paginaAcqua = readFileSync(
    resolve(__dirname, '../../app/hub/acqualatina/misuratori/page.tsx'),
    'utf8',
  );
  const registro = readFileSync(resolve(__dirname, './registro.ts'), 'utf8');
  const rottaAcea = readFileSync(
    resolve(__dirname, '../../app/api/misuratori/cesta/route.ts'),
    'utf8',
  );

  it('la cesta è accesa su ENTRAMBI i registri', () => {
    for (const [nome, src] of [['ACEA', paginaAcea], ['AcquaLatina', paginaAcqua]] as const) {
      expect(src, `${nome} deve mostrare la cesta`).toMatch(/mostraCesta(?!=\{false\})/);
      expect(src, `${nome} non deve spegnerla`).not.toMatch(/mostraCesta=\{false\}/);
    }
  });

  it('la rotta ACEA esiste e passa dalla funzione condivisa', () => {
    expect(rottaAcea).toMatch(/assegnaCesta\('misuratori_rimossi'/);
    expect(rottaAcea).toMatch(/from '@\/lib\/misuratori\/registro'/);
  });

  it('la PATCH non rifiuta la cesta sul registro ACEA', () => {
    // Prima rispondeva 400 «cesta non prevista su questo registro»: giusto quando la colonna
    // non c'era, un muro adesso che c'è (rinominata da `pallet`, migration 20260804090000).
    expect(registro).not.toMatch(/cesta non prevista su questo registro/);
  });

  it("l'assegnazione in blocco tocca lo stato SOLO su AcquaLatina, con la stessa invariante della cella", () => {
    // Decisione ribaltata il 2026-08-04 (docs/superpowers/specs/2026-08-04-…-design.md): fino
    // ad allora la barra scriveva un riferimento e basta ovunque, «NON toccava lo stato». Ora
    // dichiara la stessa cosa della cella — anche in blocco — ma resta gated: SOLO AcquaLatina,
    // mai ACEA. Il comportamento pieno (raggruppamento, stati misti, 500 a lettura fallita) è
    // nei test di comportamento in assegnaCestaInvariante.test.ts.
    const fn = registro.match(/export async function assegnaCesta[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).not.toBe('');
    expect(fn).toMatch(/statoDopoCesta/);
    expect(fn).toMatch(/tabella === 'acqualatina_misuratori_rimossi'/);
  });

  it('la SELECT chiede la cesta su entrambe le tabelle, e il PDR solo dove esiste', () => {
    // Chiedere una colonna che la tabella non ha fa fallire la query INTERA, non solo il campo.
    // La cesta viaggia fra le OPZIONALI (`selectDegradante`): su ACEA nasce da una rinomina, e
    // fra il deploy del codice e la migration applicata il registro deve restare leggibile.
    const base = registro.match(/function colonne\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(base).toMatch(/COLONNE_COMUNI\}, pdr/);
    expect(base).not.toMatch(/cesta/);

    expect(registro).toMatch(/const COLONNE_OPZIONALI = \['cesta'\]/);
    expect(registro).toMatch(/selectDegradante\(colonne\(tabella\), COLONNE_OPZIONALI/);
  });
});
