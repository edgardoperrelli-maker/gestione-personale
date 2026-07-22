import type { RegolaMappa } from '@/lib/agente/decisione';

/** Riga singleton agente_config letta dalla pagina server. */
export type AgenteConfigRow = {
  id: number;
  enabled: boolean;
  giorni: number[];
  ora: string;
  dry_run: boolean;
  finestra_giorni: number;
  mappatura: RegolaMappa[];
  esito_positivo: string;
  esito_negativo: string;
  ultimo_giro_il: string | null;
  ultimo_contatto_il: string | null;
  ultima_rivendicazione_giorno: string | null;
  updated_at: string;
  /** Avvisi salute OneDrive consegnati dal tick (jsonb: sanificare con normalizzaAvvisiSync). */
  avvisi_sync?: unknown;
  avvisi_sync_il?: string | null;
};

/** Riga storico agente_run letta dalla pagina server. */
export type AgenteRunRow = {
  id: string;
  creato_il: string;
  dry_run: boolean;
  lavori: number;
  aggiornate: number;
  extra: number;
  conflitti: number;
  non_collocate: number;
  errore: string | null;
  /** JSONB pesante (~27KB medi): caricato on-demand all'espansione, non nella lista. */
  dettaglio?: unknown;
  tipo?: string;
};

/** Snapshot colonne rilevate per file (agente_file_colonne). */
export type AgenteFileColonneRow = {
  file: string;
  is_master: boolean;
  colonne: string[];
  colonne_nuove: string[];
  colonne_sparite: string[];
  rilevato_il: string;
};

/** Etichette giorni in ordine ISO 1=Lun..7=Dom (indice 0 = Lun). */
export const GIORNI_LABEL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;

/** "N min fa" / "N h M min fa" / "N g H h fa" a partire dai minuti dall'ultimo contatto. */
export function formattaContatto(minuti: number | null): string {
  if (minuti === null) return 'mai';
  if (minuti <= 0) return 'adesso';
  if (minuti < 60) return `${minuti} min fa`;
  if (minuti < 60 * 24) {
    const h = Math.floor(minuti / 60);
    const m = minuti % 60;
    return m === 0 ? `${h} h fa` : `${h} h ${m} min fa`;
  }
  const g = Math.floor(minuti / (60 * 24));
  const h = Math.floor((minuti % (60 * 24)) / 60);
  return h === 0 ? `${g} g fa` : `${g} g ${h} h fa`;
}

/** ISO → "dd/MM/yyyy HH:mm" in fuso Europe/Rome. null → "—". */
export function formattaIstante(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
}

export type BadgeModalita = { label: 'Prova' | 'Reale'; tono: 'prova' | 'reale' };

/** Badge Prova/Reale a partire dal flag dry_run. */
export function badgeModalita(dryRun: boolean): BadgeModalita {
  return dryRun ? { label: 'Prova', tono: 'prova' } : { label: 'Reale', tono: 'reale' };
}
