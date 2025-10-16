// components/NewNewAssignmentDialog.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

type Staff = { id:string; display_name:string; active:boolean };
type Activity = { id:string; name:string; active:boolean };
type Territory = { id:string; name:string; active:boolean };

type Assignment = {
  id:string;
  day_id:string;
  reperibile:boolean;
  notes:string|null;
  staff:{ id:string; display_name:string }|null;
  activity:{ id:string; name:string }|null;
  territory:{ id:string; name:string }|null;
};

export default function NewNewAssignmentDialog(props:{
  dayId: string;
  iso: string; // yyyy-mm-dd
  staffList: Staff[];
  actList: Activity[];
  terrList: Territory[];
  onClose: () => void;
  onCreated: (row: Assignment) => void;
}) {
  const { dayId, iso, staffList, actList, terrList, onClose, onCreated } = props;
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

  const [staffId, setStaffId] = useState<string>('');
  const [actId, setActId] = useState<string>('');
  const [terrId, setTerrId] = useState<string>('');
  const [rep, setRep] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|undefined>();

  useEffect(()=>{ setErr(undefined); }, [staffId, actId, terrId, rep, notes]);

  const canSave = !!staffId && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setErr(undefined);

    const { data, error } = await sb
      .from('assignments')
      .insert({
        day_id: dayId,
        staff_id: staffId,
        activity_id: actId || null,
        territory_id: terrId || null,
        reperibile: rep,
        notes: notes?.trim() || null,
      })
      .select(`
        id, day_id, reperibile, notes,
        staff:staff_id ( id, display_name ),
        activity:activity_id ( id, name ),
        territory:territory_id ( id, name )
      `)
      .single();

    setSaving(false);

    if (error || !data) {
      setErr(error?.message || 'Errore di salvataggio');
      return;
    }

    onCreated(data as unknown as Assignment);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border bg-white shadow-xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm text-gray-500">Nuova assegnazione</div>
          <div className="text-base font-semibold">{new Date(iso).toLocaleDateString('it-IT',{weekday:'long', day:'2-digit', month:'2-digit', year:'numeric'})}</div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Operatore *</span>
              <select
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={staffId}
                onChange={(e)=>setStaffId(e.target.value)}
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
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={rep}
                onChange={(e)=>setRep(e.target.checked)}
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
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
            disabled={saving}
          >
            Annulla
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className={`px-4 py-1.5 rounded-lg text-white ${canSave?'bg-gray-900 hover:bg-black':'bg-gray-400 cursor-not-allowed'}`}
          >
            {saving ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
