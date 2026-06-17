export type DecideEsecuzioneInput = {
  enabled: boolean;
  giorni: number[];      // ISO 1..7
  ora: string;           // "HH:MM"
  weekday: number;       // ISO 1..7
  oraCorrente: string;   // "HH:MM"
  oggi: string;          // "YYYY-MM-DD"
  ultimaRivendicazione: string | null; // "YYYY-MM-DD" | null
};

/**
 * true sse: abilitato && giorno pianificato && passata l'ora && non già
 * rivendicato oggi. Il confronto orario è lessicografico su "HH:MM" zero-pad.
 */
export function decideEsecuzione(input: DecideEsecuzioneInput): boolean {
  const { enabled, giorni, ora, weekday, oraCorrente, oggi, ultimaRivendicazione } = input;
  return (
    enabled &&
    giorni.includes(weekday) &&
    oraCorrente >= ora &&
    ultimaRivendicazione !== oggi
  );
}

export type ReportFileAgente = {
  aggiornate?: number;
  extraAggiunte?: number;
  conflitti?: unknown[];
};

export type ReportAgente = {
  lavori?: number;
  dryRun?: boolean;
  file?: ReportFileAgente[];
  extraNonCollocate?: unknown[];
  erroreGlobale?: string;
};

export type RiassuntoReport = {
  lavori: number;
  aggiornate: number;
  extra: number;
  conflitti: number;
  nonCollocate: number;
};

/** Somma i conteggi dal report dell'agente; robusto ai campi mancanti. */
export function riassumiReport(report: ReportAgente): RiassuntoReport {
  const file = report.file ?? [];
  let aggiornate = 0;
  let extra = 0;
  let conflitti = 0;
  for (const f of file) {
    aggiornate += f.aggiornate ?? 0;
    extra += f.extraAggiunte ?? 0;
    conflitti += (f.conflitti ?? []).length;
  }
  return {
    lavori: report.lavori ?? 0,
    aggiornate,
    extra,
    conflitti,
    nonCollocate: (report.extraNonCollocate ?? []).length,
  };
}

export type StatoAgenteInput = {
  minutiDaContatto: number | null;
  enabled: boolean;
  giorni: number[];
  ora: string;         // "HH:MM"
  oraCorrente: string; // "HH:MM"
  weekday: number;
  ultimoGiroOggi: boolean;
  onlineMin?: number;  // default 90
  graziaMin?: number;  // default 120
};

export type StatoAgente = {
  online: boolean;
  allerta: string | null;
};

/** Somma graziaMin a una "HH:MM" → nuova "HH:MM" (cap a 23:59). */
function aggiungiMinuti(hhmm: string, minuti: number): string {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  let tot = h * 60 + m + minuti;
  if (tot > 23 * 60 + 59) tot = 23 * 60 + 59;
  const hh = Math.floor(tot / 60);
  const mm = tot % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Stato online + allerta "non gira da…" per il modulo. */
export function statoAgente(input: StatoAgenteInput): StatoAgente {
  const onlineMin = input.onlineMin ?? 90;
  const graziaMin = input.graziaMin ?? 120;

  const online =
    input.minutiDaContatto !== null && input.minutiDaContatto <= onlineMin;

  const giornoPianificato = input.enabled && input.giorni.includes(input.weekday);
  const limite = aggiungiMinuti(input.ora, graziaMin);
  const passataOraGrazia = input.oraCorrente >= limite;

  const allerta =
    giornoPianificato && passataOraGrazia && !input.ultimoGiroOggi
      ? `L'agente non ha eseguito il giro di oggi (atteso entro le ${limite}).`
      : null;

  return { online, allerta };
}

export type RegolaMappa = {
  campo: string;
  colonna: string;
  auto?: boolean;
  abilitato: boolean;
};

export const CAMPI_MAPPABILI = [
  'esecutore', 'data', 'esito', 'sigillo', 'matricola',
  'via', 'pdr', 'nominativo', 'comune', 'marcatore',
] as const;

export type EsitoValidazione<T> =
  | { ok: true; value: T }
  | { ok: false; errore: string };

/** Valida la lista di regole di scrittura (mappa globale). */
export function validaMappatura(input: unknown): EsitoValidazione<RegolaMappa[]> {
  if (!Array.isArray(input)) {
    return { ok: false, errore: 'La mappatura deve essere una lista.' };
  }
  const visti = new Set<string>();
  const regole: RegolaMappa[] = [];
  for (const r of input) {
    if (typeof r !== 'object' || r === null) {
      return { ok: false, errore: 'Ogni regola deve essere un oggetto.' };
    }
    const reg = r as Record<string, unknown>;
    if (typeof reg.campo !== 'string' || !(CAMPI_MAPPABILI as readonly string[]).includes(reg.campo)) {
      return { ok: false, errore: `Campo non valido: ${String(reg.campo)}.` };
    }
    if (typeof reg.colonna !== 'string') {
      return { ok: false, errore: `Colonna non valida per il campo ${reg.campo}.` };
    }
    if (typeof reg.abilitato !== 'boolean') {
      return { ok: false, errore: `Campo "abilitato" non booleano per ${reg.campo}.` };
    }
    if (reg.auto !== undefined && typeof reg.auto !== 'boolean') {
      return { ok: false, errore: `Campo "auto" non booleano per ${reg.campo}.` };
    }
    if (visti.has(reg.campo)) {
      return { ok: false, errore: `Campo duplicato nella mappatura: ${reg.campo}.` };
    }
    visti.add(reg.campo);
    const regola: RegolaMappa = {
      campo: reg.campo,
      colonna: reg.colonna,
      abilitato: reg.abilitato,
    };
    if (reg.auto !== undefined) regola.auto = reg.auto as boolean;
    regole.push(regola);
  }

  // anti-collisione: marcatore abilitato con colonna nominata (auto !== true)
  // non può usare la stessa colonna di un'altra regola abilitata.
  const marcatore = regole.find((r) => r.campo === 'marcatore');
  if (marcatore && marcatore.abilitato && marcatore.auto !== true && marcatore.colonna.trim() !== '') {
    const collisione = regole.some(
      (r) => r.campo !== 'marcatore' && r.abilitato && r.colonna === marcatore.colonna,
    );
    if (collisione) {
      return {
        ok: false,
        errore: `Il marcatore non può usare la colonna "${marcatore.colonna}" già usata da un'altra regola.`,
      };
    }
  }

  return { ok: true, value: regole };
}
