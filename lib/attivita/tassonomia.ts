// PURA: lookup della tassonomia attività (committente, descrizione) -> gruppo.
// La chiave è la STESSA del listino (normalizzaAttivita): maiuscolo, spazi collassati,
// senza accenti. Equivalente SQL: attivita_norm() (migration 20260720150000).
import { normalizzaAttivita } from '@/lib/produzione/normalizzaAttivita';
import { allineaChiaveAttivita } from '@/lib/attivita/aliasAttivita';

export type TassonomiaRiga = {
  committente: string;
  descrizione: string;       // forma canonica (quella da scrivere su interventi)
  descrizioneNorm: string;
  gruppo: string;
  attivo: boolean;
};

/** Chiave normalizzata di una descrizione ('' se vuota). */
export function chiaveTassonomia(s: string | null | undefined): string {
  return normalizzaAttivita(s)?.key ?? '';
}

/** lim_massive è un marcatore di canale, non un committente: in tassonomia equivale ad acea. */
export function committenteEquivalente(committente: string | null | undefined): string {
  const c = String(committente ?? '').trim().toLowerCase();
  return c === 'lim_massive' ? 'acea' : c;
}

const key = (committente: string, descrizioneNorm: string) => `${committente}|${descrizioneNorm}`;

/** Indice delle sole righe attive, per lookup O(1). */
export function buildTassonomiaIndex(righe: TassonomiaRiga[]): Map<string, TassonomiaRiga> {
  const m = new Map<string, TassonomiaRiga>();
  for (const r of righe ?? []) {
    if (!r.attivo) continue;
    m.set(key(committenteEquivalente(r.committente), r.descrizioneNorm), r);
  }
  return m;
}

/**
 * Risolve (committente, descrizione) → riga di tassonomia, o null se sconosciuta.
 * 'altro' non ha righe proprie: prova acea poi italgas (accetta qualsiasi attività nota).
 * Gli alias (`allineaChiaveAttivita`) allineano le descrizioni fuorvianti PRIMA del lookup,
 * così typo/duplicati risolvono alla forma canonica (stesso gruppo garantito).
 */
export function risolviGruppo(
  committente: string | null | undefined,
  descrizione: string | null | undefined,
  index: Map<string, TassonomiaRiga>,
): TassonomiaRiga | null {
  const k = chiaveTassonomia(descrizione);
  if (!k) return null;
  const c = committenteEquivalente(committente);
  if (c === 'altro') {
    return index.get(key('acea', allineaChiaveAttivita('acea', k)))
      ?? index.get(key('italgas', allineaChiaveAttivita('italgas', k)))
      ?? null;
  }
  return index.get(key(c, allineaChiaveAttivita(c, k))) ?? null;
}
