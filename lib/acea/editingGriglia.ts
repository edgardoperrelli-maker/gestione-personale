// lib/acea/editingGriglia.ts
// PURA: modello di selezione, incolla a blocchi e validazione per l'editing stile Excel.
//
// Perimetro deciso: si modificano SOLO `Esecutore` e `Data pianificata`. I campi ACEA sono
// immutabili per principio (decisione 8 dello studio) e la griglia non offre nemmeno il focus su
// quelle colonne.
//
// Qui non c'è React e non c'è rete: solo le decisioni. Il motivo è che tutta la difficoltà
// dell'editing a griglia sta in questi casi limite — un blocco incollato più alto delle righe
// disponibili, una cella singola su un intervallo, una data in formato italiano, un nome
// operatore che non esiste — e vanno risolti dove si possono provare.

export type Cella = { riga: number; colonna: number };

export type Intervallo = { da: Cella; a: Cella };

/** Colonne modificabili, nell'ordine in cui compaiono nella vista. */
export type ColonnaEditabile = 'pianificato_a' | 'pianificato_il' | 'note';

export type Direzione = 'su' | 'giu' | 'sinistra' | 'destra';

export type Limiti = { righe: number; colonne: number };

/** Normalizza un intervallo in modo che `da` sia sempre l'angolo alto-sinistra. */
export function normalizzaIntervallo(i: Intervallo): Intervallo {
  return {
    da: { riga: Math.min(i.da.riga, i.a.riga), colonna: Math.min(i.da.colonna, i.a.colonna) },
    a: { riga: Math.max(i.da.riga, i.a.riga), colonna: Math.max(i.da.colonna, i.a.colonna) },
  };
}

/** Tutte le celle di un intervallo, in ordine di lettura. */
export function celleDi(i: Intervallo): Cella[] {
  const n = normalizzaIntervallo(i);
  const out: Cella[] = [];
  for (let r = n.da.riga; r <= n.a.riga; r++) {
    for (let c = n.da.colonna; c <= n.a.colonna; c++) out.push({ riga: r, colonna: c });
  }
  return out;
}

/** Sposta il focus restando dentro la griglia (nessun wrap: in Excel il bordo ferma). */
export function spostaFocus(da: Cella, dir: Direzione, l: Limiti): Cella {
  const d = { ...da };
  if (dir === 'su') d.riga -= 1;
  if (dir === 'giu') d.riga += 1;
  if (dir === 'sinistra') d.colonna -= 1;
  if (dir === 'destra') d.colonna += 1;
  return {
    riga: Math.min(Math.max(d.riga, 0), Math.max(l.righe - 1, 0)),
    colonna: Math.min(Math.max(d.colonna, 0), Math.max(l.colonne - 1, 0)),
  };
}

/**
 * Testo dalla clipboard → matrice di celle.
 *
 * Excel copia con TAB fra le colonne e CRLF fra le righe; una cella che contiene a capo o tab
 * viene racchiusa fra virgolette, con le virgolette interne raddoppiate. Si gestisce anche il
 * caso di un incolla da un editor di testo (solo a capo, nessun tab): una colonna sola.
 */
export function parseBloccoIncollato(testo: string): string[][] {
  const s = String(testo ?? '');
  if (s === '') return [];
  const righe: string[][] = [];
  let cella = '';
  let riga: string[] = [];
  let inVirgolette = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inVirgolette) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cella += '"'; i++; }   // virgolette raddoppiate = una letterale
        else inVirgolette = false;
      } else {
        cella += ch;
      }
      continue;
    }
    if (ch === '"' && cella === '') { inVirgolette = true; continue; }
    if (ch === '\t') { riga.push(cella); cella = ''; continue; }
    if (ch === '\r') continue;                          // CRLF: il \n che segue chiude la riga
    if (ch === '\n') { riga.push(cella); righe.push(riga); cella = ''; riga = []; continue; }
    cella += ch;
  }
  riga.push(cella);
  righe.push(riga);

  // Un'ultima riga vuota è l'a-capo finale di Excel, non una riga da scrivere.
  while (righe.length > 1 && righe[righe.length - 1].every((c) => c === '')) righe.pop();
  return righe;
}

export type ScritturaCella = { riga: number; colonna: number; valore: string };

export type EsitoIncolla = {
  scritture: ScritturaCella[];
  /** Righe del blocco che non entrano nella griglia: si tronca e lo si dice. */
  righeIgnorate: number;
  colonneIgnorate: number;
};

