// lib/interventi/storico/modifica.ts
// PURE: helper per la modifica voce (admin_plus) e l'estrazione foto della consultazione storico.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import { campiConEsitoCorreggibile } from '@/utils/rapportini/opzioniEsito';

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

/**
 * Campi editabili (non-foto) per la modale; garantisce un campo 'note' (testo) in coda.
 * Le select d'esito escono coi tre canonici sempre selezionabili (SI/NO/NESSUN PASSAGGIO,
 * vedi `campiConEsitoCorreggibile`): gli snapshot storici possono non averli tutti — solo
 * il positivo, o nati prima di «NESSUN PASSAGGIO» — e la correzione a posteriori li vuole tutti.
 */
export function buildCampiEditor(campiSnapshot: TemplateCampo[] | null | undefined): TemplateCampo[] {
  const base = campiConEsitoCorreggibile(
    (Array.isArray(campiSnapshot) ? campiSnapshot : [])
      .filter((c): c is TemplateCampo => Boolean(c) && c.tipo !== 'foto')
      .slice()
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)),
  );
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

/**
 * MATRICOLA NUOVO MISURATORE obbligatoria (Sostituzione misuratori AcquaLatina) dai rapportini
 * generati da questo giorno in poi — migration `20260803160000_acqualatina_matricola_nuova`,
 * che l'ha aggiunta "ai rapportini generati DOPO" il 03/08 ore 16 (cioè da domani, il 04/08).
 *
 * Le voci di rapportini precedenti sono nate SENZA il campo, o senza l'obbligo: in correzione
 * (questa modale) pretenderlo bloccherebbe per sempre interventi che il gate non ha mai visto
 * nascere — l'esito resterebbe "neutro" a vita, mai chiuso, mai in riconciliazione AcquaLatina.
 * Invecchia da sola — fra qualche mese non filtra più niente e resta come traccia della data in
 * cui la regola è cambiata (stesso pattern di `NO_CHIUDE_DAL` in `chiusuraRegistro.ts`).
 */
export const MATRICOLA_NUOVA_OBBLIGATORIA_DAL = '2026-08-04';

/**
 * I campi da usare per calcolare la CHIUSURA di una voce in correzione: le matricole
 * obbligatorie si spengono per le voci di rapportini nati prima del gate (v. sopra). `null`
 * (data ignota, es. voce senza rapportino) conta come "prima": più prudente non bloccare un
 * caso che il gate non può nemmeno collocare nel tempo.
 */
export function campiPerChiusuraStorico(
  campi: TemplateCampo[],
  dataRapportino: string | null,
): TemplateCampo[] {
  if (dataRapportino !== null && dataRapportino >= MATRICOLA_NUOVA_OBBLIGATORIA_DAL) return campi;
  return campi.map((c) => (c.tipo === 'matricola' && c.obbligatoria ? { ...c, obbligatoria: false } : c));
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

/**
 * La tabella del registro misuratori rimossi per QUESTO committente: ognuno ha la sua (AGENTS.md
 * §13, "registro gemello"). Chi aggiorna una riga di registro dallo storico (cambio esecutore)
 * non deve scrivere sempre su quella ACEA — su una voce AcquaLatina l'update non troverebbe
 * nessuna riga da correggere (0 righe non è un errore per un `.update().eq()`) e la riga gemella
 * resterebbe con esecutore/rapportino_id obsoleti, senza nessuna correzione successiva.
 */
export function tabellaMisuratori(committente: string | null | undefined): 'misuratori_rimossi' | 'acqualatina_misuratori_rimossi' {
  return committente === 'acqualatina' ? 'acqualatina_misuratori_rimossi' : 'misuratori_rimossi';
}
