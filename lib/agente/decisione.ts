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
  tipo?: string;
  /** Avvisi di salute della sincronizzazione OneDrive sul PC-agente (saluteSync.mjs). */
  avvisiSync?: string[];
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
  'via', 'pdr', 'nominativo', 'comune', 'saracinesca', 'note', 'marcatore', 'automazione',
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
      (r) => r.campo !== 'marcatore' && r.abilitato && r.colonna.trim() === marcatore.colonna.trim(),
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

export type ConfigAgente = {
  enabled: boolean;
  giorni: number[];
  ora: string;
  dry_run: boolean;
  finestra_giorni: number;
  mappatura: RegolaMappa[];
  esito_positivo: string;
  esito_negativo: string;
};

const RE_ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida e normalizza l'intera configurazione dell'agente. */
export function validaConfig(input: unknown): EsitoValidazione<ConfigAgente> {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errore: 'Configurazione assente.' };
  }
  const c = input as Record<string, unknown>;

  if (typeof c.enabled !== 'boolean') {
    return { ok: false, errore: 'Il campo "enabled" deve essere booleano.' };
  }

  if (!Array.isArray(c.giorni) || c.giorni.length === 0) {
    return { ok: false, errore: 'Seleziona almeno un giorno.' };
  }
  for (const g of c.giorni) {
    if (typeof g !== 'number' || !Number.isInteger(g) || g < 1 || g > 7) {
      return { ok: false, errore: 'I giorni devono essere interi da 1 (Lun) a 7 (Dom).' };
    }
  }
  const giorni = Array.from(new Set(c.giorni as number[])).sort((a, b) => a - b);

  if (typeof c.ora !== 'string' || !RE_ORA.test(c.ora)) {
    return { ok: false, errore: 'Ora non valida: usa il formato HH:MM (00:00–23:59).' };
  }

  if (typeof c.dry_run !== 'boolean') {
    return { ok: false, errore: 'Il campo "dry_run" deve essere booleano.' };
  }

  if (
    typeof c.finestra_giorni !== 'number' ||
    !Number.isInteger(c.finestra_giorni) ||
    c.finestra_giorni < 1 ||
    c.finestra_giorni > 60
  ) {
    return { ok: false, errore: 'La finestra deve essere un intero da 1 a 60 giorni.' };
  }

  const mapp = validaMappatura(c.mappatura);
  if (!mapp.ok) return { ok: false, errore: mapp.errore };

  if (typeof c.esito_positivo !== 'string' || c.esito_positivo.trim() === '') {
    return { ok: false, errore: 'Il testo esito positivo non può essere vuoto.' };
  }
  if (typeof c.esito_negativo !== 'string' || c.esito_negativo.trim() === '') {
    return { ok: false, errore: 'Il testo esito negativo non può essere vuoto.' };
  }

  return {
    ok: true,
    value: {
      enabled: c.enabled,
      giorni,
      ora: c.ora,
      dry_run: c.dry_run,
      finestra_giorni: c.finestra_giorni,
      mappatura: mapp.value,
      esito_positivo: c.esito_positivo.trim(),
      esito_negativo: c.esito_negativo.trim(),
    },
  };
}

export type DiffColonne = {
  nuove: string[];
  sparite: string[];
};

/**
 * Diff tra lo snapshot precedente delle colonne e quello nuovo.
 * Primo giro (precedenti vuote) = baseline → nuove vuote (niente da evidenziare).
 */
export function diffColonne(precedenti: string[], nuove: string[]): DiffColonne {
  if (precedenti.length === 0) {
    return { nuove: [], sparite: [] };
  }
  const setPrec = new Set(precedenti);
  const setNuove = new Set(nuove);
  return {
    nuove: nuove.filter((c) => !setPrec.has(c)),
    sparite: precedenti.filter((c) => !setNuove.has(c)),
  };
}
