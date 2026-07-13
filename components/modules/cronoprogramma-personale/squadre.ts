// PURO: logica delle "squadre" del cronoprogramma (raggruppamento leggero su assignments).
// Una squadra = N righe assignments con lo stesso squadra_id, nella stessa cella (giorno+territorio).
// team_order = ordine dei membri; is_capo = capo squadra (uno per squadra).
import type { Assignment } from '@/types';

/** Dimensione consigliata della squadra per attività (nome normalizzato → n. persone).
 *  Guida MORBIDA: alimenta il progresso "x/N" e l'avviso "sotto organico", non è un limite rigido. */
export const CREW_SIZE: Record<string, number> = {
  RESINE: 4,
};

const normAttivita = (name: string | null | undefined): string =>
  String(name ?? '').trim().toUpperCase();

/** Dimensione consigliata per l'attività, o null se non mappata. */
export function crewSizeAttivita(name: string | null | undefined): number | null {
  const k = normAttivita(name);
  return k && Object.prototype.hasOwnProperty.call(CREW_SIZE, k) ? CREW_SIZE[k] : null;
}

export type SquadraGroup = {
  kind: 'squad';
  squadraId: string;
  membri: Assignment[]; // ordinati per team_order (poi nome)
  capo: Assignment | null; // is_capo, o il primo membro
  target: number | null; // dimensione consigliata (dall'attività), o null
};
export type SingleItem = { kind: 'single'; a: Assignment };
export type CellItem = SquadraGroup | SingleItem;

/** Patch su una riga assignment per creare/modificare/sciogliere una squadra. */
export type PatchSquadra = {
  id: string;
  squadra_id: string | null;
  team_order: number | null;
  is_capo: boolean;
};

const ordineMembro = (a: Assignment, b: Assignment): number => {
  const oa = a.team_order ?? Number.MAX_SAFE_INTEGER;
  const ob = b.team_order ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return (a.staff?.display_name ?? '').localeCompare(b.staff?.display_name ?? '', 'it', {
    sensitivity: 'base',
  });
};

/**
 * Raggruppa una lista di assegnazioni (già filtrate/ordinate per una cella o gruppo-territorio) in
 * item ordinati: ogni item è una squadra (≥2 membri con lo stesso squadra_id) o una card singola.
 * Preserva la posizione: la squadra compare dove appare il suo PRIMO membro nell'input. Una squadra
 * degenerata (<2 membri) è resa come card(e) singola(e).
 */
export function raggruppaSquadre(assegnazioni: Assignment[]): CellItem[] {
  const groups = new Map<string, Assignment[]>();
  const order: Array<{ kind: 'single'; a: Assignment } | { kind: 'ref'; sid: string }> = [];
  for (const a of assegnazioni ?? []) {
    const sid = a.squadra_id ?? null;
    if (!sid) {
      order.push({ kind: 'single', a });
      continue;
    }
    if (!groups.has(sid)) {
      groups.set(sid, []);
      order.push({ kind: 'ref', sid });
    }
    groups.get(sid)!.push(a);
  }
  const out: CellItem[] = [];
  for (const o of order) {
    if (o.kind === 'single') {
      out.push({ kind: 'single', a: o.a });
      continue;
    }
    const membri = groups.get(o.sid)!;
    if (membri.length < 2) {
      membri.forEach((a) => out.push({ kind: 'single', a }));
      continue;
    }
    const sorted = [...membri].sort(ordineMembro);
    const capo = sorted.find((m) => m.is_capo) ?? sorted[0] ?? null;
    let target: number | null = null;
    for (const m of sorted) {
      const c = crewSizeAttivita(m.activity?.name);
      if (c != null) {
        target = c;
        break;
      }
    }
    out.push({ kind: 'squad', squadraId: o.sid, membri: sorted, capo, target });
  }
  return out;
}

/** Presenti/totale in una squadra, dato l'insieme degli staff in assenza intera quel giorno. */
export function membriPresenti(
  membri: Assignment[],
  assentiStaffIds: Set<string>,
): { presenti: number; totale: number } {
  const totale = membri.length;
  const presenti = membri.filter((m) => !assentiStaffIds.has(m.staff?.id ?? '')).length;
  return { presenti, totale };
}

/**
 * Patch per agganciare `dragged` alla squadra del `target` (stessa cella). Se il target è una card
 * singola nasce una NUOVA squadra (squadraIdNuovo) col target come CAPO (order 0) e dragged (order 1).
 * Se il target è già in squadra, `dragged` si aggiunge in coda (is_capo false). Ritorna [] se non c'è
 * nulla da fare (stessa card, o già nella stessa squadra).
 */
export function pianoAggancio(args: {
  squadraIdNuovo: string;
  target: Assignment;
  dragged: Assignment;
  membriTarget: Assignment[];
}): PatchSquadra[] {
  const { squadraIdNuovo, target, dragged, membriTarget } = args;
  if (dragged.id === target.id) return [];
  if (dragged.squadra_id && dragged.squadra_id === target.squadra_id) return [];
  if (target.squadra_id && membriTarget.length > 0) {
    const maxOrder = Math.max(0, ...membriTarget.map((m) => m.team_order ?? 0));
    return [{ id: dragged.id, squadra_id: target.squadra_id, team_order: maxOrder + 1, is_capo: false }];
  }
  return [
    { id: target.id, squadra_id: squadraIdNuovo, team_order: 0, is_capo: true },
    { id: dragged.id, squadra_id: squadraIdNuovo, team_order: 1, is_capo: false },
  ];
}

/** Patch per rimuovere un membro. Se restano <2 membri la squadra si scioglie (azzera tutti).
 *  Se il rimosso era il capo, promuove il primo rimasto (per team_order) a capo. */
export function pianoRimuoviMembro(membri: Assignment[], membroId: string): PatchSquadra[] {
  const rimasti = membri.filter((m) => m.id !== membroId);
  if (rimasti.length < 2) {
    return membri.map((m) => ({ id: m.id, squadra_id: null, team_order: null, is_capo: false }));
  }
  const eraCapo = membri.find((m) => m.id === membroId)?.is_capo ?? false;
  const patches: PatchSquadra[] = [{ id: membroId, squadra_id: null, team_order: null, is_capo: false }];
  if (eraCapo) {
    const primo = [...rimasti].sort(ordineMembro)[0];
    if (primo) {
      patches.push({
        id: primo.id,
        squadra_id: primo.squadra_id ?? null,
        team_order: primo.team_order ?? 0,
        is_capo: true,
      });
    }
  }
  return patches;
}

/** Patch per sciogliere l'intera squadra: azzera squadra_id/team_order/is_capo su tutti i membri. */
export function pianoSciogli(membri: Assignment[]): PatchSquadra[] {
  return (membri ?? []).map((m) => ({ id: m.id, squadra_id: null, team_order: null, is_capo: false }));
}

/** Patch per cambiare il capo: is_capo=true sul nuovo capo, false sugli altri (solo le righe che cambiano). */
export function pianoSetCapo(membri: Assignment[], nuovoCapoId: string): PatchSquadra[] {
  return (membri ?? [])
    .filter((m) => (m.id === nuovoCapoId) !== (m.is_capo ?? false))
    .map((m) => ({
      id: m.id,
      squadra_id: m.squadra_id ?? null,
      team_order: m.team_order ?? 0,
      is_capo: m.id === nuovoCapoId,
    }));
}
