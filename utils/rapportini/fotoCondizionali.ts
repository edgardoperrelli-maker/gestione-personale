import type { TemplateCampo } from './buildVoci';

/**
 * Foto obbligatorie "su condizione": una foto diventa obbligatoria quando un altro
 * campo della stessa voce assume un certo valore. A differenza del flag statico
 * `obbligatoria`, l'obbligo dipende dalle risposte compilate.
 *
 * Regola attuale (template "Rapportino limitazioni massive"):
 *   campo "Sostituzione valvola" = "SI"  ⇒  foto "Sost. Valvola" obbligatoria.
 *
 * I campi sono riconosciuti per nome (chiave/etichetta), come per `haEsitoNegativo`:
 * la regola vale così su qualunque template che usi quei campi, senza configurazione extra.
 */
interface RegolaFotoCondizionale {
  /** Riconosce il campo "trigger" (select o crocetta) per chiave/etichetta. */
  campoTrigger: RegExp;
  /** Valore del select che attiva l'obbligo (per le crocette: spuntata = attiva). */
  valoreAttiva: RegExp;
  /** Riconosce la/le foto resa/e obbligatoria/e per chiave/etichetta. */
  fotoRichiesta: RegExp;
}

const REGOLE: RegolaFotoCondizionale[] = [
  // Sostituzione valvola = SI → foto della valvola obbligatoria.
  { campoTrigger: /valvol/i, valoreAttiva: /^s[iì]$/i, fotoRichiesta: /valvol/i },
];

const nomeCampo = (c: TemplateCampo): string => `${c.chiave} ${c.etichetta}`;

/**
 * Insieme delle `chiave` dei campi foto resi obbligatori "su condizione" dalle risposte
 * di questa voce. Le foto già `obbligatoria === true` non passano da qui: restano
 * obbligatorie a prescindere.
 */
/** True se la risposta del trigger attiva la condizione (crocetta: spuntata; select: valore uguale). */
function condizioneAttiva(trigger: TemplateCampo, risposta: unknown, valore: string): boolean {
  if (trigger.tipo === 'crocetta') return risposta === true;
  return typeof risposta === 'string' && risposta.trim().toLowerCase() === valore.trim().toLowerCase();
}

export function slotFotoCondizionali(
  campi: TemplateCampo[],
  risposte: Record<string, unknown>,
): Set<string> {
  const out = new Set<string>();
  const lista = campi ?? [];

  // 1) Condizioni CONFIGURATE dal modulo Azioni operatori (obbligatoria_se sul campo foto):
  //    «se SARACINESCA = SI → foto saracinesca obbligatoria». Trigger sparito dal flusso
  //    (rinominato/eliminato altrove) → fail-open: la foto resta facoltativa, mai bloccante.
  for (const c of lista) {
    if (c.tipo !== 'foto' || !c.obbligatoria_se?.chiave) continue;
    const trigger = lista.find((t) => t.chiave === c.obbligatoria_se!.chiave && (t.tipo === 'crocetta' || t.tipo === 'select'));
    if (!trigger) continue;
    if (condizioneAttiva(trigger, risposte?.[trigger.chiave], c.obbligatoria_se.valore ?? '')) out.add(c.chiave);
  }

  // 2) Regole LEGACY riconosciute per nome (retro-compat coi template storici, es. valvola).
  for (const regola of REGOLE) {
    const attiva = lista.some((c) => {
      if (c.tipo !== 'select' && c.tipo !== 'crocetta') return false;
      if (!regola.campoTrigger.test(nomeCampo(c))) return false;
      const v = risposte?.[c.chiave];
      return c.tipo === 'crocetta'
        ? v === true
        : typeof v === 'string' && regola.valoreAttiva.test(v.trim());
    });
    if (!attiva) continue;
    for (const c of lista) {
      if (c.tipo === 'foto' && regola.fotoRichiesta.test(nomeCampo(c))) out.add(c.chiave);
    }
  }
  return out;
}

/**
 * True se lo slot foto è obbligatorio per questa voce: per flag statico (`obbligatoria`)
 * oppure perché reso tale da una condizione (`condizionali`).
 */
export function fotoSlotObbligatorio(campo: TemplateCampo, condizionali: Set<string>): boolean {
  return campo.obbligatoria === true || condizionali.has(campo.chiave);
}
