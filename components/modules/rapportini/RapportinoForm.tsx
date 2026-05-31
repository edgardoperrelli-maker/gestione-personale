'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/* ── Tipi ──────────────────────────────────────────────────────────────────── */

export type Voce = {
  id: string;
  ordine: number;
  nominativo?: string;
  pdr?: string;
  via?: string;
  comune?: string;
  cap?: string;
  attivita?: string;
  fascia_oraria?: string;
  risposte: Record<string, unknown>;
};

type Props = {
  token: string;
  rapportino: { staff_name: string; data: string };
  voci: Voce[];
  campiSnapshot: TemplateCampo[];
  readOnly: boolean;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 800;
const MAX_BACKOFF_MS = 8000;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function formatData(raw: string): string {
  // `data` può essere ISO (yyyy-mm-dd) o datetime; formattiamo in italiano se possibile.
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Una voce è "compilata" se almeno una risposta dei campi è valorizzata. */
function voceHasEsito(risposte: Record<string, unknown>, campi: TemplateCampo[]): boolean {
  return campi.some((c) => {
    const v = risposte[c.chiave];
    if (c.tipo === 'crocetta') return v === true;
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    return true;
  });
}

/* ── Indicatore di salvataggio per-voce ────────────────────────────────────── */

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map: Record<Exclude<SaveState, 'idle'>, { label: string; cls: string }> = {
    saving: {
      label: 'salvataggio…',
      cls: 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)] border-[var(--brand-border)]',
    },
    saved: {
      label: 'salvato ✓',
      cls: 'bg-[var(--success-soft)] text-[var(--success)] border-transparent',
    },
    error: {
      label: 'non salvato — riprova',
      cls: 'bg-[var(--danger-soft)] text-[var(--danger)] border-transparent',
    },
  };
  const { label, cls } = map[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
      aria-live="polite"
    >
      {state === 'saving' && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {label}
    </span>
  );
}

/* ── Componente principale ─────────────────────────────────────────────────── */

export default function RapportinoForm({
  token,
  rapportino,
  voci: vociIniziali,
  campiSnapshot,
  readOnly: readOnlyIniziale,
}: Props) {
  const campi = useMemo(
    () => campiSnapshot.slice().sort((a, b) => a.ordine - b.ordine),
    [campiSnapshot],
  );
  const vociOrdinate = useMemo(
    () => vociIniziali.slice().sort((a, b) => a.ordine - b.ordine),
    [vociIniziali],
  );

  const [voci, setVoci] = useState<Voce[]>(vociOrdinate);
  const [readOnly, setReadOnly] = useState(readOnlyIniziale);
  const [bloccato, setBloccato] = useState(false); // 409 non_modificabile
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(readOnlyIniziale);

  const disabilitato = readOnly || bloccato || inviato;

  // Timer di debounce e tentativi di backoff per voce.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Risposte più recenti per voce, lette al momento dell'invio (evita stale closure).
  const latestRisposteRef = useRef<Record<string, Record<string, unknown>>>({});
  const attemptsRef = useRef<Record<string, number>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    vociOrdinate.forEach((v) => {
      latestRisposteRef.current[v.id] = v.risposte;
    });
  }, [vociOrdinate]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      Object.values(timersRef.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  const setSaveState = useCallback((voceId: string, s: SaveState) => {
    setSaveStates((prev) => (prev[voceId] === s ? prev : { ...prev, [voceId]: s }));
  }, []);

  /** Invio effettivo di una voce con retry/backoff. */
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
          // Rapportino non più modificabile: blocca tutto.
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
        // Errore di rete/server: backoff semplice e riprova mantenendo i dati.
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

  /** Aggiorna lo stato e pianifica un autosave con debounce per la voce. */
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

      // marca dirty + debounce per-voce
      attemptsRef.current[voceId] = 0;
      setSaveState(voceId, 'saving');
      clearTimeout(timersRef.current[voceId]);
      timersRef.current[voceId] = setTimeout(() => {
        void saveVoce(voceId);
      }, DEBOUNCE_MS);
    },
    [disabilitato, saveVoce, setSaveState],
  );

  /** Invio del rapportino. */
  const handleInvia = useCallback(async () => {
    if (disabilitato || inviando) return;

    const senzaEsito = voci.some((v) => !voceHasEsito(latestRisposteRef.current[v.id] ?? v.risposte, campi));
    if (senzaEsito) {
      const ok = window.confirm('Alcune voci sono senza esito. Inviare comunque?');
      if (!ok) return;
    }

    setInviando(true);
    try {
      const res = await fetch(`/api/r/${token}/invia`, { method: 'POST' });
      if (res.status === 409) {
        setBloccato(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInviato(true);
      setReadOnly(true);
    } catch {
      window.alert('Invio non riuscito. Controlla la connessione e riprova.');
    } finally {
      if (mountedRef.current) setInviando(false);
    }
  }, [disabilitato, inviando, voci, campi, token]);

  /* ── Render ───────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">
              Rapportino
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-[var(--brand-text-main)]">
              {rapportino.staff_name}
            </h1>
            <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
              {formatData(rapportino.data)}
            </p>
          </div>
          {inviato && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--success-soft)] px-3 py-1 text-sm font-semibold text-[var(--success)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Inviato
            </span>
          )}
        </div>
      </header>

      {bloccato && !inviato && (
        <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm font-medium text-[var(--danger)]">
          Rapportino non più modificabile. Aggiorna la pagina o contatta l&apos;ufficio.
        </div>
      )}

      {/* Voci */}
      {voci.length === 0 ? (
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
          Nessuna voce in questo rapportino.
        </div>
      ) : (
        <div className="space-y-4">
          {voci.map((voce, idx) => (
            <VoceCard
              key={voce.id}
              voce={voce}
              indice={idx + 1}
              campi={campi}
              disabilitato={disabilitato}
              saveState={saveStates[voce.id] ?? 'idle'}
              onChange={(chiave, valore) => setRisposta(voce.id, chiave, valore)}
            />
          ))}
        </div>
      )}

      {/* Azione di invio */}
      {!readOnly && !inviato && (
        <div className="sticky bottom-0 -mx-4 border-t border-[var(--brand-border)] bg-[var(--brand-bg)]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <button
            type="button"
            onClick={handleInvia}
            disabled={disabilitato || inviando}
            className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-base font-semibold text-[oklch(0.16_0.06_245)] shadow-sm transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviando ? 'Invio in corso…' : 'Invia rapportino'}
          </button>
        </div>
      )}

      {inviato && (
        <div className="rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] p-4 text-center text-sm font-semibold text-[var(--success)]">
          Rapportino inviato ✓
        </div>
      )}
    </div>
  );
}

