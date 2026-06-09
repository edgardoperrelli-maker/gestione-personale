// utils/rapportini/datiRiepilogoPdf.ts
import { riepilogoRapportino, statoVoce } from './riepilogo';
import { resolveInfoCampi, valoreInfo, type VoceInfo, type TemplateInfoCampo } from './infoCampi';
import { campiEsportabili, type TemplateCampo } from './buildVoci';

export interface VoceRiepilogo extends VoceInfo {
  risposte: Record<string, unknown>;
}

/** Colonna del PDF: campo anagrafico (info_snapshot) o campo compilabile (campi_snapshot). */
export interface ColonnaPdf {
  etichetta: string;
  /** true se è una crocetta del template → cella stretta e centrata ("X"). */
  crocetta: boolean;
}

export interface RigaPdf {
  n: number;
  /** Valori allineati per indice a DatiRiepilogoPdf.colonne. */
  valori: string[];
}

export interface DatiRiepilogoPdf {
  staffName: string;
  dataLabel: string;
  stats: { totali: number; eseguiti: number; nonEseguiti: number };
  lavorazioni: { etichetta: string; count: number }[];
  /** Colonne dinamiche: anagrafica (da info_snapshot) + campi compilabili (da campi_snapshot). */
  colonne: ColonnaPdf[];
  eseguiti: RigaPdf[];
  nonEseguiti: RigaPdf[];
}

/** Valori di un select che indicano "non fatto" (allineato a voceColore). */
const NEG_SELECT = /^(no|assente|negativ\w*|ko)$/i;

/** Marcatori negativi (es. "assente") non sono "lavorazioni svolte". */
function isMarcatoreAssente(chiave: string, etichetta: string): boolean {
  return /assent/i.test(`${chiave} ${etichetta}`);
}

/**
 * La lavorazione di un campo è "svolta" su una voce?
 * - crocetta: spuntata (true)
 * - select: valorizzata e non negativa (es. "SI") — copre la saracinesca dei template ACEA
 */
function lavorazioneFatta(campo: TemplateCampo, valore: unknown): boolean {
  if (campo.tipo === 'crocetta') return valore === true;
  if (campo.tipo === 'select') {
    const s = typeof valore === 'string' ? valore.trim() : '';
    return s !== '' && !NEG_SELECT.test(s);
  }
  return false;
}

/** Valore di un campo compilabile del template per una voce, formattato per la cella. */
export function valoreCampo(risposte: Record<string, unknown>, campo: TemplateCampo): string {
  const v = risposte?.[campo.chiave];
  if (campo.tipo === 'crocetta') return v === true ? 'X' : '';
  if (v == null) return '';
  return String(v).trim();
}

export function costruisciDatiPdf(params: {
  staffName: string;
  dataLabel: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi?: TemplateInfoCampo[] | null;
}): DatiRiepilogoPdf {
  const { staffName, dataLabel, voci, campi, infoCampi } = params;
  const riep = riepilogoRapportino(voci, campi);

  // Stesse colonne del rapportino digitale/Excel:
  // anagrafica scelta nel template (info_snapshot) + campi compilabili (campi_snapshot).
  const info = resolveInfoCampi(infoCampi);
  const campiOrd = campiEsportabili(campi).sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  const colonne: ColonnaPdf[] = [
    ...info.map((c) => ({ etichetta: c.etichetta, crocetta: false })),
    ...campiOrd.map((c) => ({ etichetta: c.etichetta, crocetta: c.tipo === 'crocetta' })),
  ];

  // Barre "Lavorazioni svolte": crocette spuntate + select positivi (es. saracinesca "SI"),
  // escludendo i marcatori "assente".
  const lavorazioni = campiOrd
    .filter((c) => (c.tipo === 'crocetta' || c.tipo === 'select') && !isMarcatoreAssente(c.chiave, c.etichetta))
    .map((c) => ({
      etichetta: c.etichetta,
      count: voci.filter((v) => lavorazioneFatta(c, v.risposte?.[c.chiave])).length,
    }))
    .filter((l) => l.count > 0);

  const eseguiti: RigaPdf[] = [];
  const nonEseguiti: RigaPdf[] = [];

  voci.forEach((v, i) => {
    const valori = [
      ...info.map((c) => valoreInfo(v, c.chiave)),
      ...campiOrd.map((c) => valoreCampo(v.risposte, c)),
    ];
    const riga: RigaPdf = { n: i + 1, valori };
    const stato = statoVoce(v.risposte, campi);
    if (stato === 'eseguito') eseguiti.push(riga);
    else if (stato === 'non_eseguito') nonEseguiti.push(riga);
    // 'da_fare' ignorato: dopo l'invio non esiste (gate daFare === 0)
  });

  return {
    staffName,
    dataLabel,
    stats: { totali: riep.totali, eseguiti: riep.eseguiti, nonEseguiti: riep.nonEseguiti },
    lavorazioni,
    colonne,
    eseguiti,
    nonEseguiti,
  };
}
