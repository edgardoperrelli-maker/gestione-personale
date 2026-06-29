// lib/interventi/storico/types.ts
// Tipi della consultazione "Storico interventi", basata sui rapportini compilati
// (rapportino_voci + rapportino padre). Include sia interventi programmati sia
// manuali (le voci manuali hanno manuale=true).

/** Riga unificata mostrata in tabella (un intervento compilato). */
export type RigaStorico = {
  id: string;
  odl: string | null;
  pdr: string | null;
  matricola: string | null;
  sigillo: string | null; // n° sigillo posato (rapportino_voci.risposte->>'sigillo')
  data: string | null; // data esecuzione = data del rapportino (YYYY-MM-DD)
  esecutore: string | null;
  via: string | null;
  gruppoAttivita: string | null;
  eseguito: string; // 'SI' | 'NO' | '—'
  sostValvola: string; // 'SI' | 'NO' | '—'
  miniBag: string; // 'SI' | 'NO' | '—'
  rgStop: string; // 'SI' | 'NO' | '—'
  note: string | null;
};

/** Rapportino padre embedded (relazione many-to-one). */
export type RapportinoEmbed = {
  staff_id: string | null;
  staff_name: string | null;
  data: string | null;
};

/** Riga grezza letta da `rapportino_voci` con il rapportino padre embedded. */
export type VoceStoricoRow = {
  id: string;
  odl: string | null;
  via: string | null;
  comune: string | null;
  matricola: string | null;
  nominativo: string | null;
  pdr: string | null;
  attivita: string | null;
  risposte: Record<string, unknown> | null;
  manuale: boolean | null;
  // PostgREST restituisce l'embed to-one come oggetto; gestiamo anche array per robustezza.
  rapportini: RapportinoEmbed | RapportinoEmbed[] | null;
};

/** Contatori aggregati sull'insieme filtrato (o intero DB se nessun filtro). */
export type ContatoriStorico = {
  totale: number; // tutte le righe
  esitati: number; // eseguito SI o NO (interventi gestiti)
  eseguiti: number; // eseguito SI
  negativi: number; // eseguito NO
  sostValvola: number; // sost. valvola SI
  miniBag: number; // mini bag SI
  rgStop: number; // rg stop SI
};

/** Risposta dell'endpoint storico. */
export type RispostaStorico = {
  righe: RigaStorico[];
  total: number;
  troncato: boolean;
  pageSize: number;
  contatori: ContatoriStorico;
};
