/**
 * Riconoscimento PER NOME (nessuna configurazione extra, come `haEsitoNegativo` e
 * `slotFotoCondizionali`) di due concetti usati dal template "Ibrido acea", l'unico
 * template che nello stesso rapportino mescola LIMITAZIONI MASSIVE e LIMITAZIONI/SOSPENSIONI.
 */

/**
 * True se l'attività della voce è una "limitazione massiva". Il match è sul testo
 * (`LIMITAZIONI MASSIVE`, `Limitazione massiva`, …), coerente con la chiave usata dal
 * resto del codice (`lib/produzione/attivitaCanonica.ts`, `attivitaDefaultManuale`).
 */
export function attivitaMassiva(attivita: string | null | undefined): boolean {
  return /massiv/i.test(String(attivita ?? ''));
}

/**
 * True se il template gestisce le foto obbligatorie SOLO per le attività di limitazione
 * massiva (le altre — sospensioni/limitazioni — non le richiedono, come nel template
 * `LIMITAZIONI/SOSPENSIONI`). È il comportamento del template "Ibrido acea", riconosciuto
 * per nome così da non toccare nessun altro template.
 */
export function fotoObbligatorieSoloMassive(nomeTemplate: string | null | undefined): boolean {
  return /ibrido\s*acea/i.test(String(nomeTemplate ?? ''));
}

/**
 * True se il campo (NON-foto) è obbligatorio SOLO per le attività massive nel template
 * "Ibrido acea": oggi il campo SIGILLO. Sulle voci non massive (sospensioni/limitazioni)
 * l'obbligo cade, come nel template LIMITAZIONI/SOSPENSIONI. Riconosciuto per nome:
 * `/sigillo/i` prende il campo testo `sigillo`/`SIGILLO` ma NON la foto `sigillatura`.
 * Le foto sono gestite a parte (saltate in blocco), qui restano fuori.
 */
export function campoObbligatorioSoloMassive(campo: { chiave?: string; etichetta?: string; tipo?: string }): boolean {
  if (campo?.tipo === 'foto') return false;
  return /sigillo/i.test(`${campo?.chiave ?? ''} ${campo?.etichetta ?? ''}`);
}
