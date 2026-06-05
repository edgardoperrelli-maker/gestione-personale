'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RapportinoStato } from '@/utils/rapportini/links';
import { type RapRiepilogo } from '@/utils/rapportini/groupByDay';
import { groupByDayTerritory } from '@/utils/rapportini/groupByDayTerritory';
import { filtraRapportini, type FiltriRiepilogo as Filtri } from '@/utils/rapportini/filtraRapportini';
import FiltriRiepilogo from './riepilogo/FiltriRiepilogo';
import CardTerritorio from './riepilogo/CardTerritorio';
import { PERIODI, calcolaRange } from '@/utils/rapportini/rangePeriodo';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export default function RiepilogoRapportini() {
  const [raps, setRaps] = useState<RapRiepilogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('30');
  const [dataDa, setDataDa] = useState('');
  const [dataA, setDataA] = useState('');
  const [filtri, setFiltri] = useState<Filtri>({ territorio: '', operatore: '', stati: [], q: '' });
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmPiano, setConfirmPiano] = useState<string | null>(null);
  const [confirmOp, setConfirmOp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const range = calcolaRange(periodo, { dataDa, dataA }, oggi);
    if (!range) return; // custom incompleto/invertito: non ricaricare, mantieni i risultati
    setLoading(true);
    try {
      const res = await fetch(`/api/mappa/rapportini/riepilogo?from=${range.from}&to=${range.to}`);
      const data = await res.json();
      setRaps(Array.isArray(data) ? (data as RapRiepilogo[]) : []);
    } catch {
      setRaps([]);
    } finally {
      setLoading(false);
    }
  }, [periodo, dataDa, dataA]);

  useEffect(() => { carica(); }, [carica]);

  const territori = useMemo(
    () => [...new Set(raps.map((r) => (r.territorio ?? '').trim()).filter(Boolean))].sort(),
    [raps],
  );
  const operatori = useMemo(() => {
    const m = new Map<string, string>();
    raps.forEach((r) => { if (r.staff_name) m.set(r.staff_id, r.staff_name); });
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [raps]);

  const giorni = useMemo(() => groupByDayTerritory(filtraRapportini(raps, filtri)), [raps, filtri]);

  const copia = async (r: RapportinoStato & { url: string; token: string }) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiedToken(r.token);
      setTimeout(() => setCopiedToken((t) => (t === r.token ? null : t)), 1800);
    } catch { /* noop */ }
  };
  const eliminaPiano = async (pianoId: string) => {
    setBusy(true);
    try { await fetch(`/api/mappa/piani?id=${pianoId}`, { method: 'DELETE' }); await carica(); }
    finally { setBusy(false); setConfirmPiano(null); }
  };
  const rimuoviOperatore = async (pianoId: string, staffId: string) => {
    setBusy(true);
    try { await fetch(`/api/mappa/piani/operatore?pianoId=${pianoId}&staffId=${encodeURIComponent(staffId)}`, { method: 'DELETE' }); await carica(); }
    finally { setBusy(false); setConfirmOp(null); }
  };

  const riapriRapportino = async (rapportinoId: string) => {
    setBusy(true);
    try {
      await fetch('/api/admin/rapportini/riapri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapportinoId }),
      });
      await carica();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Riepilogo rapportini</h2>
        <a href="/hub/rapportini/eseguiti" className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-90">📋 Tutti gli interventi eseguiti</a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
          value={periodo}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom' && !dataDa && !dataA) {
              const oggi = new Date().toISOString().slice(0, 10);
              const r = calcolaRange(periodo, { dataDa: '', dataA: '' }, oggi);
              if (r) { setDataDa(r.from); setDataA(r.to); }
            }
            setPeriodo(v);
          }}
        >
          {PERIODI.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
          <option value="custom">Personalizzato…</option>
        </select>
        {periodo === 'custom' && (
          <>
            <input
              type="date"
              aria-label="Dal"
              className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
              value={dataDa}
              max={dataA || undefined}
              onChange={(e) => setDataDa(e.target.value)}
            />
            <span className="text-xs text-[var(--brand-text-muted)]">→</span>
            <input
              type="date"
              aria-label="Al"
              className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
              value={dataA}
              min={dataDa || undefined}
              onChange={(e) => setDataA(e.target.value)}
            />
          </>
        )}
        <FiltriRiepilogo filtri={filtri} setFiltri={setFiltri} territori={territori} operatori={operatori} />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--brand-text-muted)]">Caricamento riepilogo...</div>
      ) : giorni.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun rapportino per i filtri selezionati.
        </div>
      ) : (
        giorni.map((g) => (
          <div key={g.data} className="space-y-3">
            <h3 className="text-sm font-semibold capitalize text-[var(--brand-text-main)]">{fmtData(g.data)}</h3>
            {g.territori.map((terr) => (
              <CardTerritorio
                key={`${g.data}-${terr.chiave}`}
                terr={terr}
                dataLabel={fmtData(g.data)}
                copiedToken={copiedToken}
                onCopia={copia}
                onRiapri={(pianoId) => `/hub/mappa?vista=pianifica&pianoId=${pianoId}`}
                onEliminaPiano={eliminaPiano}
                onRimuoviOp={rimuoviOperatore}
                onRiapriRapportino={riapriRapportino}
                confirmPiano={confirmPiano}
                setConfirmPiano={setConfirmPiano}
                confirmOp={confirmOp}
                setConfirmOp={setConfirmOp}
                busy={busy}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
