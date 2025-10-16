'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

type Staff = { id:string; display_name:string; active:boolean };
type Activity = { id:string; name:string; active:boolean };
type Territory = { id:string; name:string; active:boolean };
type Assignment = {
  id:string; day_id:string; reperibile:boolean; notes:string|null;
  staff:{ id:string; display_name:string }|null;
  activity:{ id:string; name:string }|null;
  territory:{ id:string; name:string }|null;
};

export default function EditAssignmentDialog({
  assignment, staffList, actList, terrList, onClose, onSaved
}:{
  assignment: Assignment;
  staffList: Staff[];
  actList: Activity[];
  terrList: Territory[];
  onClose: ()=>void;
  onSaved: (row: Assignment)=>void;
}) {
  const sb = supabaseBrowser();

  const staffSorted = useMemo(() => [...staffList].sort((a,b)=>a.display_name.localeCompare(b.display_name,'it',{sensitivity:'base'})), [staffList]);
  const actSorted   = useMemo(() => [...actList].sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'})), [actList]);
  const terrSorted  = useMemo(() => [...terrList].sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'})), [terrList]);

  const [staffId, setStaffId] = useState(assignment.staff?.id ?? '');
  const [actId, setActId]     = useState(assignment.activity?.id ?? '');
  const [terrId, setTerrId]   = useState(assignment.territory?.id ?? '');
  const [rep, setRep]         = useState<boolean>(!!assignment.reperibile);
  const [notes, setNotes]     = useState<string>(assignment.notes ?? '');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string|undefined>();

  useEffect(()=>{ setErr(undefined); }, [staffId, actId, terrId, rep, notes]);
  useEffect(()=>{ document.body.style.overflow='hidden'; return ()=>{ document.body.style.overflow=''; }; },[]);

  const canSave = !!staffId && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setErr(undefined);

    const { error } = await sb.rpc('update_assignment', {
      p_id: assignment.id,
      p_staff_id: staffId || null,
      p_activity_id: actId || null,
      p_territory_id: terrId || null,
      p_reperibile: rep,
      p_notes: notes?.trim() || null,
    });
    if (error) { setSaving(false); setErr(error.message || 'Errore di salvataggio'); return; }

    const res = await sb.from('assignments').select(`
      id, day_id, reperibile, notes,
      staff:staff_id ( id, display_name ),
      activity:activity_id ( id, name ),
      territory:territory_id ( id, name )
    `).eq('id', assignment.id).single();

    setSaving(false);
    if (res.error || !res.data) { setErr(res.error?.message || 'Errore di lettura'); return; }
    onSaved(res.data as unknown as Assignment);
  };

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
  className="p-4 space-y-4"
  onKeyDown={(e)=>{
    if ((e.key==='s' || e.key==='S') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); if (canSave) save();
    }
  }}
>
  ...
</form>

<div className="px-4 py-3 border-t flex items-center justify-end gap-2">
  <button onClick={onClose} className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50" disabled={saving}>
    Annulla
  </button>
  <button type="submit" formMethod="dialog" formAction="" 
          onClick={(e)=>{ /* no-op, submit gestito dal form */ }}
          disabled={!canSave}
          className={`px-4 py-1.5 rounded-lg text-white ${canSave?'bg-gray-900 hover:bg-black':'bg-gray-400 cursor-not-allowed'}`}>
    {saving ? 'Salvo…' : 'Salva'}
  </button>
</div>

      </div>
    </div>
  );
}
