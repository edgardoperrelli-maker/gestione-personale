// PURA: motore di esitazione della Consuntivazione. Riusa le stesse funzioni pure del flusso
// operatore (/api/r/[token]/invia) così l'ordine chiuso dal backoffice produce lo STESSO stato
// DB di uno chiuso dall'operatore: esito da azioni, backstop doppio-positivo, registro misuratori.
//
// La differenza è solo l'attribuzione: l'operatore primario (staff_id) porta il valore economico
// UNA volta; la lista completa degli esecutori (squadra) viene registrata su interventi.esecutori
// e su misuratori_rimossi (esecutore = nome primario). Marcatore consuntivato_da/at.
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import {
  decidiChiusuraConPositivi,
  type DecisioneChiusura,
  type PositivoOriginale,
} from '@/lib/interventi/odlPositivi';
import { isRimozioneTipo } from '@/lib/interventi/rimozioneMisuratore';
import { voceDaAttivita } from '@/lib/produzione/voceDaAttivita';
import { ymdLocal } from '@/utils/date-it';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { Esecutore, EsitoVoce } from './types';

/** verde → 'positivo', rossa → 'negativo', neutro → 'neutro' (non esitabile). */
export function valutaEsito(risposte: Record<string, unknown>, campi: TemplateCampo[]): EsitoVoce {
  const patch = esitoInterventoDaVoce(risposte, campi);
  if (!patch) return 'neutro';
  return patch.esito === 'eseguito_positivo' ? 'positivo' : 'negativo';
}

/** Riga per il registro misuratori_rimossi (chiave upsert = intervento_id). */
export type MisuratoreRimossoRow = {
  intervento_id: string;
  rapportino_id: string | null;
  odl: string | null;
  data_esecuzione: string;
  esecutore: string | null;
  indirizzo: string | null;
  comune: string | null;
  matricola: string;
  pdr: string | null;
};

export type DatiEsitazione = {
  interventoId: string;
  committente: string;
  /** interventi.intervento_tipo: guida isRimozioneTipo (registro) e voceDaAttivita (premialità). */
  interventoTipo: string | null;
  risposte: Record<string, unknown>;
  campi: TemplateCampo[];
  /** Squadra esecutrice: il primo è il primario (porta staff_id + €). */
  esecutori: Esecutore[];
  /** auth.users.id del backoffice. */
  consuntivatoDa: string;
  /** Istante corrente (ISO) per consuntivato_at. */
  nowIso: string;
  /** Istante di esecuzione reale (ISO): chiuso_at + base di data_esecuzione/assegnato_at. */
  esecuzioneIso: string;
  /** Positivo già presente per lo stesso (committente, ODL) altrove, se esiste. */
  positivoOriginale: PositivoOriginale | null;
  /** Dati della voce collegata, per il registro misuratori. */
  voce: { matricola: string | null; pdr: string | null; via: string | null; comune: string | null; odl: string | null };
  /** rapportino_id della voce (per la riga registro). */
  rapportinoId: string | null;
};

export type PatchEsitazione = {
  stato: 'completato' | 'annullato';
  esito: 'eseguito_positivo' | null;
  esito_motivo: string | null;
  chiuso_at: string;
  assegnato_at: string;
  consuntivato_da: string;
  consuntivato_at: string;
  esecutori: Esecutore[];
  staff_id: string | null;
  /** Voce KPI (10/11/12/6) per la premialità, se l'attività la risolve; altrimenti invariata (null). */
  voce: number | null;
  da_riconciliare?: boolean;
  riconciliazione_rif_id?: string;
};

export type RisultatoEsitazione = {
  esitoVoce: EsitoVoce;
  decisione: DecisioneChiusura;
  patch: PatchEsitazione;
  misuratore: MisuratoreRimossoRow | null;
};

/**
 * Calcola il patch dell'intervento e l'eventuale riga misuratori per un'esitazione da backoffice.
 * `esitoVoce === 'neutro'` → il chiamante deve rifiutare (l'ordine non è esitabile: nessuna azione
 * di esito compilata). Speculare alla logica di /invia (esito, decidiChiusuraConPositivi,
 * misuratori) ma con attribuzione multi-operatore.
 */
export function calcolaEsitazione(d: DatiEsitazione): RisultatoEsitazione {
  const esitoVoce = valutaEsito(d.risposte, d.campi);
  const patchEsito = esitoInterventoDaVoce(d.risposte, d.campi); // null se neutro
  const primario = d.esecutori[0]?.staff_id ?? null;

  const decisione = decidiChiusuraConPositivi({
    interventoId: d.interventoId,
    esitoPositivo: esitoVoce === 'positivo',
    originale: d.positivoOriginale,
  });

  const voceKpi = voceDaAttivita(d.interventoTipo);

  const base: PatchEsitazione = {
    stato: 'completato',
    esito: patchEsito?.esito ?? null,
    esito_motivo: patchEsito?.esito_motivo ?? null,
    chiuso_at: d.esecuzioneIso,
    assegnato_at: d.esecuzioneIso,
    consuntivato_da: d.consuntivatoDa,
    consuntivato_at: d.nowIso,
    esecutori: d.esecutori,
    staff_id: primario,
    voce: voceKpi,
  };

  if (decisione.tipo === 'annulla_doppio_positivo') {
    // Doppio positivo: NON è un esito reale → annullato + riconciliazione, nessun registro.
    return {
      esitoVoce,
      decisione,
      patch: {
        ...base,
        stato: 'annullato',
        esito: null,
        esito_motivo: decisione.motivo,
        da_riconciliare: true,
        riconciliazione_rif_id: decisione.rifId,
      },
      misuratore: null,
    };
  }

  const patch: PatchEsitazione = { ...base };
  if (decisione.tipo === 'chiudi_e_riconcilia') {
    patch.da_riconciliare = true;
    patch.riconciliazione_rif_id = decisione.rifId;
  }

  // Registro misuratori: stesse condizioni di /invia (positivo + matricola voce + acea + rimozione).
  const matricola = (d.voce.matricola ?? '').trim();
  const misuratore: MisuratoreRimossoRow | null =
    esitoVoce === 'positivo' &&
    matricola &&
    d.committente === 'acea' &&
    isRimozioneTipo(d.interventoTipo)
      ? {
          intervento_id: d.interventoId,
          rapportino_id: d.rapportinoId,
          odl: d.voce.odl ?? null,
          data_esecuzione: ymdLocal(new Date(d.esecuzioneIso)),
          esecutore: d.esecutori[0]?.staff_name ?? null,
          indirizzo: d.voce.via ?? null,
          comune: d.voce.comune ?? null,
          matricola,
          pdr: d.voce.pdr ?? null,
        }
      : null;

  return { esitoVoce, decisione, patch, misuratore };
}
