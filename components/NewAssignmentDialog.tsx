'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import type { Assignment, Staff, Activity, Territory } from '@/types';

export default function NewAssignmentDialog({
  dayId, iso, staffList, actList, terrList, onClose, onCreated
}:{
  dayId: string; iso: string;
  staffList: Staff[]; actList: Activity[]; terrList: Territory[];
  onClose: () => void;
  onCreated: (row: Assignment, close?: boolean) => void;
}) {
  const sb = supabaseBrowser();

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

  const [staffId, setStaffId]         = useState<string>('');
  const [activityId, setActivityId]   = useState<string>('');
  const [territoryId, setTerritoryId] = useState<string>('');
  const [reperibile, setReperibile]   = useState<boolean>(false);
  const [notes, setNotes]             = useState<string>('');
  const [err, setErr]                 = useState<string | undefined>();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => { setErr(undefined); }, [staffId, activityId, territoryId, reperibile, notes]);

  const canSave = !!staffId;

  // SALVA con chiusura immediata
  async function save() {
    if (!canSave) return;
    setErr(undefined);

    // chiudi subito la modale
    onClose();

    // insert in background
    const ins = await sb
      .from('assignments')
      .insert({
        day_id:      dayId,
        staff_id:    staffId || null,
        activity_id: activityId || null,
        territory_id:territoryId || null,
        reperibile,
        notes:       notes || null,
      })
      .select('id, day_id')
      .single();

    if (ins.error || !ins.data) {
      console.error('Insert assignment failed:', ins.error?.message);
      return;
    }

    // costruisci oggetto per il parent usando le liste già caricate
    const normalized: Assignment = {
      id: ins.data.id,
      day_id: ins.data.day_id,
      reperibile,
      notes: notes || null,
      staff: staffId
        ? { id: staffId, display_name: staffList.find(s => s.id === staffId)?.display_name ?? '' }
        : null,
      activity: activityId
        ? { id: activityId, name: actList.find(a => a.id === activityId)?.name ?? '' }
        : null,
      territory: territoryId
        ? { id: territoryId, name: terrList.find(t => t.id === territoryId)?.name ?? '' }
        : null,
    };

    onCreated(normalized, true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border bg-white shadow-xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm text-gray-500">Nuova assegnazione</div>
          <div className="text-base font-semibold">{iso}</div>
        </div>

        <form
          onSubmit={(e)=>{ e.preventDefault(); if (canSave) save(); }}
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
                {staffSorted.map(s=>(
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Attività</span>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={activityId}
                onChange={(e)=>setActivityId(e.target.value)}
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
                value={territoryId}
                onChange={(e)=>setTerritoryId(e.target.value)}
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
              />
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
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className={`px-4 py-1.5 rounded-lg text-white ${canSave ? 'bg-gray-900 hover:bg-black' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
