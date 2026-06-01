'use client';
import { useMemo, useState } from 'react';
import type { ManualRule } from '@/utils/routing/manualAssignments';
import type { Task } from '@/utils/routing/types';

export type OperatorLite = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  operators: OperatorLite[];
  tasks: Task[];
  rules: ManualRule[];
  locks: Record<string, boolean>;
  onChangeRules: (rules: ManualRule[]) => void;
  onChangeLocks: (locks: Record<string, boolean>) => void;
  onDistribute: () => void;
};

const C = {
  primary: 'var(--brand-primary)', magenta: 'var(--brand-magenta)',
  navy: 'oklch(0.21 0.07 250)', border: 'var(--brand-border)',
};

export default function ManualAssignmentsModal(p: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

  const capValues = useMemo(
    () => Array.from(new Set(p.tasks.map((t) => (t.cap ?? '').trim()).filter(Boolean))).sort(),
    [p.tasks],
  );
  const attValues = useMemo(
    () => Array.from(new Set(p.tasks.map((t) => (t.attivita ?? '').trim()).filter(Boolean))).sort(),
    [p.tasks],
  );

  if (!p.open) return null;

  const pinnedStaffIds = new Set(p.rules.map((r) => r.staffId));

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{ background: 'linear-gradient(rgba(8,16,32,.42),rgba(8,16,32,.42)), radial-gradient(circle at top left, oklch(0.78 0.13 215/.30), transparent 42%), radial-gradient(circle at top right, oklch(0.66 0.22 350/.22), transparent 44%), linear-gradient(180deg, oklch(0.22 0.06 250), oklch(0.13 0.05 250))' }}>
      <div className="flex h-[min(840px,93vh)] w-[min(1280px,95vw)] flex-col overflow-hidden rounded-[28px] bg-[var(--brand-surface)]"
        style={{ color: 'var(--brand-text-main)', border: `1px solid color-mix(in oklch, ${C.primary} 35%, transparent)`, boxShadow: '0 28px 90px -36px rgba(6,18,40,.7)', fontFamily: 'Geist, Inter, system-ui, sans-serif' }}>
        <div className="flex items-center justify-between border-b px-7 py-5" style={{ borderColor: C.border }}>
          <div>
            <div className="flex items-center gap-2 text-[19px] font-semibold">
              <span style={{ color: C.primary }}>📌</span> Assegnazioni manuali
            </div>
            <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--brand-text-muted)' }}>
              {p.rules.length} regole · {pinnedStaffIds.size} operatori pinnati
            </div>
          </div>
          <button onClick={p.onClose} className="h-9 w-9 rounded-xl border" style={{ borderColor: C.border }}>✕</button>
        </div>

        <div className="flex-1 overflow-auto px-7 py-6">
          <button onClick={() => setWizardOpen(true)}
            className="mb-4 rounded-2xl px-5 py-3 font-semibold"
            style={{ background: C.primary, color: 'oklch(0.16 0.06 245)', boxShadow: '0 0 16px oklch(0.78 0.13 215/.45)' }}>
            ＋ Nuova regola
          </button>

          <div className="space-y-3">
            {p.rules.map((r) => {
              const op = p.operators.find((o) => o.id === r.staffId);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-2xl border p-4" style={{ borderColor: C.border }}>
                  <div>
                    <div className="font-semibold">{op?.name ?? r.staffId}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[12px]">
                      {r.filtroOds.length > 0 && <span>🎯 {r.filtroOds.length} ODS</span>}
                      {r.filtroIndirizzo.length > 0 && <span>🏠 {r.filtroIndirizzo.length} indirizzo</span>}
                      {r.filtroCap.length > 0 && <span>📍 {r.filtroCap.join(', ')}</span>}
                      {r.filtroAttivita.length > 0 && <span>🔧 {r.filtroAttivita.join(', ')}</span>}
                      <span>{r.maxInterventi == null ? 'illimitato' : `max ${r.maxInterventi}`}</span>
                    </div>
                  </div>
                  <button onClick={() => p.onChangeRules(p.rules.filter((x) => x.id !== r.id))}
                    className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: C.border }}>Elimina</button>
                </div>
              );
            })}
          </div>

          <h3 className="mt-6 mb-2 text-[15px] font-semibold">Operatori · lucchetto</h3>
          <div className="space-y-2">
            {p.operators.map((o) => {
              const aperto = p.locks[o.id] !== false;
              const pinned = pinnedStaffIds.has(o.id);
              return (
                <div key={o.id} className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: C.border, opacity: pinned ? 1 : 0.6 }}>
                  <span className="text-[13.5px] font-semibold">{o.name}{pinned ? '' : ' · automatico'}</span>
                  {pinned && (
                    <button onClick={() => p.onChangeLocks({ ...p.locks, [o.id]: !aperto })}
                      className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                      style={aperto
                        ? { background: 'oklch(0.74 0.21 145/.16)', color: 'oklch(0.52 0.21 145)' }
                        : { background: 'oklch(0.64 0.25 350/.16)', color: 'oklch(0.54 0.25 350)' }}>
                      {aperto ? '🔓 Aperto' : '🔒 Chiuso'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {wizardOpen && (
            <RuleWizard
              operators={p.operators}
              tasks={p.tasks}
              capValues={capValues}
              attValues={attValues}
              onCancel={() => setWizardOpen(false)}
              onCreate={(rule) => { p.onChangeRules([...p.rules, rule]); setWizardOpen(false); }}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t px-7 py-4" style={{ borderColor: C.border, background: 'var(--brand-surface-muted)' }}>
          <span className="text-[12.5px]" style={{ color: 'var(--brand-text-muted)' }}>{p.rules.length} regole attive</span>
          <div className="flex gap-2.5">
            <button onClick={p.onClose} className="rounded-2xl px-5 py-2.5 text-sm font-semibold" style={{ color: 'var(--brand-text-muted)' }}>Chiudi</button>
            <button onClick={p.onDistribute} className="rounded-2xl px-5 py-2.5 text-sm font-semibold"
              style={{ background: C.primary, color: 'oklch(0.16 0.06 245)', boxShadow: '0 0 16px oklch(0.78 0.13 215/.45)' }}>⚙ Distribuisci</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function chips(s: string): string[] {
  return s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
}

function RuleWizard(props: {
  operators: OperatorLite[]; tasks: Task[]; capValues: string[]; attValues: string[];
  onCancel: () => void; onCreate: (rule: ManualRule) => void;
}) {
  const [staffId, setStaffId] = useState('');
  const [ods, setOds] = useState(''); const [indirizzo, setIndirizzo] = useState('');
  const [cap, setCap] = useState(''); const [att, setAtt] = useState('');
  const [maxX, setMaxX] = useState('');

  const rule: ManualRule = {
    id: crypto.randomUUID(), staffId,
    filtroOds: chips(ods), filtroIndirizzo: chips(indirizzo),
    filtroCap: chips(cap), filtroAttivita: chips(att),
    maxInterventi: maxX.trim() ? Math.max(1, parseInt(maxX, 10) || 1) : null, ordine: 0,
  };
  const valid = staffId && (rule.filtroOds.length || rule.filtroIndirizzo.length || rule.filtroCap.length || rule.filtroAttivita.length);

  return (
    <div className="fixed inset-0 z-[2001] flex items-center justify-center bg-black/40 p-6">
      <div className="w-[min(720px,94vw)] rounded-[24px] bg-[var(--brand-surface)] p-6" style={{ color: 'var(--brand-text-main)', fontFamily: 'Geist, Inter, sans-serif' }}>
        <h3 className="mb-4 text-[16px] font-semibold">Nuova regola</h3>
        <label className="mb-1 block text-[13px] font-semibold">Operatore</label>
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mb-3 w-full rounded-xl border px-3 py-2 text-sm">
          <option value="">— seleziona —</option>
          {props.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label className="mb-1 block text-[13px] font-semibold">🎯 ODS (separati da virgola)</label>
        <input value={ods} onChange={(e) => setOds(e.target.value)} className="mb-3 w-full rounded-xl border px-3 py-2 text-sm" placeholder="ODS-10231, ODS-10244" />
        <label className="mb-1 block text-[13px] font-semibold">🏠 Indirizzo (fallback ODS)</label>
        <input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} className="mb-3 w-full rounded-xl border px-3 py-2 text-sm" placeholder="Via Roma 12, Frascati" />
        <label className="mb-1 block text-[13px] font-semibold">📍 CAP</label>
        <input value={cap} onChange={(e) => setCap(e.target.value)} className="mb-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="00044, 00045" />
        <div className="mb-3 text-[11px] text-[var(--brand-text-muted)]">Dal dataset: {props.capValues.slice(0, 8).join(' · ') || '—'}</div>
        <label className="mb-1 block text-[13px] font-semibold">🔧 Attività</label>
        <input value={att} onChange={(e) => setAtt(e.target.value)} className="mb-1 w-full rounded-xl border px-3 py-2 text-sm" placeholder="S-AI-051" />
        <div className="mb-3 text-[11px] text-[var(--brand-text-muted)]">Dal dataset: {props.attValues.slice(0, 8).join(' · ') || '—'}</div>
        <label className="mb-1 block text-[13px] font-semibold">Tetto X (max interventi, opzionale)</label>
        <input value={maxX} onChange={(e) => setMaxX(e.target.value)} type="number" min={1} className="mb-4 w-40 rounded-xl border px-3 py-2 text-sm" placeholder="30" />
        <div className="flex justify-end gap-2">
          <button onClick={props.onCancel} className="rounded-xl px-4 py-2 text-sm">Annulla</button>
          <button disabled={!valid} onClick={() => props.onCreate(rule)}
            className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'oklch(0.78 0.155 215)', color: 'oklch(0.16 0.06 245)' }}>✓ Crea regola</button>
        </div>
      </div>
    </div>
  );
}
