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
