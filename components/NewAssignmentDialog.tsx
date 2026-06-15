'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { isTerritoryValidOnDay } from '@/lib/territories';
import type { Assignment, Staff, Activity, Territory } from '@/types';
import type { CostCenter } from '@/constants/cost-centers';
import { resolveCostCenter, type CostCenterRange } from '@/lib/costCenter';

export default function NewAssignmentDialog({
  dayId, iso, staffList, actList, terrList, costCenterRangesByStaff, onClose, onCreated
}:{
  dayId: string; iso: string;
  staffList: Staff[]; actList: Activity[]; terrList: Territory[];
  costCenterRangesByStaff: Record<string, CostCenterRange[]>;
  onClose: () => void;
  onCreated: (row: Assignment, close?: boolean) => void;
}) {
  const sb = supabaseBrowser();

  const staffSorted = useMemo(
    () => [...(staffList || [])].sort((a,b)=>a.display_name.localeCompare(b.display_name,'it',{sensitivity:'base'})),
    [staffList]
  );
  const actSorted = useMemo(
    () => [...(actList || [])].sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'})),
    [actList]
  );
  const todayIso = useMemo(
    () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }),
    []
  );

  const [staffId, setStaffId]         = useState<string>('');
  const [activityId, setActivityId]   = useState<string>('');
  const [territoryId, setTerritoryId] = useState<string>('');
  const [reperibile, setReperibile]   = useState<boolean>(false);
const [notes, setNotes]             = useState<string>('');
const [err, setErr]                 = useState<string | undefined>();
const [saving, setSaving]           = useState<boolean>(false);
// --- NUOVO: range di date ---
const [useRange, setUseRange] = useState(false);
const [fromIso, setFromIso] = useState(iso);
const [toIso, setToIso]     = useState(iso);
useEffect(() => {
  setErr(undefined);
}, [staffId, activityId, territoryId, reperibile, notes]);

const canSave = !!staffId && !saving; // unica dichiarazione

  const terrSorted = useMemo(() => {
    const baseIso = useRange ? (fromIso || iso) : iso;
    const available = terrList.filter((territory) =>
      isTerritoryValidOnDay(territory, baseIso, todayIso)
    );

    const selected = terrList.find((territory) => territory.id === territoryId);
    if (selected && !available.some((territory) => territory.id === selected.id)) {
      available.push(selected);
    }

    return available.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  }, [fromIso, iso, terrList, territoryId, todayIso, useRange]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

// DOPO
async function save() {
  if (!canSave) return;
  setSaving(true);
  setErr(undefined);

  // itera date inclusive
  function* iterDays(a: string, b: string) {
    const d1 = new Date(a);
    const d2 = new Date(b);
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
  const isoX = d.toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0,10);
  yield isoX; // YYYY-MM-DD locale
}

  }

  // crea calendar_day se manca
async function ensureDay(isoStr: string): Promise<string | null> {
  if (isoStr === iso) return dayId; // già aperto

  const { data: { user } } = await sb.auth.getUser();
  const res = await fetch('/api/calendar/upsert-day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: undefined,
      day: isoStr,
      note: null,
      user_id: user?.id,
      version: undefined
    })
  });

  // se il giorno esiste già
  if (res.status === 409) {
    const payload = await res.json();
    const cur = payload?.current ?? payload?.row ?? null;
    return cur?.id ?? null;
  }

  if (!res.ok) {
    console.error('upsert-day failed', res.status, await res.text());
    return null;
  }

  const { row } = await res.json();
  return row?.id ?? null;
}


  // inserisce una assignment e normalizza
  async function createOne(targetDayId: string, isoForDay: string): Promise<Assignment | null> {
    const def = staffList.find((s) => s.id === staffId)?.cost_center ?? null;
    const ranges = costCenterRangesByStaff[staffId] ?? [];
    const cc = resolveCostCenter(def, ranges, isoForDay);
const ins = await sb
  .from('assignments')
  .insert({
    day_id:       targetDayId,
    staff_id:     staffId || null,
    activity_id:  activityId || null,
    territory_id: territoryId || null,
    reperibile:   !!reperibile,
    notes:        notes ?? null,
    cost_center:  cc,
  })
  .select('id, day_id')
  .single();

if (ins.error || !ins.data) {
  // LOG DETTAGLIATO
  console.error('[assignments.insert]', ins);
  // Mostra messaggio utile nell’UI
  const e = ins.error;
  setErr(e?.message || e?.hint || e?.details || JSON.stringify(e));
  return null;
}



    return {
      id: ins.data.id,
      day_id: ins.data.day_id,
      reperibile: !!reperibile,
      notes: notes ?? null,
      cost_center: cc as CostCenter | null,

      staff: staffId ? { id: staffId, display_name: staffList.find(s => s.id === staffId)?.display_name ?? '' } : null,
      activity: activityId ? { id: activityId, name: actList.find(a => a.id === activityId)?.name ?? '' } : null,
      territory: territoryId ? { id: territoryId, name: terrList.find(t => t.id === territoryId)?.name ?? '' } : null,
    };
  }

  // se NON uso range: comportamento identico a prima
  if (!useRange) {
    const row = await createOne(dayId, iso);
    if (!row) { setSaving(false); setErr('Errore nel salvataggio.'); return; }
    onCreated(row, true);
    setSaving(false);
    return;
  }

  // normalizza ordine date
  const a = fromIso <= toIso ? fromIso : toIso;
  const b = toIso >= fromIso ? toIso : fromIso;

  if (territoryId) {
    const selectedTerritory = terrList.find((territory) => territory.id === territoryId);
    if (!selectedTerritory) {
      setSaving(false);
      setErr('Territorio selezionato non disponibile.');
      return;
    }

    const daysToValidate = useRange ? Array.from(iterDays(a, b)) : [iso];
    const invalidDay = daysToValidate.find((isoDay) =>
      !isTerritoryValidOnDay(selectedTerritory, isoDay, todayIso)
    );

    if (invalidDay) {
      setSaving(false);
      setErr(`Il territorio ${selectedTerritory.name} non e valido per il ${invalidDay}.`);
      return;
    }
  }

  let last: Assignment | null = null;
  for (const isoX of iterDays(a, b)) {
    const targetDayId = await ensureDay(isoX);
    if (!targetDayId) continue;
    const row = await createOne(targetDayId, isoX);
    if (!row) continue;
    const rowWithIso = row as Assignment & { __iso?: string };
    rowWithIso.__iso = isoX;
    last = row;
    onCreated(row, false); // aggiorna la griglia, NON chiudere
  }

  if (!last) { setSaving(false); setErr('Nessuna assegnazione creata.'); return; }
  onCreated(last, true); // chiudi alla fine
  setSaving(false);
}



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[oklch(0_0_0/0.6)]"
        onClick={() => { if (!saving) onClose(); }}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-xl">
        <div className="px-4 py-3 border-b border-[var(--brand-border)] flex items-center justify-between">
          <div className="text-sm text-[var(--brand-text-muted)]">Nuova assegnazione</div>
          <div className="text-base font-semibold">{iso}</div>
        </div>

        <form
          onSubmit={(e)=>{ e.preventDefault(); if (canSave) save(); }}
          className="p-4 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
