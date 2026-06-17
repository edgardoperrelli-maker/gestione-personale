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
