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
