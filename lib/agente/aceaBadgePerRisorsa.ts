// lib/agente/aceaBadgePerRisorsa.ts
// PURO: dagli esiti per-ODL (acea_assegnazioni_log / pre-marcati) calcola, per ogni risorsa, lo stato
// del badge: verde se tutti i suoi ODL sono a posto, rosso se almeno uno è in errore. Raggruppa per
// COGNOME (prima parola, maiuscolo) così il client può fare il join con il nome display dello staff,
// che ha grafia diversa dall'operatore ACEA. Niente side-effect.

export type EsitoBadge = 'ok' | 'errore' | 'nessuno';

export interface RigaEsito {
  odl: string;
  operatore_acea: string | null;
  esito: string;
  creato_il?: string;
  dry_run?: boolean;
}

export interface BadgeRisorsa {
  ok: number;
  errore: number;
  stato: EsitoBadge;
}

const ESITI_OK = new Set(['assegnato', 'gia-assegnato', 'simulato']);
const ESITI_ERRORE = new Set(['fallito', 'non assegnato']);

/** Cognome = prima parola in maiuscolo. Esportato per riusare la stessa chiave di join lato UI. */
export function cognomeChiave(s: string | null | undefined): string {
  return String(s ?? '').trim().split(/\s+/)[0].toUpperCase();
}

/**
 * FONTE UNICA di dedup per-ODL, DRY_RUN-AWARE: per ogni ODL tiene l'esito "effettivo" — l'esito REALE
 * batte sempre una Prova (dry_run), e a parità di tipo vince il `creato_il` più recente. Robusta
 * all'ordine in cui arrivano le righe (non dipende dall'ORDER BY dell'endpoint). Generica: conserva il
 * tipo di riga passato (il client la usa con AceaEsitoRiga, qui con RigaEsito).
 */
export function esitoEffettivoPerOdl<
  T extends { odl: string; esito: string; creato_il?: string; dry_run?: boolean },
>(righe: T[] | null | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of righe ?? []) {
    if (!r?.odl) continue;
    const cur = m.get(r.odl);
    const meglio = !cur
      || (!!cur.dry_run && !r.dry_run)                                                  // reale batte prova
      || (!!cur.dry_run === !!r.dry_run && String(r.creato_il ?? '') > String(cur.creato_il ?? '')); // a parità: più recente
    if (meglio) m.set(r.odl, r);
  }
  return m;
}

export function badgePerRisorsa(righe: RigaEsito[] | null | undefined): Map<string, BadgeRisorsa> {
  // 1) dedup per ODL (dry_run-aware, fonte unica condivisa col client)
  const ultimoPerOdl = esitoEffettivoPerOdl(righe);
  // 2) aggrega per cognome
  const out = new Map<string, BadgeRisorsa>();
  for (const r of ultimoPerOdl.values()) {
    const key = cognomeChiave(r.operatore_acea);
    if (!key) continue;
    const cur = out.get(key) ?? { ok: 0, errore: 0, stato: 'nessuno' as EsitoBadge };
    if (ESITI_OK.has(r.esito)) cur.ok++;
    else if (ESITI_ERRORE.has(r.esito)) cur.errore++;
    out.set(key, cur);
  }
  for (const v of out.values()) v.stato = v.errore > 0 ? 'errore' : v.ok > 0 ? 'ok' : 'nessuno';
  return out;
}
