'use client';
import { useState, useMemo, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { isTerritoryValidOnDay } from '@/lib/territories';
import type { Assignment, Staff, Activity, Territory } from '@/types';
import { resolveCostCenter, type CostCenterRange } from '@/lib/costCenter';

export default function EditAssignmentDialog({
  assignment,
  iso,
  staffList,
  actList,
  terrList,
  costCenterRangesByStaff,
  onClose,
  onSaved,
  onDeleted,
}: {
  assignment: Assignment;
  iso: string;
  staffList: Staff[];
  actList: Activity[];
  terrList: Territory[];
  costCenterRangesByStaff: Record<string, CostCenterRange[]>;
  onClose: () => void;
  onSaved: (updated: Assignment, close?: boolean) => void;
  onDeleted: (a: Assignment) => void;
}) {
  const sb = supabaseBrowser();

  // stato form
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  const [staffId, setStaffId] = useState<string>(assignment?.staff?.id ?? '');
  const [actId, setActId] = useState<string>(assignment?.activity?.id ?? '');
  const [terrId, setTerrId] = useState<string>(assignment?.territory?.id ?? '');
  const [rep, setRep] = useState<boolean>(!!assignment?.reperibile);
  const [notes, setNotes] = useState<string>(assignment?.notes ?? '');

  useEffect(() => { setErr(undefined); }, [staffId, actId, terrId, rep, notes]);
  useEffect(() => {
    const p = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = p; };
  }, []);

  // liste ordinate
  const staffSorted = useMemo(
    () => [...(staffList || [])].sort((a, b) => a.display_name.localeCompare(b.display_name, 'it', { sensitivity: 'base' })),
    [staffList]
  );
  const actSorted = useMemo(
    () => [...(actList || [])].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })),
    [actList]
  );
  const todayIso = useMemo(
    () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }),
    []
  );
  const terrSorted = useMemo(() => {
    const available = terrList.filter((territory) =>
      isTerritoryValidOnDay(territory, iso, todayIso)
    );
    const selected = terrList.find((territory) => territory.id === terrId);
    if (selected && !available.some((territory) => territory.id === terrId)) {
      available.push(selected);
    }
    return available.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
  }, [iso, terrId, terrList, todayIso]);

  const canSave = !!staffId && !saving;

  // SAVE
  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(undefined);

    const def = staffList.find((s) => s.id === staffId)?.cost_center ?? null;
    const ranges = costCenterRangesByStaff[staffId] ?? [];
    const cc = resolveCostCenter(def, ranges, iso);

    if (terrId) {
      const selectedTerritory = terrList.find((territory) => territory.id === terrId);
      if (!selectedTerritory) {
        setErr('Territorio selezionato non disponibile.');
        setSaving(false);
        return;
      }

      if (!isTerritoryValidOnDay(selectedTerritory, iso, todayIso)) {
        setErr(`Il territorio ${selectedTerritory.name} non e valido per il ${iso}.`);
        setSaving(false);
        return;
      }
    }

    const { data, error } = await sb
      .from('assignments')
      .update({
        day_id: assignment.day_id,
        staff_id: staffId || null,
        activity_id: actId || null,
        territory_id: terrId || null,
        cost_center: cc,
        reperibile: rep,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignment.id)
      .select(`
        id, day_id, reperibile, notes, cost_center,
        staff:staff_id ( id, display_name ),
        territory:territory_id ( id, name ),
        activity:activity_id ( id, name )
      `)
      .maybeSingle();

    if (error || !data) {
      setErr(error?.message ?? 'Salvataggio non applicato');
      setSaving(false);
      return;
    }

    onSaved(data as unknown as Assignment, true);
    setSaving(false);
    onClose();
  }

  // DELETE
  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    const { error } = await sb.rpc('delete_assignment', { p_id: assignment.id });
    setBusy(false);
    if (!error) onDeleted(assignment);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[oklch(0_0_0/0.6)]" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-xl">
        <div className="px-4 py-3 border-b border-[var(--brand-border)] flex items-center justify-between">
          <div className="text-sm text-[var(--brand-text-muted)]">Modifica assegnazione</div>
          <div className="text-base font-semibold">ID: {assignment.id.slice(0, 8)}…</div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (canSave) save(); }}
          onKeyDown={(e) => {
            if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (canSave) save();
            }
          }}
          className="p-4 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-[var(--brand-text-muted)] mb-1">Operatore *</span>
              <select
                className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                autoFocus
              >
                <option value="">— Seleziona —</option>
                {staffSorted.map((s) => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-[var(--brand-text-muted)] mb-1">Attività</span>
              <select
                className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                value={actId}
                onChange={(e) => setActId(e.target.value)}
              >
                <option value="">— Nessuna —</option>
                {actSorted.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-[var(--brand-text-muted)] mb-1">Territorio</span>
              <select
                className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                value={terrId}
                onChange={(e) => setTerrId(e.target.value)}
              >
                <option value="">— Nessuno —</option>
                {terrSorted.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm flex items-center gap-2 mt-6 md:mt-0">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={rep}
                onChange={(e) => setRep(e.target.checked)}
              />
              <span>Reperibile</span>
            </label>
          </div>

          <label className="text-sm block">
            <span className="block text-[var(--brand-text-muted)] mb-1">Note</span>
            <input
              className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opzionale"
            />
          </label>

          {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

          <div className="px-0 pt-3 border-t border-[var(--brand-border)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] hover:bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]"
              disabled={saving || busy}
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] hover:bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]"
            >
              Elimina
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
