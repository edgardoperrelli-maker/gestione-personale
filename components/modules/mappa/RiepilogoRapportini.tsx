'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RapportinoStato } from '@/utils/rapportini/links';
import { type RapRiepilogo } from '@/utils/rapportini/groupByDay';
import { groupByDayTerritory } from '@/utils/rapportini/groupByDayTerritory';
import { filtraRapportini, type FiltriRiepilogo as Filtri } from '@/utils/rapportini/filtraRapportini';
import FiltriRiepilogo from './riepilogo/FiltriRiepilogo';
import CardTerritorio from './riepilogo/CardTerritorio';

function fmtData(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

const PERIODI = [
  { k: '7', label: 'Ultimi 7 giorni', giorni: 7 },
  { k: '30', label: 'Ultimi 30 giorni', giorni: 30 },
  { k: '90', label: 'Ultimi 90 giorni', giorni: 90 },
];

export default function RiepilogoRapportini() {
  const [raps, setRaps] = useState<RapRiepilogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('30');
  const [filtri, setFiltri] = useState<Filtri>({ territorio: '', operatore: '', stati: [], q: '' });
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmPiano, setConfirmPiano] = useState<string | null>(null);
  const [confirmOp, setConfirmOp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const giorni = PERIODI.find((p) => p.k === periodo)?.giorni ?? 30;
      const from = new Date(Date.now() - giorni * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const res = await fetch(`/api/mappa/rapportini/riepilogo?from=${from}&to=${to}`);
      const data = await res.json();
      setRaps(Array.isArray(data) ? (data as RapRiepilogo[]) : []);
    } catch {
      setRaps([]);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

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
          onChange={(e) => setPeriodo(e.target.value)}
        >
          {PERIODI.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
        </select>
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
