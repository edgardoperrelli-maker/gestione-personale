// PURA: risolve l'attività "canonica" di un intervento a partire dal committente grezzo, dal testo
// grezzo (intervento_tipo) e dal comune, usando la tabella alias `acea_attivita_alias` come fonte di
// verità (+ regole per comune per le righe SENZA attività, dove il testo è vuoto e non è aliasabile).
//
// Non tocca i dati grezzi: è uno strato di normalizzazione a valle usato da produzione economica e
// listino. La riclassificazione del committente (es. gas acea→italgas, massive lim_massive→acea) vive
// QUI, non nella tabella interventi.
import { normalizzaAttivita } from './normalizzaAttivita';
import { voceDaAttivita } from './voceDaAttivita';

export interface AliasRiga {
  committenteOrig: string;
  chiave: string; // normalizzaAttivita(intervento_tipo).key
  committenteEff: string;
  macrogruppo: string;
  attivitaPulita: string;
  voce: number | null;
  attivo: boolean;
}

export interface AttivitaRisolta {
  committenteEff: string;
  macrogruppo: string | null;
  attivitaPulita: string;
  attivitaKey: string; // normalizzaAttivita(attivitaPulita).key — aggancio col listino
  voce: number | null;
  attivo: boolean;
  fonte: 'alias' | 'comune' | 'fallback';
}

/** Chiave della mappa alias: `${committenteOrig}|${chiave}` (entrambi normalizzati). */
export function aliasKey(committenteOrig: string, chiave: string): string {
  return `${(committenteOrig ?? '').trim().toLowerCase()}|${chiave}`;
}

function keyDi(pulita: string): string {
  return normalizzaAttivita(pulita)?.key ?? '';
}

const LIM_MASSIVA = 'Limitazione massiva';
const BONIFICHE_EXTRA = 'Bonifiche extra';

/**
 * Risolve l'attività canonica. `aliasByKey` è la mappa costruita con `aliasKey()`.
 * `massiveComuni` è l'insieme delle CHIAVI normalizzate dei comuni con un master "limitazioni
 * massive" (il comune È il file master, es. LABICO/ZAGAROLO): una riga acea SENZA testo attività
 * è una limitazione massiva SOLO se il suo comune è tra questi (altrove è estranea → italgas).
 * Data-driven: aggiungere un comune al programma massive NON richiede modifiche a questo codice.
 * Ritorna null solo quando non c'è testo NÉ una regola comune applicabile (riga non classificabile).
 */
export function attivitaCanonica(
  committenteOrig: string | null | undefined,
  interventoTipo: string | null | undefined,
  comune: string | null | undefined,
  aliasByKey: Map<string, AliasRiga>,
  massiveComuni: ReadonlySet<string>,
): AttivitaRisolta | null {
  const co = (committenteOrig ?? '').trim().toLowerCase();
  const norm = normalizzaAttivita(interventoTipo);

  // 1) c'è un testo → alias, poi fallback
  if (norm) {
    const a = aliasByKey.get(aliasKey(co, norm.key));
    if (a) {
      return {
        committenteEff: a.committenteEff,
        macrogruppo: a.macrogruppo,
        attivitaPulita: a.attivitaPulita,
        attivitaKey: keyDi(a.attivitaPulita),
        voce: a.voce,
        attivo: a.attivo,
        fonte: 'alias',
      };
    }
    // testo non ancora mappato → degrada in modo morbido (nessun conteggio silenzioso perso)
    return {
      committenteEff: co,
      macrogruppo: null,
      attivitaPulita: norm.etichetta,
      attivitaKey: norm.key,
      voce: voceDaAttivita(norm.etichetta),
      attivo: true,
      fonte: 'fallback',
    };
  }

  // 2) NESSUN testo (intervento_tipo vuoto) → regole per comune
  const comuneKey = normalizzaAttivita(comune)?.key ?? '';
  if (co === 'acea') {
    if (massiveComuni.has(comuneKey)) {
      return { committenteEff: 'acea', macrogruppo: 'LIMITAZIONI MASSIVE', attivitaPulita: LIM_MASSIVA, attivitaKey: keyDi(LIM_MASSIVA), voce: 10, attivo: true, fonte: 'comune' };
    }
    // acea senza attività in un comune SENZA master massive (es. Umbria, mai lavorati) → estranei:
    // italgas, non valorizzati
    return { committenteEff: 'italgas', macrogruppo: 'Attività alla clientela', attivitaPulita: '(senza attività)', attivitaKey: '', voce: null, attivo: true, fonte: 'comune' };
  }
  if (co === 'lim_massive') {
    return { committenteEff: 'acea', macrogruppo: 'LIMITAZIONI MASSIVE', attivitaPulita: LIM_MASSIVA, attivitaKey: keyDi(LIM_MASSIVA), voce: 10, attivo: true, fonte: 'comune' };
  }
  if (co === 'italgas') {
    // manuali italgas senza attività → Bonifiche extra (decisione utente)
    return { committenteEff: 'italgas', macrogruppo: 'Bonifiche extra', attivitaPulita: BONIFICHE_EXTRA, attivitaKey: keyDi(BONIFICHE_EXTRA), voce: null, attivo: true, fonte: 'comune' };
  }
  return null;
}