/**
 * Dove finisce un blocco incollato.
 *
 * Due comportamenti, gli stessi di Excel:
 *  - blocco di UNA cella su un intervallo selezionato → riempie tutto l'intervallo (è il gesto
 *    con cui si assegna lo stesso operatore a venti righe);
 *  - blocco più grande → si scrive a partire dall'angolo alto-sinistra della selezione, e ciò
 *    che eccede i bordi viene troncato e riportato, mai scritto altrove.
 */
export function calcolaIncolla(
  blocco: string[][],
  selezione: Intervallo,
  limiti: Limiti,
): EsitoIncolla {
  const sel = normalizzaIntervallo(selezione);
  const scritture: ScritturaCella[] = [];
  if (blocco.length === 0 || limiti.righe === 0 || limiti.colonne === 0) {
    return { scritture, righeIgnorate: 0, colonneIgnorate: 0 };
  }

  const unaCella = blocco.length === 1 && blocco[0].length === 1;
  if (unaCella) {
    const valore = blocco[0][0];
    for (const c of celleDi(sel)) {
      if (c.riga < limiti.righe && c.colonna < limiti.colonne) {
        scritture.push({ riga: c.riga, colonna: c.colonna, valore });
      }
    }
    return { scritture, righeIgnorate: 0, colonneIgnorate: 0 };
  }

  let righeIgnorate = 0;
  let colonneIgnorate = 0;
  for (let r = 0; r < blocco.length; r++) {
    const rigaTarget = sel.da.riga + r;
    if (rigaTarget >= limiti.righe) { righeIgnorate++; continue; }
    for (let c = 0; c < blocco[r].length; c++) {
      const colonnaTarget = sel.da.colonna + c;
      if (colonnaTarget >= limiti.colonne) {
        if (r === 0) colonneIgnorate++;
        continue;
      }
      scritture.push({ riga: rigaTarget, colonna: colonnaTarget, valore: blocco[r][c] });
    }
  }
  return { scritture, righeIgnorate, colonneIgnorate };
}

export type ValoreAccettato = { ok: true; valore: string };
export type ValoreSaltato = { ok: true; salta: true };
export type ValoreRifiutato = { ok: false; motivo: string };

/** Tre esiti: valore buono, cella da saltare (vuota), valore rifiutato con il motivo. */
export type EsitoValore = ValoreAccettato | ValoreSaltato | ValoreRifiutato;

/**
 * Normalizza una data scritta a mano o incollata.
 * Accetta 'YYYY-MM-DD', 'dd/MM/yyyy' e 'dd-MM-yyyy' — i formati che escono da Excel e quelli che
 * si digitano. Una cella vuota NON cancella: un incolla con celle vuote svuoterebbe la
 * pianificazione senza che nessuno l'abbia chiesto.
 *
 * `giorni`, se passato, è la finestra programmabile (oggi + prossimo feriale): una data fuori
 * finestra viene RIFIUTATA con l'elenco di quelle buone. Senza il controllo qui, la regola
 * varrebbe solo per il menu della barra azioni e basterebbe un incolla da Excel per aggirarla —
 * cioè esattamente il gesto che questo modulo esiste per rendere comodo.
 */
