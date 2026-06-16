// utils/rapportini/datiRiepilogoPdf.ts
import { riepilogoRapportino, statoVoce } from './riepilogo';
import { resolveInfoCampi, valoreInfo, type VoceInfo, type TemplateInfoCampo } from './infoCampi';
import { campiEsportabili, type TemplateCampo } from './buildVoci';
import { esitoPositivoDefault } from '@/lib/interventi/manuali/esitoPositivoDefault';

export interface VoceRiepilogo extends VoceInfo {
  risposte: Record<string, unknown>;
  /** Voce creata dal "+": è sempre completa (come nel riepilogo/lista) → va in "Eseguiti". */
  manuale?: boolean;
  /** Stato approvazione ufficio: le voci `rifiutato` sono scartate dal PDF e dai conteggi. */
  approvazione_stato?: string | null;
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
  // Booleano true = crocetta spuntata. Le voci manuali dal "+" salvano la lavorazione come
  // `true` anche se nel template pianificato lo stesso campo è dichiarato 'select': conta lo stesso.
  if (valore === true) return true;
  if (campo.tipo === 'select') {
    const s = typeof valore === 'string' ? valore.trim() : '';
    return s !== '' && !NEG_SELECT.test(s);
  }
  return false;
}

/** Valore di un campo compilabile del template per una voce, formattato per la cella. */
export function valoreCampo(risposte: Record<string, unknown>, campo: TemplateCampo): string {
  const v = risposte?.[campo.chiave];
  // "Fatto" uniforme → "X": crocetta `true` (voci manuali) E select affermativo "SI"/"Sì"
  // (voci pianificate). Così la stessa lavorazione (es. Sostituzione valvola) si legge sempre "X".
  // I valori negativi ("NO") e gli altri testi restano invariati.
  if (v === true || (typeof v === 'string' && /^s[iì]$/i.test(v.trim()))) return 'X';
  if (v === false || v == null) return '';
  if (campo.tipo === 'crocetta') return '';
  return String(v).trim();
}

export function costruisciDatiPdf(params: {
  staffName: string;
  dataLabel: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi?: TemplateInfoCampo[] | null;
}): DatiRiepilogoPdf {
  const { staffName, dataLabel, voci: vociInput, campi, infoCampi } = params;
  // Le voci RIFIUTATE dall'ufficio sono scartate dal PDF: non sono interventi validi → fuori da
  // stats, lavorazioni e liste (coerente con `riepilogoRapportino`). Tutto il resto usa `voci`.
  const voci = vociInput.filter((v) => v.approvazione_stato !== 'rifiutato');
  const riep = riepilogoRapportino(voci, campi);

  // Stesse colonne del rapportino digitale/Excel:
  // anagrafica scelta nel template (info_snapshot) + campi compilabili (campi_snapshot).
  const info = resolveInfoCampi(infoCampi);
  const campiOrd = campiEsportabili(campi).sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  const colonne: ColonnaPdf[] = [
    ...info.map((c) => ({ etichetta: c.etichetta, crocetta: false })),
    ...campiOrd.map((c) => ({ etichetta: c.etichetta, crocetta: c.tipo === 'crocetta' })),
  ];

  // Blindatura del campo esecutivo "eseguito" per le voci manuali (dal "+"): una voce manuale è
  // SEMPRE a esito positivo (vedi `riepilogoRapportino` e lo `stato` qui sotto). Se però il campo
  // `eseguito` non è stato salvato — es. il template solo_manuale del committente non lo dichiara,
  // quindi `esitoPositivoDefault` a creazione è un no-op — la barra "Eseguito" e la cella restavano
  // vuote pur essendo la voce conteggiata negli ESEGUITI (regressione PLENZICH: 45 vs 32). Qui in
  // lettura riapplichiamo l'UNICA fonte di verità `esitoPositivoDefault` (i `campi` del rapportino
  // dichiarano `eseguito`), così barra e cella restano allineate ai totali a prescindere dai dati
  // salvati. Le voci pianificate restano intatte (un "NO" legittimo non viene toccato).
  const risposteVoce = voci.map((v) =>
    v.manuale ? esitoPositivoDefault(campi, v.risposte ?? {}) : (v.risposte ?? {}),
  );

  // Barre "Lavorazioni svolte": crocette spuntate + select positivi (es. saracinesca "SI"),
  // escludendo i marcatori "assente".
  const lavorazioni = campiOrd
    .filter((c) => (c.tipo === 'crocetta' || c.tipo === 'select') && !isMarcatoreAssente(c.chiave, c.etichetta))
    .map((c) => ({
      etichetta: c.etichetta,
      count: risposteVoce.filter((r) => lavorazioneFatta(c, r[c.chiave])).length,
    }))
    .filter((l) => l.count > 0);

  const eseguiti: RigaPdf[] = [];
  const nonEseguiti: RigaPdf[] = [];

  voci.forEach((v, i) => {
    const rsp = risposteVoce[i];
    const valori = [
      ...info.map((c) => valoreInfo(v, c.chiave)),
      ...campiOrd.map((c) => valoreCampo(rsp, c)),
    ];
    const riga: RigaPdf = { n: i + 1, valori };
    // Le voci manuali (dal "+") sono sempre complete → "Eseguiti", coerente con riepilogo/lista.
    // Senza questo, la loro `risposte` (chiavi del template manuale, diverse dal pianificato)
    // dava 'da_fare' e la riga spariva dal PDF pur essendo conteggiata nei totali.
    const stato = v.manuale ? 'eseguito' : statoVoce(rsp, campi);
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
