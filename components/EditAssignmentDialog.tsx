'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import type { Assignment, Staff, Activity, Territory } from '@/types';

export default function EditAssignmentDialog({
  assignment, staffList, actList, terrList, excludeStaffIds = [], onClose, onSaved
}:{
  assignment: Assignment;
  staffList: Staff[]; actList: Activity[]; terrList: Territory[];
  excludeStaffIds?: string[];
  onClose: () => void;
  onSaved: (row: Assignment, close?: boolean) => void;
}) {
  const sb = supabaseBrowser();

  // liste ordinate
  const staffSorted = useMemo(
    () => [...(staffList||[])].sort((a,b)=>a.display_name.localeCompare(b.display_name,'it',{sensitivity:'base'})),
    [staffList]
  );
  const actSorted = useMemo(
    () => [...(actList||[])].sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'})),
    [actList]
  );
  const terrSorted = useMemo(
    () => [...(terrList||[])].sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'})),
    [terrList]
  );

  // filtra disponibili ma include l’attuale
  const currentId = assignment?.staff?.id ?? '';
  const excludeSet = useMemo(()=> new Set(excludeStaffIds ?? []), [excludeStaffIds]);
  const availableStaff = useMemo(
    () => (staffSorted ?? []).filter(s => s.id === currentId || !excludeSet.has(s.id)),
    [staffSorted, currentId, excludeSet]
  );

  // state
  const [staffId, setStaffId] = useState<string>(assignment?.staff?.id ?? '');
  const [actId, setActId]     = useState<string>(assignment?.activity?.id ?? '');
  const [terrId, setTerrId]   = useState<string>(assignment?.territory?.id ?? '');
  const [rep, setRep]         = useState<boolean>(!!assignment?.reperibile);
  const [notes, setNotes]     = useState<string>(assignment?.notes ?? '');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string|undefined>();

  useEffect(()=>{ setErr(undefined); }, [staffId, actId, terrId, rep, notes]);
  useEffect(()=>{
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return ()=>{ document.body.style.overflow = prev; };
  }, []);

  const canSave = !!staffId && !saving;

  // SALVATAGGIO OTTIMISTICO
  async function save() {
    if (!canSave) return;
    setSaving(true); setErr(undefined);

    const optimistic: Assignment = {
      id: assignment.id,
      day_id: assignment.day_id,
      reperibile: rep,
      notes: notes || null,
      staff: staffId
        ? { id: staffId, display_name: staffList.find(s=>s.id===staffId)?.display_name ?? '' }
        : null,
      activity: actId
        ? { id: actId, name: actList.find(a=>a.id===actId)?.name ?? '' }
        : null,
      territory: terrId
        ? { id: terrId, name: terrList.find(t=>t.id===terrId)?.name ?? '' }
        : null,
    };

    // aggiorna UI e chiudi subito
    onSaved(optimistic, true);
    onClose();

    // update DB in background
    const { error } = await sb.from('assignments').update({
      staff_id:     staffId || null,
      activity_id:  actId   || null,
      territory_id: terrId  || null,
      reperibile:   rep,
      notes:        notes || null,
      updated_at:   new Date().toISOString(),
    }).eq('id', assignment.id);

    if (error) console.error('Update assignment failed:', error.message);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border bg-white shadow-xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm text-gray-500">Modifica assegnazione</div>
          <div className="text-base font-semibold">ID: {assignment.id.slice(0,8)}…</div>
        </div>

        <form
          onSubmit={(e)=>{ e.preventDefault(); if (canSave) save(); }}
          onKeyDown={(e)=>{
            if ((e.key==='s'||e.key==='S') && (e.ctrlKey||e.metaKey)) { e.preventDefault(); if (canSave) save(); }
          }}
          className="p-4 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Operatore *</span>
              <select
                name="staff"
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={staffId}
                onChange={(e)=>setStaffId(e.target.value)}
                autoFocus
              >
                <option value="">— Seleziona —</option>
                {availableStaff.length===0 && <option value="">— Nessun operatore disponibile —</option>}
                {availableStaff.map(s=>(
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Attività</span>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={actId}
                onChange={(e)=>setActId(e.target.value)}
              >
                <option value="">— Nessuna —</option>
                {actSorted.map(a=>(
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Territorio</span>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={terrId}
                onChange={(e)=>setTerrId(e.target.value)}
              >
                <option value="">— Nessuno —</option>
                {terrSorted.map(t=>(
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm flex items-center gap-2 mt-6 md:mt-0">
              <input type="checkbox" className="h-4 w-4" checked={rep} onChange={(e)=>setRep(e.target.checked)} />
              <span>Reperibile</span>
            </label>
          </div>

          <label className="text-sm block">
            <span className="block text-gray-600 mb-1">Note</span>
            <input
              className="w-full border rounded-lg px-3 py-2 bg-white"
              value={notes}
              onChange={(e)=>setNotes(e.target.value)}
              placeholder="Opzionale"
            />
          </label>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="px-0 pt-3 border-t flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50" disabled={saving}>
              Annulla
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className={`px-4 py-1.5 rounded-lg text-white ${canSave ? 'bg-gray-900 hover:bg-black' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              {saving ? 'Salvo…' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
