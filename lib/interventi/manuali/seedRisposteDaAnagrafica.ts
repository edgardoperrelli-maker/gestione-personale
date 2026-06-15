// PURA: pre-riempie i campi esito che duplicano un dato già inserito in anagrafica.
// Nei template manuali può capitare un campo esito con la stessa chiave di un campo
// anagrafica (es. "Matricola" → slug `matricola`, "Via" → `via`): senza questo seed
// ricomparirebbe vuoto nello step successivo e l'operatore dovrebbe reinserirlo.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { AnagraficaManuale } from './types';

// Chiavi esito con nome diverso ma stesso significato di un campo anagrafica.
// (slugify rimuove la barra: "ODS/ODL" → `odsodl`, "Indirizzo" → `indirizzo`).
const ALIAS: Record<string, keyof AnagraficaManuale> = {
  indirizzo: 'via',
  odsodl: 'odl',
  ods_odl: 'odl',
  ods: 'odl',
  n_matricola: 'matricola',
  numero_matricola: 'matricola',
};

const nonVuoto = (v: unknown): v is string | number =>
  v != null && String(v).trim() !== '';

/**
 * Ritorna una copia di `risposte` con i campi esito testuali pre-riempiti dal dato
 * anagrafica corrispondente (per chiave diretta o alias). Non sovrascrive valori già
 * presenti in `risposte`. Ignora i campi foto e crocetta. Funzione pura.
 */
export function seedRisposteDaAnagrafica(
  risposte: Record<string, unknown>,
  anagrafica: AnagraficaManuale,
  campiEsito: TemplateCampo[],
): Record<string, unknown> {
  const out = { ...risposte };
  for (const c of campiEsito) {
    if (c.tipo === 'foto' || c.tipo === 'crocetta') continue;
    if (nonVuoto(out[c.chiave])) continue; // non sovrascrivere quanto già compilato
    const diretto = anagrafica[c.chiave as keyof AnagraficaManuale];
    const alias = ALIAS[c.chiave] ? anagrafica[ALIAS[c.chiave]] : undefined;
    const valore = nonVuoto(diretto) ? diretto : alias;
    if (nonVuoto(valore)) out[c.chiave] = valore;
  }
  return out;
}
