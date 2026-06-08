'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { partitionInfoCampi, titoloVoce, valoreInfo, type InfoChiave, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { statoVoce, riepilogoRapportino } from '@/utils/rapportini/riepilogo';
import type { SaveState } from './SaveBadge';
import { RapportinoLista, type RigaVoce, type Filtro } from './RapportinoLista';
import { VoceFocus } from './VoceFocus';
import { FabInterventoManuale } from './FabInterventoManuale';
import { ModaleInterventoManuale } from './ModaleInterventoManuale';
import { fabAbilitato } from '@/lib/interventi/manuali/fabAbilitato';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
import { badgeVoceManuale } from '@/lib/interventi/manuali/badgeVoce';
import { RapportinoFotoCtx } from './RapportinoFotoCtx';

/* ── Tipi ──────────────────────────────────────────────────────────────────── */

export type Voce = {
  id: string;
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
};

const DEBOUNCE_MS = 800;
const MAX_BACKOFF_MS = 8000;

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
}: Props) {
  const campi = useMemo(() => campiSnapshot.slice().sort((a, b) => a.ordine - b.ordine), [campiSnapshot]);
  const vociOrdinate = useMemo(() => vociIniziali.slice().sort((a, b) => a.ordine - b.ordine), [vociIniziali]);
  const { dettaglio } = useMemo(() => partitionInfoCampi(infoCampi), [infoCampi]);

  const [voci, setVoci] = useState<Voce[]>(vociOrdinate);
  const [readOnly, setReadOnly] = useState(readOnlyIniziale);
  const [bloccato, setBloccato] = useState(false); // 409 non_modificabile
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(readOnlyIniziale);

  const [vista, setVista] = useState<'lista' | 'focus'>('lista');
  const [indiceCorrente, setIndiceCorrente] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>('tutti');
  const [modaleAperta, setModaleAperta] = useState(false);
  const [bloccoSospese, setBloccoSospese] = useState<number | null>(null); // n. voci in attesa di approvazione

  const disabilitato = readOnly || bloccato || inviato;

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latestRisposteRef = useRef<Record<string, Record<string, unknown>>>({});
  const attemptsRef = useRef<Record<string, number>>({});
  const mountedRef = useRef(true);
  /** Id della voce attualmente in focus (aggiornato a ogni render). */
  const voceIdUploadRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    vociOrdinate.forEach((v) => {
      latestRisposteRef.current[v.id] = v.risposte;
    });
  }, [vociOrdinate]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const setSaveState = useCallback((voceId: string, s: SaveState) => {
    setSaveStates((prev) => (prev[voceId] === s ? prev : { ...prev, [voceId]: s }));
  }, []);

  const saveVoce = useCallback(
    async (voceId: string) => {
      if (!mountedRef.current) return;
      const risposte = latestRisposteRef.current[voceId] ?? {};
      setSaveState(voceId, 'saving');
      try {
        const res = await fetch(`/api/r/${token}/voce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voceId, risposte }),
        });
        if (res.status === 409) {
          attemptsRef.current[voceId] = 0;
          if (mountedRef.current) {
            setBloccato(true);
            setSaveState(voceId, 'idle');
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        attemptsRef.current[voceId] = 0;
        if (mountedRef.current) setSaveState(voceId, 'saved');
      } catch {
        if (!mountedRef.current) return;
        setSaveState(voceId, 'error');
        const attempt = (attemptsRef.current[voceId] ?? 0) + 1;
        attemptsRef.current[voceId] = attempt;
        const delay = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        clearTimeout(timersRef.current[voceId]);
        timersRef.current[voceId] = setTimeout(() => {
          void saveVoce(voceId);
        }, delay);
      }
    },
    [token, setSaveState],
  );

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
      attemptsRef.current[voceId] = 0;
      setSaveState(voceId, 'saving');
      clearTimeout(timersRef.current[voceId]);
      timersRef.current[voceId] = setTimeout(() => {
        void saveVoce(voceId);
      }, DEBOUNCE_MS);
    },
    [disabilitato, saveVoce, setSaveState],
  );

  /** Forza il salvataggio immediato di una voce (usato da "Salva e avanti"). */
  const flushVoce = useCallback(
    (voceId: string) => {
      if (disabilitato) return;
      clearTimeout(timersRef.current[voceId]);
      void saveVoce(voceId);
    },
    [disabilitato, saveVoce],
  );

  /**
   * Carica una foto per il campo `chiave` della voce corrente.
   * Usato da CampoInput tipo='foto' via RapportinoFotoCtx.
   * 1. Invia il file a /api/r/[token]/foto-campo
   * 2. Salva il path nelle risposte della voce (setRisposta + save immediato)
   */
  const uploadFotoVoce = useCallback(
    async (chiave: string, file: File): Promise<string | null> => {
      const voceId = voceIdUploadRef.current;
      if (!voceId || !mountedRef.current) return null;
      try {
        const fd = new FormData();
        fd.append('file', file, file.name);
        const res = await fetch(`/api/r/${token}/foto-campo`, { method: 'POST', body: fd });
        if (!res.ok) return null;
        const json = (await res.json()) as { path?: string };
        const path = json.path ?? null;
        if (path && mountedRef.current) {
          setRisposta(voceId, chiave, path);
          // Salvataggio immediato (non attendere il debounce: la foto è già su storage)
          clearTimeout(timersRef.current[voceId]);
          void saveVoce(voceId);
        }
        return path;
      } catch {
        return null;
      }
    },
    [token, setRisposta, saveVoce],
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
        return { index: idx, titolo, sub, attivita, fascia, stato: statoVoce(v.risposte, campi), nuovo: v.nuovo, annullato: v.annullato, badge: badgeVoceManuale(v.approvazione_stato ?? null) };
      }),
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

  const handleInvia = useCallback(async () => {
    if (disabilitato || inviando || !inviabile) return;
    setInviando(true);
    try {
      const res = await fetch(`/api/r/${token}/invia`, { method: 'POST' });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as { error?: string; inSospeso?: number };
        if (body.error === 'voci_in_sospeso') {
          // Mostra banner dedicato senza bloccare definitivamente il form:
          // l'operatore potrà ritentare l'invio una volta che le voci vengono approvate.
          setBloccoSospese(body.inSospeso ?? 1);
        } else {
          setBloccato(true);
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
  }, [disabilitato, inviando, inviabile, token]);

  /* ── Render ───────────────────────────────────────────────────────────────── */

  if (bloccato && !inviato) {
    return (
      <div className="mx-auto max-w-[480px] px-3 py-6">
        <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm font-medium text-[var(--danger)]">
          Rapportino non più modificabile. Aggiorna la pagina o contatta l&apos;ufficio.
        </div>
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
      {bannerSospese}
      {vista === 'focus' && voci[indiceCorrente] ? (
        <VoceFocus
          voce={voci[indiceCorrente]}
          indice={indiceCorrente}
          totale={voci.length}
          campi={campi}
          dettaglio={dettaglio}
          titoloCampi={titoloCampi}
          disabilitato={disabilitato || (badgeVoceManuale(voci[indiceCorrente].approvazione_stato ?? null)?.bloccata ?? false)}
          stato={statoVoce(voci[indiceCorrente].risposte, campi)}
          saveState={saveStates[voci[indiceCorrente].id] ?? 'idle'}
          onChange={(chiave, valore) => setRisposta(voci[indiceCorrente].id, chiave, valore)}
          onPrev={onPrev}
          onNext={onNext}
          onClose={onClose}
          approvazioneStato={voci[indiceCorrente].approvazione_stato ?? null}
          motivoRifiuto={voci[indiceCorrente].motivo_rifiuto ?? null}
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
          filtro={filtro}
          onFiltro={setFiltro}
          onApri={onApri}
          onInvia={handleInvia}
          inviabile={inviabile}
          inviando={inviando}
          readOnly={readOnly}
          inviato={inviato}
        />
      )}
      {vista === 'lista' && (
        <FabInterventoManuale
          abilitato={fabAbilitato({ readOnly, bloccato, inviato })}
          onClick={() => setModaleAperta(true)}
        />
      )}
      {modaleAperta && (
        <ModaleInterventoManuale
          token={token}
          infoCampi={infoCampiManuale}
          campiPerCommittente={templatesPerCommittente}
          onClose={() => setModaleAperta(false)}
          onCreata={() => {
            setModaleAperta(false);
            window.location.reload();
          }}
        />
      )}
    </div>
    </RapportinoFotoCtx.Provider>
  );
}
