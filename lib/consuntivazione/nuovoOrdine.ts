// PURA: costruisce, per un ordine CREATO dalla foglietta "Nuovo ordine", il record `interventi`
// (parte anagrafica/classificazione) e la voce `rapportino_voci` contenitore. Le colonne di
// esito/stato/attribuzione (esecutori, staff_id, esito, chiuso_at, voce KPI, consuntivato_da/at)
// arrivano dal patch di calcolaEsitazione e vengono unite dal chiamante (route).
//
// Speculare a lib/interventi/manuali/richiestaToIntervento.ts ma con origine='consuntivo' e SENZA
// forzare l'esito positivo (l'esito lo decidono le azioni compilate).
import { risolviGruppo, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { colonneAnagraficaVoce } from '@/lib/interventi/manuali/buildVoceManuale';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
import type { AnagraficaConsuntivo } from './types';

const trimOrNull = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

function parseCoord(raw: string | null | undefined): [number | null, number | null] {
  if (!raw) return [null, null];
  const m = raw.split(',').map((p) => Number(p.trim()));
  if (m.length !== 2 || !Number.isFinite(m[0]) || !Number.isFinite(m[1])) return [null, null];
  return [m[0], m[1]];
}

export type InterventoConsuntivoBase = {
  committente: string;
  odl: string | null;
  pdr: string | null;
  nominativo: string | null;
  indirizzo: string | null;
  comune: string | null;
  cap: string | null;
  lat: number | null;
  lng: number | null;
  fascia_oraria: string | null;
  matricola_contatore: string | null;
  intervento_tipo: string | null;
  gruppo_attivita: string | null;
  data: string;
  territorio_id: string | null;
  origine: 'consuntivo';
  created_from_mappa: false;
};

/**
 * Parte anagrafica/classificazione dell'intervento consuntivato. La classificazione (committente
 * canonico, descrizione, gruppo attività) segue la tassonomia con alias di SCRITTURA, identica a
 * richiestaToIntervento: una variante nota si riscrive canonica, le sconosciute restano grezze
 * (gruppo null) — ma la route rifiuta a monte un'attività fuori tassonomia (lista chiusa).
 */
export function buildInterventoConsuntivoBase(
  committente: CommittenteManuale,
  anagrafica: AnagraficaConsuntivo,
  ctx: { data: string; territorio_id?: string | null },
  indice: Map<string, TassonomiaRiga>,
): InterventoConsuntivoBase {
  const a = anagrafica;
  const [lat, lng] = parseCoord(a.coordinate);
  const ris = risolviGruppo(committente, a.attivita, indice, { allinea: 'scrittura' });
  return {
    committente: committente as string,
    odl: trimOrNull(a.odl),
    pdr: trimOrNull(a.pdr),
    nominativo: trimOrNull(a.nominativo),
    indirizzo: trimOrNull(a.via),
    comune: trimOrNull(a.comune),
    cap: trimOrNull(a.cap),
    lat,
    lng,
    fascia_oraria: trimOrNull(a.fascia_oraria),
    matricola_contatore: trimOrNull(a.matricola),
    intervento_tipo: ris ? ris.descrizione : trimOrNull(a.attivita),
    gruppo_attivita: ris ? ris.gruppo : null,
    data: ctx.data,
    territorio_id: ctx.territorio_id ?? null,
    origine: 'consuntivo',
    created_from_mappa: false,
  };
}

export type VoceConsuntivoInsert = {
  rapportino_id: string;
  ordine: number;
  manuale: true;
  approvazione_stato: 'approvato';
  nominativo: string | null;
  matricola: string | null;
  pdr: string | null;
  odl: string | null;
  via: string | null;
  comune: string | null;
  cap: string | null;
  recapito: string | null;
  attivita: string | null;
  accessibilita: string | null;
  fascia_oraria: string | null;
  risposte: Record<string, unknown>;
  campi_snapshot: TemplateCampo[];
  raw_json: Record<string, unknown>;
};

/**
 * Voce contenitore del "Nuovo ordine": manuale=true (sempre tenuta nello Storico), già approvata,
 * con le azioni del flusso congelate in campi_snapshot così l'esito è valutato sui campi giusti.
 * Non porta richiesta_id (nessuna coda interventi_manuali: il backoffice è l'autorità).
 */
export function buildVoceConsuntivo(args: {
  rapportinoId: string;
  committente: CommittenteManuale;
  anagrafica: AnagraficaConsuntivo;
  risposte: Record<string, unknown>;
  campi: TemplateCampo[];
}): VoceConsuntivoInsert {
  const cols = colonneAnagraficaVoce({
    committente: args.committente,
    anagrafica: args.anagrafica,
    risposte: args.risposte,
  });
  const raw_json: Record<string, unknown> = { _nuovo: true, _consuntivo: true };
  const coord = trimOrNull(args.anagrafica.coordinate);
  if (coord) raw_json.coordinate = coord;
  return {
    rapportino_id: args.rapportinoId,
    ordine: 1,
    manuale: true,
    approvazione_stato: 'approvato',
    ...cols,
    campi_snapshot: args.campi,
    raw_json,
  };
}