<label className="text-sm">
  <span className="block text-[var(--brand-text-muted)] mb-1">Operatore *</span>
  <select
    className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
    value={staffId}
    onChange={(e)=>setStaffId(e.target.value)}
    disabled={saving}
    autoFocus
  >
    <option value="">— Seleziona —</option>
    {staffSorted.map(s=>(
      <option key={s.id} value={s.id}>{s.display_name}</option>
    ))}
  </select>
</label>

            <label className="text-sm">
              <span className="block text-[var(--brand-text-muted)] mb-1">Attività</span>
              <select
                className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                value={activityId}
                onChange={(e)=>setActivityId(e.target.value)}
                disabled={saving}
              >
                <option value="">— Nessuna —</option>
                {actSorted.map(a=>(
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-[var(--brand-text-muted)] mb-1">Territorio</span>
              <select
                className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                value={territoryId}
                onChange={(e)=>setTerritoryId(e.target.value)}
                disabled={saving}
              >
                <option value="">— Nessuno —</option>
                {terrSorted.map(t=>(
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm flex items-center gap-2 mt-6 md:mt-0">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={reperibile}
                onChange={(e)=>setReperibile(e.target.checked)}
                disabled={saving}
              />
              <span>Reperibile</span>
            </label>
          </div>

          <label className="text-sm block">
            <span className="block text-[var(--brand-text-muted)] mb-1">Note</span>
            <input
              className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)]"
              value={notes}
              onChange={(e)=>setNotes(e.target.value)}
              placeholder="Opzionale"
              disabled={saving}
            />
          </label>

          {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

{/* --- NUOVO: più giorni (da/a) --- */}
<div className="mt-2 rounded-lg border border-[var(--brand-border)] p-3 bg-[var(--brand-surface-muted)] space-y-2">
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={useRange} onChange={e=>setUseRange(e.target.checked)} />
    <span>Inserisci su più giorni (da / a)</span>
  </label>

  <div className="grid grid-cols-2 gap-3">
    <label className="text-sm">
      <span className="block text-[var(--brand-text-muted)] mb-1">Dal</span>
      <input
        type="date"
        className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
        value={fromIso}
        onChange={e=>setFromIso(e.target.value)}
        disabled={!useRange}
      />
    </label>
    <label className="text-sm">
      <span className="block text-[var(--brand-text-muted)] mb-1">Al</span>
      <input
        type="date"
        className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
        value={toIso}
        onChange={e=>setToIso(e.target.value)}
        disabled={!useRange}
      />
    </label>
  </div>
</div>

<div className="px-0 pt-3 border-t border-[var(--brand-border)] flex items-center justify-end gap-2">

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] hover:bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]"
              disabled={saving}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className={`px-4 py-1.5 rounded-lg text-[oklch(0.16_0.06_245)] ${canSave ? 'bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)]' : 'bg-[var(--brand-text-subtle)] cursor-not-allowed'}`}
            >
              {saving ? 'Salvo…' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
