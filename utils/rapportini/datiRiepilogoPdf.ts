// utils/rapportini/datiRiepilogoPdf.ts
import { riepilogoRapportino, statoVoce } from './riepilogo';
import { valoreInfo, type VoceInfo } from './infoCampi';
import type { TemplateCampo } from './buildVoci';

export interface VoceRiepilogo extends VoceInfo {
  risposte: Record<string, unknown>;
}

export interface RigaRiepilogo {
  n: number;
  nominativo: string;
  pdr: string;
  indirizzo: string;
  attivita: string;
  motivo?: string;
}

export interface DatiRiepilogoPdf {
  staffName: string;
  dataLabel: string;
  stats: { totali: number; eseguiti: number; nonEseguiti: number };
  lavorazioni: { etichetta: string; count: number }[];
  eseguiti: RigaRiepilogo[];
  nonEseguiti: RigaRiepilogo[];
}

/** Marcatori negativi (es. "assente") non sono "lavorazioni svolte". */
function isMarcatoreAssente(chiave: string, etichetta: string): boolean {
  return /assent/i.test(`${chiave} ${etichetta}`);
}

/** Motivo del non eseguito: nota libera se presente, altrimenti "Assente". */
export function motivoNonEseguito(risposte: Record<string, unknown>): string {
  const raw = risposte?.note;
  const nota = typeof raw === 'string' ? raw.trim() : '';
  return nota || 'Assente';
}

export function costruisciDatiPdf(params: {
  staffName: string;
  dataLabel: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
}): DatiRiepilogoPdf {
  const { staffName, dataLabel, voci, campi } = params;
  const riep = riepilogoRapportino(voci, campi);

  const eseguiti: RigaRiepilogo[] = [];
  const nonEseguiti: RigaRiepilogo[] = [];

  voci.forEach((v, i) => {
    const base: RigaRiepilogo = {
      n: i + 1,
      nominativo: valoreInfo(v, 'nominativo') || valoreInfo(v, 'pdr') || `Voce ${i + 1}`,
      pdr: valoreInfo(v, 'pdr'),
      indirizzo: [valoreInfo(v, 'via'), valoreInfo(v, 'comune')].filter(Boolean).join(' · '),
      attivita: valoreInfo(v, 'attivita'),
    };
    const stato = statoVoce(v.risposte, campi);
    if (stato === 'eseguito') eseguiti.push(base);
    else if (stato === 'non_eseguito') nonEseguiti.push({ ...base, motivo: motivoNonEseguito(v.risposte) });
    // 'da_fare' ignorato: dopo l'invio non esiste (gate daFare === 0)
  });

  return {
    staffName,
    dataLabel,
    stats: { totali: riep.totali, eseguiti: riep.eseguiti, nonEseguiti: riep.nonEseguiti },
    lavorazioni: riep.lavorazioni
      .filter((l) => !isMarcatoreAssente(l.chiave, l.etichetta))
      .map((l) => ({ etichetta: l.etichetta, count: l.count })),
    eseguiti,
    nonEseguiti,
  };
}
