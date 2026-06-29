// lib/interventi/storico/modifica.ts
// PURE: helper per la modifica voce (admin_plus) e l'estrazione foto della consultazione storico.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';

/** Colonne anagrafiche editabili di `rapportino_voci` (whitelist). */
export const ANAGRAFICA_COLONNE = [
  'odl', 'via', 'comune', 'attivita', 'matricola', 'pdr', 'nominativo', 'cap', 'fascia_oraria',
] as const;
export type AnagraficaColonna = (typeof ANAGRAFICA_COLONNE)[number];
export type AnagraficaPatch = Partial<Record<AnagraficaColonna, string | null>>;

/** Mappa colonna anagrafica della voce → colonna corrispondente sull'intervento. */
const VOCE_TO_INTERVENTO: Record<AnagraficaColonna, string> = {
  odl: 'odl',
  via: 'indirizzo',
  comune: 'comune',
  attivita: 'intervento_tipo',
  matricola: 'matricola_contatore',
  pdr: 'pdr',
  nominativo: 'nominativo',
  cap: 'cap',
  fascia_oraria: 'fascia_oraria',
};

/** Etichette UI per le colonne anagrafiche. */
export const ANAGRAFICA_LABEL: Record<AnagraficaColonna, string> = {
  odl: 'ODL/ODS',
  via: 'Via',
  comune: 'Comune',
  attivita: 'Gruppo attività',
  matricola: 'Matricola',
  pdr: 'PDR',
  nominativo: 'Nominativo',
  cap: 'CAP',
  fascia_oraria: 'Fascia oraria',
};

/** Campi editabili (non-foto) per la modale; garantisce un campo 'note' (testo) in coda. */
export function buildCampiEditor(campiSnapshot: TemplateCampo[] | null | undefined): TemplateCampo[] {
  const base = (Array.isArray(campiSnapshot) ? campiSnapshot : [])
    .filter((c): c is TemplateCampo => Boolean(c) && c.tipo !== 'foto')
    .slice()
    .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  if (!base.some((c) => c.chiave === 'sigillo')) {
    base.push({ chiave: 'sigillo', etichetta: 'Sigillo', tipo: 'testo', ordine: 998 });
  }
  if (!base.some((c) => c.chiave === 'note')) {
    base.push({ chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 999 });
  }
  return base;
}

/** Path foto reali (rapportini/…) per i campi tipo='foto', con etichetta. */
export function estraiFotoPaths(
  risposte: Record<string, unknown> | null | undefined,
  campi: TemplateCampo[],
): { etichetta: string; path: string }[] {
  const r = risposte ?? {};
  const out: { etichetta: string; path: string }[] = [];
  for (const c of campi) {
    if (c.tipo !== 'foto') continue;
    for (const p of comeArrayFoto(r[c.chiave])) {
      if (p.startsWith('rapportini/')) out.push({ etichetta: c.etichetta, path: p });
    }
  }
  return out;
}

/** Whitelist colonne anagrafiche: scarta chiavi ignote, trim, '' → null. */
export function anagraficaPatchValida(body: unknown): AnagraficaPatch {
  const out: AnagraficaPatch = {};
  if (!body || typeof body !== 'object') return out;
  const obj = body as Record<string, unknown>;
  for (const k of ANAGRAFICA_COLONNE) {
    if (!(k in obj)) continue;
    const v = obj[k];
    const s = v == null ? '' : String(v).trim();
    out[k] = s === '' ? null : s;
  }
  return out;
}

/** Traduce le colonne anagrafiche presenti in patch della tabella `interventi`. */
export function anagraficaPatchIntervento(p: AnagraficaPatch): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of ANAGRAFICA_COLONNE) {
    if (k in p) out[VOCE_TO_INTERVENTO[k]] = p[k] ?? null;
  }
  return out;
}
