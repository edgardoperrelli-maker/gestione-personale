'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { partitionInfoCampi, titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { statoVoce, riepilogoRapportino } from '@/utils/rapportini/riepilogo';
import { motivoVoceIncompleta, type MotivoIncompleto } from '@/utils/rapportini/voceMancante';
import type { SaveState } from './SaveBadge';
import { RapportinoLista, type RigaVoce, type Filtro } from './RapportinoLista';
import { VoceFocus } from './VoceFocus';
import { FabInterventoManuale } from './FabInterventoManuale';
import { LenteRicerca } from './LenteRicerca';
import { ModaleInterventoManuale } from './ModaleInterventoManuale';
import { TaskViaFocus } from './TaskViaFocus';
import { isTaskVia } from '@/lib/interventi/manuali/taskVia';
import { fabAbilitato } from '@/lib/interventi/manuali/fabAbilitato';
import type { CommittenteManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';
import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';
import { RapportinoFotoCtx } from './RapportinoFotoCtx';
import { RisanamentoView } from './risanamento/RisanamentoView';
import type { RigaRisanamento } from './risanamento/types';
import { reidrataVoci, persistiVoce } from '@/lib/offline/persistVoce';
import { risolviFotoPlaceholder, vociDaRiparare } from '@/lib/offline/rehydrate';
import { accodaFoto } from '@/lib/offline/persistFoto';
import { statoBadgeDaOutbox } from '@/lib/offline/voceOutbox';
import { useStatoSync } from '@/lib/offline/useStatoSync';
import { avviaSyncAutomatica, sincronizzaToken } from '@/lib/offline/sync';
import { salvaSnapshot } from '@/lib/offline/snapshot';
import { OfflineStatusPill } from '@/components/offline/OfflineStatusPill';
import { FabSync } from '@/components/offline/FabSync';
import { CassettoDaRisolvere } from '@/components/offline/CassettoDaRisolvere';
import { dbOutbox, dbLavoro } from '@/lib/offline/db';
import { fotoObbligatorieMancantiDettaglio, type FotoMancanteVoce } from '@/utils/rapportini/fotoObbligatorieMancanti';
import { ModaleFotoMancanti } from './ModaleFotoMancanti';
import { campiObbligatoriMancantiVoci, type CampoMancanteVoce } from '@/utils/rapportini/campiObbligatoriVoci';
import { ModaleCampiMancanti } from './ModaleCampiMancanti';

/* ── Tipi ──────────────────────────────────────────────────────────────────── */

export type Voce = {
  id: string;
  /** Chiave stabile della voce (sopravvive alle rigenerazioni del rapportino dall'ufficio). */
  taskId?: string;
  ordine: number;
  nominativo?: string;
  matricola?: string;
  pdr?: string;
  odl?: string;
  via?: string;
  comune?: string;
  cap?: string;
  recapito?: string;
  attivita?: string;
  accessibilita?: string;
  fascia_oraria?: string;
  coordinate?: string;
  notaUfficio?: string;
  risposte: Record<string, unknown>;
  nuovo?: boolean;
  annullato?: boolean;
  manuale?: boolean;
  approvazione_stato?: string | null;
  motivo_rifiuto?: string | null;
};

type Props = {
  token: string;
  rapportino: { staff_name: string; data: string };
  voci: Voce[];
  campiSnapshot: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  titoloCampi?: InfoChiave[];
  readOnly: boolean;
  infoCampiManuale?: TemplateInfoCampo[];
  templatesPerCommittente?: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  infoCampiPerCommittente?: Partial<Record<CommittenteManuale, TemplateInfoCampo[]>>;
  /** Campi "standard" (del template del rapportino) usati dal "+" quando il template manuale non override. */
  campiStandardManuale?: TemplateCampo[];
  tipo?: 'standard' | 'risanamento';
  righe?: RigaRisanamento[];
};

const DEBOUNCE_MS = 800;

function formatData(raw: string): string {
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Fascia compatta per la riga: se il valore è "GG/MM/AAAA HH:MM" mostra solo l'orario. */
function fasciaBreve(raw: string): string {
  const t = raw.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, '').trim();
  return t || raw.trim();
}

/* ── Componente principale ─────────────────────────────────────────────────── */

export default function RapportinoForm({
  token,
  rapportino,
  voci: vociIniziali,
  campiSnapshot,
  infoCampi,
  titoloCampi = [],
  readOnly: readOnlyIniziale,
  infoCampiManuale = [],
  templatesPerCommittente = {},
  infoCampiPerCommittente = {},
  campiStandardManuale,
  tipo,
  righe: righeRisanamento,
}: Props) {
  const campi = useMemo(() => campiSnapshot.slice().sort((a, b) => a.ordine - b.ordine), [campiSnapshot]);
  const vociOrdinate = useMemo(() => vociIniziali.slice().sort((a, b) => a.ordine - b.ordine), [vociIniziali]);
  const { dettaglio } = useMemo(() => partitionInfoCampi(infoCampi), [infoCampi]);

  const [voci, setVoci] = useState<Voce[]>(vociOrdinate);
  const [readOnly, setReadOnly] = useState(readOnlyIniziale);
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(readOnlyIniziale);

  const [vista, setVista] = useState<'lista' | 'focus'>('lista');
  const [indiceCorrente, setIndiceCorrente] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [ricerca, setRicerca] = useState('');
  const [modaleAperta, setModaleAperta] = useState(false);
  const [prefillManuale, setPrefillManuale] = useState<{ committenteIniziale: CommittenteManuale; anagraficaIniziale: AnagraficaManuale; parentVoceId: string } | null>(null);
  const [bloccoSospese, setBloccoSospese] = useState<number | null>(null);
  const [bloccatoInvia, setBloccatoInvia] = useState(false); // 409 terminale all'invio (link scaduto/già inviato)
  const [fotoMancanti, setFotoMancanti] = useState<FotoMancanteVoce[] | null>(null); // avviso pre-invio
  const [avvisoManuale, setAvvisoManuale] = useState<string | null>(null);
  const [campiMancanti, setCampiMancanti] = useState<CampoMancanteVoce[] | null>(null); // blocco pre-invio

  const { perVoce: outboxPerVoce, bloccati, bloccatiItems, inAttesa, online, sincronizzaOra } = useStatoSync(token);
  const bloccato = bloccati > 0 || bloccatoInvia;

  const disabilitato = readOnly || bloccato || inviato;

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latestRisposteRef = useRef<Record<string, Record<string, unknown>>>({});
  const mountedRef = useRef(true);
  /** Id della voce attualmente in focus (aggiornato a ogni render). */
  const voceIdUploadRef = useRef<string | undefined>(undefined);
  /** Valore precedente di `inAttesa`: per rilevare quando la coda si svuota. */
  const prevInAttesaRef = useRef(0);
  /** Mappa id-voce → taskId (chiave stabile) per accodare i salvataggi resilienti alle rigenerazioni. */
  const taskIdPerVoceRef = useRef<Record<string, string | undefined>>({});

  useEffect(() => {
    vociOrdinate.forEach((v) => {
      latestRisposteRef.current[v.id] = v.risposte;
    });
  }, [vociOrdinate]);

  // Tiene aggiornata la mappa id→taskId per TUTTE le voci a video (incluse le manuali aggiunte a runtime).
  useEffect(() => {
    voci.forEach((v) => { taskIdPerVoceRef.current[v.id] = v.taskId; });
  }, [voci]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    void salvaSnapshot(token, 'rapportino', {
      rapportino, voci: vociOrdinate, campiSnapshot, infoCampi, titoloCampi,
    });
    const stop = avviaSyncAutomatica(token);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    let attivo = true;
    void reidrataVoci(token, vociOrdinate).then((reidratate) => {
      if (!attivo) return;
      setVoci(reidratate);
      reidratate.forEach((v) => { latestRisposteRef.current[v.id] = v.risposte; });
    });
    return () => { attivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Riparazione (recupero del bug pre-fix): se il telefono (dbLavoro) ha il path reale di una foto
  // ma il server ha ancora un placeholder, re-invia quelle voci. Gira ANCHE su rapportino inviato:
  // /api/r/[token]/voce accetta i salvataggi post-invio applicando SOLO il completamento foto
  // (mergeRisposte soloCompletamentoFoto). No-op se il telefono non ha i path reali in locale.
  useEffect(() => {
    let attivo = true;
    void dbLavoro.perToken(token).then((lavori) => {
      if (!attivo || !mountedRef.current) return;
      const daRiparare = vociDaRiparare(vociOrdinate, lavori);
      if (daRiparare.length === 0) return;
      const perVoce = new Map(lavori.map((l) => [l.voceId, l.risposte]));
      for (const voceId of daRiparare) {
        const risposte = perVoce.get(voceId);
        if (risposte) void persistiVoce(token, voceId, risposte, Date.now(), taskIdPerVoceRef.current[voceId]);
      }
      void sincronizzaToken(token);
    });
    return () => { attivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Quando la coda si svuota (sync completato), risolve i placeholder foto col path reale
  // scritto in dbLavoro → il badge "in attesa di rete" sparisce e la foto risulta caricata.
  useEffect(() => {
    if (prevInAttesaRef.current > 0 && inAttesa === 0) {
      void dbLavoro.perToken(token).then((lavori) => {
        if (!mountedRef.current) return;
        setVoci((prev) => {
          const risolte = risolviFotoPlaceholder(prev, lavori);
          risolte.forEach((v) => { latestRisposteRef.current[v.id] = v.risposte; });
          return risolte;
        });
      });
    }
    prevInAttesaRef.current = inAttesa;
  }, [inAttesa, token]);

  const setRisposta = useCallback(
    (voceId: string, chiave: string, valore: unknown) => {
      if (disabilitato) return;
      setVoci((prev) =>
        prev.map((v) => {
          if (v.id !== voceId) return v;
          const risposte = { ...v.risposte, [chiave]: valore };
          latestRisposteRef.current[voceId] = risposte;
          return { ...v, risposte };
        }),
      );
      clearTimeout(timersRef.current[voceId]);
      timersRef.current[voceId] = setTimeout(() => {
        void persistiVoce(token, voceId, latestRisposteRef.current[voceId] ?? {}, Date.now(), taskIdPerVoceRef.current[voceId])
          .then(() => sincronizzaToken(token));
      }, DEBOUNCE_MS);
    },
    [disabilitato, token],
  );

  /** Forza il salvataggio immediato di una voce (usato da "Salva e avanti"). */
  const flushVoce = useCallback(
    (voceId: string) => {
      if (disabilitato) return;
      clearTimeout(timersRef.current[voceId]);
      void persistiVoce(token, voceId, latestRisposteRef.current[voceId] ?? {}, Date.now(), taskIdPerVoceRef.current[voceId])
        .then(() => sincronizzaToken(token));
    },
    [disabilitato, token],
  );

  /**
   * Carica una foto per il campo `chiave` della voce corrente — offline-first.
   * Accoda il blob in IndexedDB (via accodaFoto), scrive il placeholder nelle
   * risposte e lo persiste immediatamente (no debounce) per evitare che un
   * salvataggio successivo sovrascriva il path reale riscritto dal sync.
   */
  const uploadFotoVoce = useCallback(
    async (chiave: string, file: File): Promise<string | null> => {
      const voceId = voceIdUploadRef.current;
      if (!voceId || !mountedRef.current) return null;
      const now = Date.now();
      // Accoda la foto (blob in IndexedDB + elemento outbox). Ritorna il placeholder.
      const placeholder = await accodaFoto(token, voceId, chiave, file, now);
      if (!placeholder || !mountedRef.current) return placeholder;
      // Scrivi il placeholder nella risposta e PERSISTI subito (no debounce) per evitare
      // che un salvataggio successivo sovrascriva il path reale riscritto dal sync.
      const risposteCorrenti = { ...(latestRisposteRef.current[voceId] ?? {}), [chiave]: placeholder };
      latestRisposteRef.current[voceId] = risposteCorrenti;
      setVoci((prev) => prev.map((v) => (v.id === voceId ? { ...v, risposte: risposteCorrenti } : v)));
      await persistiVoce(token, voceId, risposteCorrenti, now, taskIdPerVoceRef.current[voceId]);
      void sincronizzaToken(token);
      return placeholder;
    },
    [token],
  );

  /* ── Derivati ─────────────────────────────────────────────────────────────── */

  const riepilogo = useMemo(() => riepilogoRapportino(voci, campi), [voci, campi]);
  const inviabile = riepilogo.daFare === 0 && voci.length > 0;

  const righe: RigaVoce[] = useMemo(
    () =>
      voci.map((v, idx) => {
        const titolo = titoloVoce(v, titoloCampi, idx);
        const sub = [valoreInfo(v, 'via'), valoreInfo(v, 'comune')].filter(Boolean).join(' · ');
        const attivita = valoreInfo(v, 'attivita');
        const fascia = fasciaBreve(valoreInfo(v, 'fascia_oraria'));
        return { index: idx, titolo, sub, attivita, fascia, stato: v.manuale ? 'eseguito' : statoVoce(v.risposte, campi), nuovo: v.nuovo, annullato: v.annullato, nota: v.notaUfficio, badge: badgeVoceManuale(v.approvazione_stato ?? null), matricola: valoreInfo(v, 'matricola'), via: valoreInfo(v, 'via'), odl: valoreInfo(v, 'odl') };
      }),
    [voci, campi, titoloCampi],
  );

  const mancanti = useMemo(
    () =>
      voci
        .map((v, idx) => ({ index: idx, v }))
        .filter(({ v }) => !v.annullato)
        .map(({ index, v }) => ({ index, titolo: titoloVoce(v, titoloCampi, index), motivo: motivoVoceIncompleta(v.risposte, campi) }))
        .filter((m): m is { index: number; titolo: string; motivo: MotivoIncompleto } => m.motivo !== null),
    [voci, campi, titoloCampi],
  );

  /* ── Navigazione ──────────────────────────────────────────────────────────── */

  const onApri = useCallback((index: number) => {
    setIndiceCorrente(index);
    setVista('focus');
  }, []);

  const onClose = useCallback(() => setVista('lista'), []);
  const onPrev = useCallback(() => setIndiceCorrente((i) => Math.max(0, i - 1)), []);

  const onNext = useCallback(() => {
    const corrente = voci[indiceCorrente];
    if (corrente && !disabilitato) flushVoce(corrente.id);
    if (indiceCorrente >= voci.length - 1) setVista('lista');
    else setIndiceCorrente((i) => i + 1);
  }, [voci, indiceCorrente, disabilitato, flushVoce]);

  /** Esegue l'invio vero e proprio (online o coda offline). Il controllo foto è a monte. */
  const eseguiInvio = useCallback(async () => {
    // L'invio richiede rete in questa fase: i dati compilati sono già salvati/sincronizzati,
    // ma la chiusura del rapportino (con i suoi controlli) va fatta online.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await dbOutbox.put({ id: `invia:${token}`, type: 'invia', token, createdAt: Date.now(), tentativi: 0, stato: 'in_attesa', payload: {} });
      setInviato(true);
      setReadOnly(true);
      setVista('lista');
      window.alert('Rapportino messo in coda: verrà inviato appena torna la rete.');
      return;
    }
    setInviando(true);
    try {
      const res = await fetch(`/api/r/${token}/invia`, { method: 'POST' });
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; inSospeso?: number };
        if (body.error === 'voci_in_sospeso') {
          setBloccoSospese(body.inSospeso ?? 1); // banner soft, ritentabile dopo approvazione
        } else {
          setBloccatoInvia(true); // terminale: link scaduto / già inviato
        }
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBloccoSospese(null);
      setInviato(true);
      setReadOnly(true);
      setVista('lista');
    } catch {
      window.alert('Invio non riuscito. Controlla la connessione e riprova.');
    } finally {
      if (mountedRef.current) setInviando(false);
    }
  }, [token]);

  const handleInvia = useCallback(() => {
    if (disabilitato || inviando || !inviabile) return;
    // Campi obbligatori (non-foto) vuoti → blocco rigido con elenco, PRIMA del check foto.
    const campiObbl = campiObbligatoriMancantiVoci(voci, campi, titoloCampi);
    if (campiObbl.length > 0) { setCampiMancanti(campiObbl); return; }
    // Foto obbligatorie mai scattate → mostra QUALI task e QUALI tipologie, poi l'operatore
    // decide: andare a scattarle o inviare comunque. Niente foto mancanti → invio diretto.
    const mancanti = fotoObbligatorieMancantiDettaglio(voci, campi, titoloCampi);
    if (mancanti.length > 0) { setFotoMancanti(mancanti); return; }
    void eseguiInvio();
  }, [disabilitato, inviando, inviabile, voci, campi, titoloCampi, eseguiInvio]);

  /* ── Render ───────────────────────────────────────────────────────────────── */

  if (bloccato && !inviato) {
    return (
      <div className="mx-auto max-w-[480px] px-3 py-6">
        {bloccatoInvia && (
          <div className="mb-3 rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm font-medium text-[var(--danger)]">
            Rapportino non più inviabile (link scaduto o già inviato). Contatta l&apos;ufficio.
          </div>
        )}
        <CassettoDaRisolvere items={bloccatiItems} onRimosso={sincronizzaOra} />
      </div>
    );
  }

  const bannerSospese = bloccoSospese !== null && !inviato ? (
    <div className="mx-3 mb-3 rounded-2xl border border-[var(--warning,#f59e0b)] bg-[var(--warning-soft,#fef3c7)] p-4 text-sm font-medium text-[var(--warning-fg,#92400e)]">
      {bloccoSospese === 1
        ? 'Hai 1 intervento in attesa di approvazione: il rapportino non è inviabile finché non viene approvato.'
        : `Hai ${bloccoSospese} interventi in attesa di approvazione: il rapportino non è inviabile finché non vengono approvati.`}
    </div>
  ) : null;

  const dataLabel = formatData(rapportino.data);

  // Aggiorna il ref alla voce corrente: usato da uploadFotoVoce senza causare re-render.
  voceIdUploadRef.current = vista === 'focus' ? voci[indiceCorrente]?.id : undefined;

  return (
    <RapportinoFotoCtx.Provider value={uploadFotoVoce}>
    <div className="mx-auto max-w-[480px]">
      <OfflineStatusPill token={token} />
      {avvisoManuale && (
        <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3 text-sm text-[var(--brand-text-main)]">
          <span>{avvisoManuale}</span>
          <button type="button" onClick={() => setAvvisoManuale(null)} className="shrink-0 text-xs font-semibold text-[var(--brand-text-muted)]">Chiudi</button>
        </div>
      )}
      {bannerSospese}
      {tipo === 'risanamento' ? (
        <RisanamentoView token={token} rapportino={rapportino} voci={voci} righeIniziali={righeRisanamento ?? []} campi={campi} readOnly={readOnly} />
      ) : vista === 'focus' && voci[indiceCorrente] && isTaskVia(voci[indiceCorrente]) ? (
        <TaskViaFocus
          voce={voci[indiceCorrente]}
          token={token}
          onClose={onClose}
          onAggiungi={(v) => {
            setPrefillManuale({
              committenteIniziale: 'italgas',
              anagraficaIniziale: { via: v.via ?? '' },
              parentVoceId: v.taskId ?? v.id,
            });
            setModaleAperta(true);
          }}
        />
      ) : vista === 'focus' && voci[indiceCorrente] ? (
        <VoceFocus
          voce={voci[indiceCorrente]}
          indice={indiceCorrente}
          totale={voci.length}
          campi={campi}
          dettaglio={dettaglio}
          titoloCampi={titoloCampi}
          disabilitato={disabilitato || (badgeVoceManuale(voci[indiceCorrente].approvazione_stato ?? null)?.bloccata ?? false)}
          stato={statoVoce(voci[indiceCorrente].risposte, campi)}
          saveState={statoBadgeDaOutbox(outboxPerVoce[voci[indiceCorrente].id]) as SaveState}
          onChange={(chiave, valore) => setRisposta(voci[indiceCorrente].id, chiave, valore)}
          onPrev={onPrev}
          onNext={onNext}
          onClose={onClose}
          approvazioneStato={voci[indiceCorrente].approvazione_stato ?? null}
          motivoRifiuto={voci[indiceCorrente].motivo_rifiuto ?? null}
          notaUfficio={voci[indiceCorrente].notaUfficio ?? null}
        />
      ) : (
        <RapportinoLista
          staffName={rapportino.staff_name}
          dataLabel={dataLabel}
          dataIso={rapportino.data}
          voci={voci}
          campi={campi}
          infoCampi={infoCampi}
          riepilogo={riepilogo}
          righe={righe}
          mancanti={mancanti}
          filtro={filtro}
          onFiltro={setFiltro}
          onApri={onApri}
          onInvia={handleInvia}
          inviabile={inviabile}
          inviando={inviando}
          readOnly={readOnly}
          inviato={inviato}
          ricerca={ricerca}
        />
      )}
      {tipo !== 'risanamento' && vista === 'lista' && (
        <LenteRicerca value={ricerca} onChange={setRicerca} />
      )}
      {vista === 'lista' && (
        <FabInterventoManuale
          abilitato={fabAbilitato({ readOnly, bloccato, inviato })}
          onClick={() => setModaleAperta(true)}
        />
      )}
      {vista === 'lista' && (
        <FabSync
          inAttesa={inAttesa}
          online={online}
          onSync={sincronizzaOra}
          // Sopra la lente (9.5rem) quando c'è; nel risanamento (niente lente) sopra il "+" (5.5rem).
          bottom={tipo !== 'risanamento'
            ? 'calc(13.5rem + env(safe-area-inset-bottom))'
            : 'calc(9.5rem + env(safe-area-inset-bottom))'}
        />
      )}
      {modaleAperta && (
        <ModaleInterventoManuale
          token={token}
          infoCampi={infoCampiManuale}
          campiPerCommittente={templatesPerCommittente}
          infoCampiPerCommittente={infoCampiPerCommittente}
          campiStandard={campiStandardManuale ?? campiSnapshot}
          committenteIniziale={prefillManuale?.committenteIniziale}
          anagraficaIniziale={prefillManuale?.anagraficaIniziale}
          parentVoceId={prefillManuale?.parentVoceId}
          voci={voci}
          onApriAssegnato={(voceId) => {
            setModaleAperta(false);
            setPrefillManuale(null);
            const idx = voci.findIndex((v) => v.id === voceId);
            if (idx >= 0) { window.alert('Ordine già assegnato a te — apro il task da compilare.'); onApri(idx); }
          }}
          onClose={() => { setModaleAperta(false); setPrefillManuale(null); }}
          onCreata={(stato) => {
            setModaleAperta(false);
            setPrefillManuale(null);
            if (stato === 'inviata') {
              window.location.reload();
            } else {
              // Offline: la pratica è in coda. Niente reload (la cache non mostrerebbe la
              // nuova voce); conferma all'operatore e tenta una sync appena possibile.
              setAvvisoManuale('Richiesta salvata: verrà inviata alla sincronizzazione.');
              void sincronizzaToken(token);
            }
          }}
        />
      )}
      {campiMancanti && campiMancanti.length > 0 && (
        <ModaleCampiMancanti
          voci={campiMancanti}
          onControlla={(index) => { setCampiMancanti(null); onApri(index); }}
          onChiudi={() => setCampiMancanti(null)}
        />
      )}
      {fotoMancanti && fotoMancanti.length > 0 && (
        <ModaleFotoMancanti
          voci={fotoMancanti}
          onControlla={(index) => { setFotoMancanti(null); onApri(index); }}
          onInviaComunque={() => { setFotoMancanti(null); void eseguiInvio(); }}
          onChiudi={() => setFotoMancanti(null)}
        />
      )}
    </div>
    </RapportinoFotoCtx.Provider>
  );
}
