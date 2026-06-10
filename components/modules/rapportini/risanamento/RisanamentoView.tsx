'use client';

import { useState, useEffect } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiPerScope } from '@/utils/rapportini/campiScope';
import type { Voce } from '@/components/modules/rapportini/RapportinoForm';
import type { RigaRisanamento } from './types';
import { SlotFoto } from './SlotFoto';

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function formatData(raw: string): string {
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* ── Componente principale ─────────────────────────────────────────────────── */

export function RisanamentoView({
  token,
  rapportino,
  voci,
  righeIniziali,
  campi,
  readOnly,
}: {
  token: string;
  rapportino: { staff_name: string; data: string };
  voci: Voce[];
  righeIniziali: RigaRisanamento[];
  campi: TemplateCampo[];
  readOnly: boolean;
}) {
  const scope = campiPerScope(campi);

  /* ── State ──────────────────────────────────────────────────────────────── */
  const [righe, setRighe] = useState<RigaRisanamento[]>(righeIniziali);
  const [civicoApertoId, setCivicoApertoId] = useState<string | null>(null);
  const [accessorieAttive, setAccessorieAttive] = useState<Set<string>>(new Set<string>());
  const [mat, setMat] = useState('');
  const [pdr, setPdr] = useState('');
  const [nom, setNom] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [aggiungendoRiga, setAggiungendoRiga] = useState(false);

  /** vociRisposte: copia locale delle risposte delle voci, per aggiornamento ottimistico. */
  const [vociRisposte, setVociRisposte] = useState<Record<string, Record<string, unknown>>>(
    () => Object.fromEntries(voci.map((v) => [v.id, { ...(v.risposte ?? {}) }])),
  );

  /* ── Effects ────────────────────────────────────────────────────────────── */

  // Fix 1: reset civicoApertoId se la voce non esiste più (no setState in render)
  useEffect(() => {
    if (civicoApertoId !== null && !voci.find((v) => v.id === civicoApertoId)) setCivicoApertoId(null);
  }, [civicoApertoId, voci]);

  // Fix 4: reset accessorieAttive al cambio di civico
  useEffect(() => { setAccessorieAttive(new Set()); }, [civicoApertoId]);

  /* ── Helpers async ──────────────────────────────────────────────────────── */

  const salvaFotoRiga = async (rigaId: string, chiave: string, path: string | null) => {
    if (!path) { setErrore('Upload foto fallito'); return; }
    setErrore(null);
    try {
      const res = await fetch(`/api/r/${token}/riga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rigaId, risposte: { [chiave]: path } }),
      });
      if (!res.ok) { setErrore('Errore nel salvataggio della foto'); return; }
      const json = (await res.json()) as { riga?: RigaRisanamento };
      if (json.riga) {
        setRighe((prev) => prev.map((r) => (r.id === rigaId ? json.riga! : r)));
      }
    } catch {
      setErrore('Errore di rete nel salvataggio della foto');
    }
  };

  const salvaFotoVoce = async (chiave: string, path: string | null) => {
    if (!path) { setErrore('Upload foto fallito'); return; }
    if (!civicoApertoId) return;
    setErrore(null);
    try {
      const res = await fetch(`/api/r/${token}/voce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, risposte: { [chiave]: path } }),
      });
      if (!res.ok) { setErrore('Errore nel salvataggio della foto'); return; }
      setVociRisposte((prev) => ({
        ...prev,
        [civicoApertoId]: { ...(prev[civicoApertoId] ?? {}), [chiave]: path },
      }));
    } catch {
      setErrore('Errore di rete nel salvataggio della foto');
    }
  };

  const aggiungiRiga = async () => {
    if (!mat.trim() || !civicoApertoId || aggiungendoRiga) return;
    setErrore(null);
    setAggiungendoRiga(true);
    try {
      const res = await fetch(`/api/r/${token}/riga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, matricola: mat.trim(), pdr: pdr.trim() || null, nominativo: nom.trim() || null }),
      });
      if (!res.ok) { setErrore('Errore nell\'aggiunta del misuratore'); return; }
      const json = (await res.json()) as { riga?: RigaRisanamento };
      if (json.riga) {
        setRighe((prev) => [...prev, json.riga!]);
        setMat('');
        setPdr('');
        setNom('');
      }
    } catch {
      setErrore('Errore di rete nell\'aggiunta del misuratore');
    } finally {
      setAggiungendoRiga(false);
    }
  };

  const attivaAccessoria = (chiave: string) => {
    setAccessorieAttive((prev) => new Set([...prev, chiave]));
  };

  /* ── Vista lista civici ─────────────────────────────────────────────────── */

  if (civicoApertoId === null) {
    return (
      <div className="flex h-dvh flex-col">
        {/* Header */}
        <div className="shrink-0 border-b border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4">
          <div className="text-base font-bold text-[var(--brand-text-main)]">{rapportino.staff_name}</div>
          <div className="text-sm text-[var(--brand-text-muted)]">{formatData(rapportino.data)}</div>
        </div>

        {/* Lista civici */}
        <div className="flex-1 space-y-2.5 overflow-y-auto px-3 pb-6 pt-3">
          {voci.length === 0 ? (
            <p className="mt-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun civico assegnato.</p>
          ) : (
            voci.map((voce, idx) => {
              const nMisuratori = righe.filter((r) => r.voce_id === voce.id).length;
              const titolo = [voce.via, (voce as Voce & { civico?: string }).civico].filter(Boolean).join(' ');
              return (
                <button
                  key={voce.id}
                  type="button"
                  onClick={() => { setCivicoApertoId(voce.id); setErrore(null); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-left transition active:border-[var(--brand-primary)]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-sm font-bold text-[var(--brand-primary)]">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-[var(--brand-text-main)]">
                      {titolo || voce.nominativo || `Civico ${idx + 1}`}
                    </span>
                    <span className="block truncate text-[12.5px] text-[var(--brand-text-muted)]">{voce.comune ?? ''}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--brand-surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--brand-text-subtle)]">
                    {nMisuratori} misuratori
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  /* ── Vista dettaglio civico ─────────────────────────────────────────────── */

  const voce = voci.find((v) => v.id === civicoApertoId);
  if (civicoApertoId !== null && !voce) return null;
  // voce is defined here: the guard above returns null when voce is undefined
  const voceDefinita = voce!;

  const righeCivico = righe.filter((r) => r.voce_id === civicoApertoId).sort((a, b) => a.ordine - b.ordine);
  const risposteVoce = vociRisposte[civicoApertoId] ?? {};
  const titoloCivico = [voceDefinita.via, (voceDefinita as Voce & { civico?: string }).civico].filter(Boolean).join(' ') || voceDefinita.nominativo || 'Civico';

  return (
    <div className="flex h-dvh flex-col">
      {/* Header dettaglio */}
      <div className="shrink-0 border-b border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3">
        <button
          type="button"
          onClick={() => { setCivicoApertoId(null); setErrore(null); }}
          className="mb-1 flex items-center gap-1 text-sm font-semibold text-[var(--brand-primary)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Civici
        </button>
        <div className="text-base font-bold text-[var(--brand-text-main)]">{titoloCivico}</div>
        <div className="text-sm text-[var(--brand-text-muted)]">{voceDefinita.comune ?? ''}</div>
      </div>

      {/* Corpo scrollabile */}
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-8 pt-3">
        {/* Errore inline */}
        {errore && (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
            {errore}
          </div>
        )}

        {/* ── Sezione 1: Misuratori ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--brand-text-subtle)]">Misuratori</h2>

          {righeCivico.length === 0 && (
            <p className="mb-3 text-sm text-[var(--brand-text-muted)]">Nessun misuratore ancora aggiunto.</p>
          )}

          {righeCivico.map((riga) => (
            <div key={riga.id} className="mb-4 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
              <div className="mb-2 text-sm font-semibold text-[var(--brand-text-main)]">
                {riga.matricola && <span className="mr-2">Matricola: {riga.matricola}</span>}
                {riga.nominativo && <span className="text-[var(--brand-text-muted)]">{riga.nominativo}</span>}
              </div>
              <div className="space-y-2">
                {scope.misuratore.map((campo) => (
                  <SlotFoto
                    key={campo.chiave}
                    token={token}
                    etichetta={campo.etichetta}
                    obbligatoria={campo.obbligatoria}
                    valore={(riga.risposte?.[campo.chiave] as string | null | undefined) ?? null}
                    disabilitato={readOnly}
                    onUploaded={(path) => { void salvaFotoRiga(riga.id, campo.chiave, path); }}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Form aggiungi misuratore */}
          {!readOnly && (
            <div className="mt-3 space-y-2 rounded-xl border border-dashed border-[var(--brand-border)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Aggiungi misuratore</div>
              <input
                type="text"
                placeholder="Matricola *"
                aria-label="Matricola"
                value={mat}
                onChange={(e) => { setMat(e.target.value); setErrore(null); }}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              <input
                type="text"
                placeholder="PDR (facoltativo)"
                aria-label="PDR"
                value={pdr}
                onChange={(e) => { setPdr(e.target.value); }}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              <input
                type="text"
                placeholder="Nominativo (facoltativo)"
                aria-label="Nominativo"
                value={nom}
                onChange={(e) => { setNom(e.target.value); }}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => { void aggiungiRiga(); }}
                disabled={aggiungendoRiga}
                className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
              >
                + Aggiungi misuratore
              </button>
            </div>
          )}
        </div>

        {/* ── Sezione 2: Fasi ───────────────────────────────────────────────── */}
        {scope.fase.length > 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--brand-text-subtle)]">Fasi</h2>
            <div className="space-y-2">
              {scope.fase.map((campo) => (
                <SlotFoto
                  key={campo.chiave}
                  token={token}
                  etichetta={campo.etichetta}
                  obbligatoria={campo.obbligatoria}
                  valore={(risposteVoce[campo.chiave] as string | null | undefined) ?? null}
                  disabilitato={readOnly}
                  onUploaded={(path) => { void salvaFotoVoce(campo.chiave, path); }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Sezione 3: Accessorie ─────────────────────────────────────────── */}
        {scope.accessoria.length > 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--brand-text-subtle)]">Accessorie</h2>
            <div className="space-y-2">
              {scope.accessoria.map((campo) => {
                const attiva = accessorieAttive.has(campo.chiave) || Boolean(risposteVoce[campo.chiave]);
                if (attiva) {
                  return (
                    <SlotFoto
                      key={campo.chiave}
                      token={token}
                      etichetta={campo.etichetta}
                      obbligatoria={campo.obbligatoria}
                      valore={(risposteVoce[campo.chiave] as string | null | undefined) ?? null}
                      disabilitato={readOnly}
                      onUploaded={(path) => { void salvaFotoVoce(campo.chiave, path); }}
                    />
                  );
                }
                if (readOnly) return null;
                return (
                  <button
                    key={campo.chiave}
                    type="button"
                    onClick={() => attivaAccessoria(campo.chiave)}
                    className="w-full rounded-xl border border-dashed border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                  >
                    + {campo.etichetta}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
