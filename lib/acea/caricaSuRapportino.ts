// lib/acea/caricaSuRapportino.ts
// PURA: dalle righe selezionate ai rapportini da toccare.
//
// Il gesto: si selezionano righe già pianificate e le si carica DIRETTAMENTE sul rapportino del
// loro esecutore per il loro giorno, senza passare dagli Strumenti. Il motore resta quello di
// `sincronizzaRapportiniAcea` — un rapportino per operatore per giorno, additivo e idempotente —
// e la selezione serve a dire CHI e QUANDO: la chiamata parte con `staffIds` + `data`, quindi il
// rapportino di quell'operatore riceve tutti i suoi interventi ACEA di quel giorno. Caricare la
// «riga sola» non esisterebbe comunque: un rapportino parziale che nasconde lavoro pianificato è
// un operatore che esce senza sapere tutto quello che deve fare.

export type RigaSelezionataPerRapportino = {
  /** Nome dell'esecutore come mostrato in tabella (da `interventi`, via display_name). */
  pianificato_a: string | null;
  /** Giorno pianificato, ISO. */
  pianificato_il: string | null;
  /** `true` se i valori vengono da un APPUNTO: non c'è nessun intervento, niente da caricare. */
  pianificazione_parziale?: boolean;
};

export type NominativoAttivo = { id: string; display_name: string };

export type GruppoRapportino = {
  staffId: string;
  nome: string;
  /** Giorno ISO del rapportino. */
  data: string;
  /** Quante righe selezionate cadono su questo (operatore, giorno). */
  righe: number;
};

export type PianoCarico = {
  gruppi: GruppoRapportino[];
  /** Righe selezionate che non si possono caricare: senza esecutore, senza data, o solo appunto. */
  nonPronte: number;
};

const norm = (x: string) => x.trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Raggruppa le righe selezionate per (esecutore, giorno).
 *
 * Il nome si risolve sugli ATTIVI per corrispondenza esatta: è lo stesso nome che la tabella ha
 * scritto leggendo `staff.display_name`, quindi se non risolve non è un refuso dell'utente — è
 * una riga che non è pronta (o un elenco operatori non caricato), e si conta senza inventare.
 */
export function gruppiPerRapportino(
  righe: readonly RigaSelezionataPerRapportino[],
  attivi: readonly NominativoAttivo[],
): PianoCarico {
  const perNome = new Map<string, NominativoAttivo>();
  for (const a of attivi) perNome.set(norm(a.display_name), a);

  const gruppi = new Map<string, GruppoRapportino>();
  let nonPronte = 0;

  for (const r of righe) {
    if (!r.pianificato_a || !r.pianificato_il || r.pianificazione_parziale === true) {
      nonPronte += 1;
      continue;
    }
    const attivo = perNome.get(norm(r.pianificato_a));
    if (!attivo) {
      nonPronte += 1;
      continue;
    }
    const chiave = `${attivo.id}|${r.pianificato_il}`;
    const g = gruppi.get(chiave)
      ?? { staffId: attivo.id, nome: attivo.display_name, data: r.pianificato_il, righe: 0 };
    g.righe += 1;
    gruppi.set(chiave, g);
  }

  return {
    // Ordine stabile: per nome e poi per giorno, così il riepilogo della conferma non balla.
    gruppi: [...gruppi.values()].sort(
      (a, b) => a.nome.localeCompare(b.nome, 'it') || a.data.localeCompare(b.data),
    ),
    nonPronte,
  };
}
