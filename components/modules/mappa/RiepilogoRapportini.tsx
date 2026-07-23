'use client';

import { chiediConferma } from '@/components/ui/chiediConferma';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RapportinoStato } from '@/utils/rapportini/links';
import { type RapRiepilogo } from '@/utils/rapportini/groupByDay';
import { groupByDayTerritory } from '@/utils/rapportini/groupByDayTerritory';
import { filtraRapportini, type FiltriRiepilogo as Filtri } from '@/utils/rapportini/filtraRapportini';
import FiltriRiepilogo from './riepilogo/FiltriRiepilogo';
import CardTerritorio from './riepilogo/CardTerritorio';
import IntestazioneGiorno from './riepilogo/IntestazioneGiorno';
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
  const [territoriLista, setTerritoriLista] = useState<Array<{ id: string; name: string }>>([]);
  const [avviso, setAvviso] = useState<string | null>(null);

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

  useEffect(() => {
    let attivo = true;
    fetch('/api/mappa/territori')
      .then((r) => r.json())
      .then((d) => { if (attivo) setTerritoriLista(Array.isArray(d) ? d : []); })
      .catch(() => { if (attivo) setTerritoriLista([]); });
    return () => { attivo = false; };
  }, []);

  const territori = useMemo(
    () => [...new Set(raps.map((r) => (r.territorio ?? '').trim()).filter(Boolean))].sort(),
    [raps],
  );
  const operatori = useMemo(() => {
    const m = new Map<string, string>();
    raps.forEach((r) => { if (r.staff_name) m.set(r.staff_id, r.staff_name); });
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [raps]);

  const oggi = new Date().toISOString().slice(0, 10);
  const giorni = useMemo(() => groupByDayTerritory(filtraRapportini(raps, filtri), oggi), [raps, filtri, oggi]);

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

  const spostaOperatore = async (rapportinoId: string, territorio: string | null) => {
    setBusy(true);
    try {
      await fetch('/api/mappa/rapportini/territorio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapportinoId, territorio }),
      });
      await carica();
    } finally { setBusy(false); }
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

  const scaricaExcel = () => {
    const oggiStr = new Date().toISOString().slice(0, 10);
    const range = calcolaRange(periodo, { dataDa, dataA }, oggiStr);
    if (!range) return;
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (filtri.territorio) p.set('territorio', filtri.territorio);
    if (filtri.operatore) p.set('operatore', filtri.operatore);
    window.open(`/api/admin/rapportini/export-intervalli?${p.toString()}`, '_blank');
  };

  const gestisciSpostamento = async (url: string, body: object) => {
    setBusy(true); setAvviso(null);
    try {
      const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; conflicts?: { staff_name: string | null }[] };
        const conflicts = j.conflicts ?? [];
        if (conflicts.length > 0) {
          const nomi = conflicts.map((c) => c.staff_name ?? 'operatore').join(', ');
          setAvviso(`Spostamento bloccato: ${nomi} già presente in quel territorio/giorno.`);
        } else {
          setAvviso(j.error ?? 'Spostamento non riuscito. Riprova.');
        }
        return;
      }
      await carica();
    } finally { setBusy(false); }
  };

  const onSpostaDataOperatore = async (rapportinoId: string, data: string) => {
    const oggiStr = new Date().toISOString().slice(0, 10);
    if (data < oggiStr && !(await chiediConferma({ title: 'Spostare a una data passata?', message: 'Il link risulterà scaduto in quel giorno (riapribile con 🔒).', confirmLabel: 'Procedi' }))) return;
    void gestisciSpostamento('/api/mappa/rapportini/data', { rapportinoId, data });
  };

  const onSpostaPiano = async (pianoId: string, opts: { data?: string; territorio?: string | null }) => {
    const oggiStr = new Date().toISOString().slice(0, 10);
    if (opts.data && opts.data < oggiStr && !(await chiediConferma({ title: 'Spostare a una data passata?', message: 'Il link risulterà scaduto in quel giorno (riapribile con 🔒).', confirmLabel: 'Procedi' }))) return;
    void gestisciSpostamento('/api/mappa/piani/sposta', { pianoId, ...opts });
  };

  return (
    <div className="space-y-5">
      {avviso && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-2.5 text-sm text-[var(--warning)]">
          {avviso}
          <button type="button" onClick={() => setAvviso(null)} className="ml-3 text-[var(--warning)] opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Riepilogo rapportini</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={scaricaExcel}
            title="Scarica Excel con tutti gli interventi del periodo selezionato"
            className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
          >
            📥 Excel interventi
          </button>
          <a href="/hub/rapportini/eseguiti" className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] hover:opacity-90">📋 Tutti gli interventi eseguiti</a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs"
          value={periodo}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom' && !dataDa && !dataA) {
              const oggiStr = new Date().toISOString().slice(0, 10);
              const r = calcolaRange(periodo, { dataDa: '', dataA: '' }, oggiStr);
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
            <IntestazioneGiorno giorno={g} oggi={oggi} />
            <div className="flex flex-wrap items-start gap-3">
              {g.territori.map((t) => (
                <CardTerritorio
                  key={`${g.data}-${t.chiave}`}
                  terr={t}
                  dataLabel={fmtData(g.data)}
                  copiedToken={copiedToken}
                  onCopia={copia}
                  onRiapriHref={(pianoId) => `/hub/mappa?vista=pianifica&pianoId=${pianoId}`}
                  onRiapriTerritorioHref={(terr) => `/hub/mappa?vista=pianifica&pianoId=${terr.piani[0]?.piano_id ?? ''}&scope=territorio`}
                  onEliminaPiano={eliminaPiano}
                  onRimuoviOp={rimuoviOperatore}
                  onRiapriRapportino={riapriRapportino}
                  confirmPiano={confirmPiano}
                  setConfirmPiano={setConfirmPiano}
                  confirmOp={confirmOp}
                  setConfirmOp={setConfirmOp}
                  busy={busy}
                  territori={territoriLista}
                  onSpostaTerritorioOperatore={spostaOperatore}
                  onSpostaDataOperatore={onSpostaDataOperatore}
                  onSpostaPiano={onSpostaPiano}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