/* ── Card singola voce ─────────────────────────────────────────────────────── */

function VoceCard({
  voce,
  indice,
  campi,
  disabilitato,
  saveState,
  onChange,
}: {
  voce: Voce;
  indice: number;
  campi: TemplateCampo[];
  disabilitato: boolean;
  saveState: SaveState;
  onChange: (chiave: string, valore: unknown) => void;
}) {
  const anagrafica: { label: string; value?: string }[] = [
    { label: 'Nominativo', value: voce.nominativo },
    { label: 'PDR', value: voce.pdr },
    { label: 'Via', value: voce.via },
    { label: 'Comune', value: voce.comune },
    { label: 'CAP', value: voce.cap },
    { label: 'Attività', value: voce.attivita },
    { label: 'Fascia oraria', value: voce.fascia_oraria },
  ].filter((r) => r.value != null && String(r.value).trim() !== '');

  const titolo = voce.nominativo?.trim() || voce.pdr?.trim() || `Voce ${indice}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-sm">
      {/* Intestazione voce */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-xs font-bold text-[var(--brand-primary)]">
            {indice}
          </span>
          <h2 className="truncate text-sm font-semibold text-[var(--brand-text-main)]">{titolo}</h2>
        </div>
        <SaveBadge state={saveState} />
      </div>

      <div className="space-y-4 p-4">
        {/* Anagrafica in sola lettura */}
        {anagrafica.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-[var(--brand-surface-muted)] p-3 sm:grid-cols-3">
            {anagrafica.map((r) => (
              <div key={r.label} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--brand-text-subtle)]">
                  {r.label}
                </dt>
                <dd className="truncate text-sm text-[var(--brand-text-main)]" title={r.value}>
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* Campi editabili dinamici */}
        {campi.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessun campo da compilare.</p>
        ) : (
          <div className="space-y-3">
            {campi.map((campo) => (
              <CampoInput
                key={campo.chiave}
                campo={campo}
                valore={voce.risposte[campo.chiave]}
                disabilitato={disabilitato}
                onChange={(v) => onChange(campo.chiave, v)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Singolo campo dinamico ────────────────────────────────────────────────── */

function CampoInput({
  campo,
  valore,
  disabilitato,
  onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (valore: unknown) => void;
}) {
  const inputCls =
    'w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-[var(--brand-surface-muted)] disabled:text-[var(--brand-text-muted)]';

  if (campo.tipo === 'crocetta') {
    const checked = valore === true;
    return (
      <label
        className={`flex items-center gap-3 rounded-xl border p-3 transition ${
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]'
            : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)]'
        } ${disabilitato ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.checked)}
          className="h-6 w-6 shrink-0 accent-[var(--brand-primary)]"
        />
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{campo.etichetta}</span>
      </label>
    );
  }

  const labelEl = (
    <label className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">
      {campo.etichetta}
    </label>
  );

  if (campo.tipo === 'select') {
    return (
      <div>
        {labelEl}
        <select
          value={typeof valore === 'string' ? valore : ''}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">— Seleziona —</option>
          {(campo.opzioni ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (campo.tipo === 'numero') {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          inputMode="decimal"
          value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
        />
      </div>
    );
  }

  // testo
  return (
    <div>
      {labelEl}
      <textarea
        rows={2}
        value={typeof valore === 'string' ? valore : ''}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} resize-y`}
      />
    </div>
  );
}