export function validaData(
  v: string,
  giorni?: readonly { data: string; esteso: string }[],
): EsitoValore {
  const s = String(v ?? '').trim();
  if (s === '') return { ok: true, salta: true };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const it = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  let y: number, m: number, g: number;
  if (iso) { y = +iso[1]; m = +iso[2]; g = +iso[3]; }
  else if (it) { g = +it[1]; m = +it[2]; y = +it[3]; }
  else return { ok: false, motivo: `"${s}" non è una data` };

  const d = new Date(Date.UTC(y, m - 1, g));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) {
    return { ok: false, motivo: `"${s}" non è una data valida` };
  }
  const valore = `${y}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  if (giorni && giorni.length > 0 && !giorni.some((x) => x.data === valore)) {
    return {
      ok: false,
      motivo: `${s}: si programma solo per ${giorni.map((x) => x.esteso).join(' o ')}`,
    };
  }
  return { ok: true, valore };
}

export type Nominativo = { id: string; display_name: string };

/**
 * Chi c'è nel cronoprogramma di quel giorno, e chi invece esiste ma non c'è.
 *
 * Serve solo a distinguere i due rifiuti: senza, un nome giusto di una persona che quel giorno
 * non è in cronoprogramma tornava «operatore non trovato», che manda a cercare un errore di
 * battitura inesistente invece del cronoprogramma da compilare.
 */
export type FuoriCronoprogramma = {
  /** Tutti gli operatori attivi, cronoprogramma o meno. */
  operatori: readonly Nominativo[];
  /** Il giorno di cui si parla, per esteso: «giovedì 30/07». */
  giorno: string;
};

const normNome = (x: string) => x.trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Risolve un nome operatore su quelli ASSEGNABILI (il cronoprogramma del giorno scelto).
 * Confronto senza maiuscole e senza spazi doppi, così "de rossi" trova "DE ROSSI"; ambiguo se più
 * di un operatore corrisponde — meglio fermarsi che assegnare alla persona sbagliata.
 */
export function validaOperatore(
  v: string,
  operatori: readonly Nominativo[],
  fuori?: FuoriCronoprogramma,
): EsitoValore {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (s === '') return { ok: true, salta: true };
  /*
    Elenco vuoto: non e` il nome a essere sbagliato, e` che non abbiamo nessun nome con cui
    confrontarlo. Dirlo cambia tutto — «operatore non trovato» manda a cercare un errore di
    battitura che non c'e`, ed e` successo davvero: l'elenco arrivava vuoto perche` l'endpoint non
    aveva un GET, e il nome respinto era quello COPIATO dalla cella accanto.

    Da quando gli assegnabili sono quelli del cronoprogramma, l'elenco vuoto ha una seconda causa
    — e molto piu` frequente della prima: quel giorno non c'e` ancora nessuno in cronoprogramma.
  */
  if (operatori.length === 0) {
    return {
      ok: false,
      motivo: fuori
        ? `nessun operatore in cronoprogramma per ${fuori.giorno}`
        : 'elenco operatori non disponibile: ricarica la pagina',
    };
  }
  const esatti = operatori.filter((o) => normNome(o.display_name) === normNome(s));
  if (esatti.length === 1) return { ok: true, valore: esatti[0].id };
  if (esatti.length > 1) return { ok: false, motivo: `"${s}" corrisponde a più operatori` };
  const parziali = operatori.filter((o) => normNome(o.display_name).startsWith(normNome(s)));
  if (parziali.length === 1) return { ok: true, valore: parziali[0].id };
  if (parziali.length > 1) return { ok: false, motivo: `"${s}" è ambiguo` };

  // Nessuno fra gli assegnabili: prima di dire «non trovato», si guarda se la persona esiste
  // comunque. Sono due problemi diversi e si risolvono in due posti diversi — uno è un refuso,
  // l'altro è il cronoprogramma da compilare.
  if (fuori) {
    const altrove = fuori.operatori.filter(
      (o) => normNome(o.display_name) === normNome(s) || normNome(o.display_name).startsWith(normNome(s)),
    );
    if (altrove.length > 0) {
      const nome = altrove.length === 1 ? altrove[0].display_name : s;
      return { ok: false, motivo: `${nome} non è in cronoprogramma per ${fuori.giorno}` };
    }
  }
  return { ok: false, motivo: `operatore "${s}" non trovato` };
}

/**
 * true se l'esito è "cella da saltare" (valore vuoto).
 * È un type predicate: dopo il controllo, TypeScript sa che l'esito rimasto ha un `valore`.
 */
export function daSaltare(e: EsitoValore): e is ValoreSaltato {
  return e.ok === true && 'salta' in e && e.salta === true;
}

/**
 * Bersaglio minimo di un evento, per decidere se la griglia deve ignorarlo.
 *
 * Tipo strutturale e non `EventTarget`: così il predicato resta puro e testabile senza DOM.
 */
export type BersaglioEvento = {
  isContentEditable?: boolean;
  closest?: (selettore: string) => unknown;
} | null;

/** Selettore degli elementi che "possiedono" tastiera e appunti quando hanno il focus. */
const CAMPI_PROPRI = 'input, textarea, select, [contenteditable="true"], [role="dialog"]';

/**
 * `true` se l'evento è nato dentro un campo che deve tenersi i propri tasti.
 *
 * La griglia ascolta `keydown`, `copy` e `paste` su `window`, perché le celle non sono elementi
 * focalizzabili. Senza questo filtro, con una cella selezionata l'ascolto globale si prendeva le
 * frecce, il Ctrl+C e il Ctrl+V di QUALUNQUE campo della pagina: scrivere in una casella di ricerca
 * significava non poter muovere il cursore, e un incolla nel filtro finiva nella tabella.
 *
 * Vale anche per `[role="dialog"]`: il pannello di un filtro di colonna è un dialogo in portale,
 * quindi fuori dall'albero della tabella ma non fuori da `window`.
 */
export function eventoDiUnCampo(bersaglio: BersaglioEvento): boolean {
  if (!bersaglio) return false;
  if (bersaglio.isContentEditable === true) return true;
  if (typeof bersaglio.closest !== 'function') return false;
  return Boolean(bersaglio.closest(CAMPI_PROPRI));
}
