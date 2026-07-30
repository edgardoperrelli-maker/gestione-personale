// PURA: opzioni della select "descrizione attività" nella modale intervento manuale ("+").
// Lista chiusa dalla tassonomia (spec §7). Due modalità:
//  - normale: filtrata per committente equivalente ('lim_massive' → 'acea';
//    'altro' → tutte le attive, nessuna riga propria).
//  - sotto un task-via (BONIFICHE EXTRA): la classificazione lato server è SEMPRE
//    Italgas + BONIFICHE EXTRA (richiestaToIntervento / approva con taskViaParent), quindi
//    l'UNICA opzione coerente è "BONIFICHE EXTRA". Mostrare tutte le attività Italgas era
//    fuorviante — qualunque scelta veniva comunque riscritta a BONIFICHE EXTRA, lasciando
//    la voce del rapportino con un'attività (es. "S-PR-003 A") diversa dall'intervento creato.
import { committenteEquivalente, chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { ATTIVITA_TASK_VIA } from './taskVia';

export function opzioniAttivitaManuale(
  tassonomia: TassonomiaRiga[] | undefined,
  committente: string | null | undefined,
  opts?: { soloBonificheExtra?: boolean },
): TassonomiaRiga[] {
  const attive = (tassonomia ?? []).filter((t) => t.attivo);
  // Task-via: solo "BONIFICHE EXTRA" (Italgas). Confronto sulla forma normalizzata così è
  // robusto rispetto alla forma canonica salvata in tassonomia (maiuscolo/spazi/accenti).
  if (opts?.soloBonificheExtra) {
    const chiave = chiaveTassonomia(ATTIVITA_TASK_VIA);
    return attive.filter((t) => t.committente === 'italgas' && t.descrizioneNorm === chiave);
  }
  const ce = committente ? committenteEquivalente(committente) : null;
  if (!ce) return [];
  if (ce === 'altro') return attive;
  return attive.filter((t) => t.committente === ce);
}

// ── Cascata gruppo → dettaglio ───────────────────────────────────────────────
// La select piatta «descrizione — gruppo» costringeva a pescare l'attività giusta in una
// lista unica (per 'altro': TUTTI i cataloghi insieme). La cascata spezza la scelta:
// prima il GRUPPO del committente, poi il DETTAGLIO tra le sole attività di quel gruppo.

/** Gruppi distinti delle opzioni (prima forma incontrata), ordinati per nome. */
export function gruppiAttivitaManuale(opzioni: TassonomiaRiga[]): string[] {
  const visti = new Map<string, string>();
  for (const r of opzioni ?? []) {
    const k = chiaveTassonomia(r.gruppo);
    if (k && !visti.has(k)) visti.set(k, r.gruppo);
  }
  return [...visti.values()].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

/** Le sole opzioni del gruppo indicato (confronto normalizzato); gruppo vuoto → nessuna. */
export function opzioniDelGruppo(
  opzioni: TassonomiaRiga[],
  gruppo: string | null | undefined,
): TassonomiaRiga[] {
  const k = chiaveTassonomia(gruppo);
  if (!k) return [];
  return (opzioni ?? []).filter((r) => chiaveTassonomia(r.gruppo) === k);
}

/**
 * Gruppo dell'attività indicata tra le opzioni, o null se non presente.
 * Inizializza la cascata quando l'attività è già valorizzata (default per committente,
 * richiesta in revisione, task-via).
 */
export function gruppoDellAttivita(
  opzioni: TassonomiaRiga[],
  attivita: string | null | undefined,
): string | null {
  const k = chiaveTassonomia(attivita);
  if (!k) return null;
  const r = (opzioni ?? []).find((o) => o.descrizioneNorm === k || chiaveTassonomia(o.descrizione) === k);
  return r ? r.gruppo : null;
}
