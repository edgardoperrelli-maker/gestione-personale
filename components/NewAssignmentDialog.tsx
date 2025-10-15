'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export default function NewAssignmentDialog({
  dayId, iso, staffList, actList, terrList, onClose, onCreated
}:{
  dayId:string; iso:string;
  staffList:any[]; actList:any[]; terrList:any[];
  onClose:()=>void; onCreated:(row:any)=>void;
}) {
  const sb = supabaseBrowser();

  // blocco scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [staffId, setStaff] = useState('');
  const [actId, setAct]     = useState('');
  const [terrId, setTerr]   = useState('');
  const [rep, setRep]       = useState(false);
  const [notes, setNotes]   = useState('');
  const [err, setErr]       = useState<string|undefined>();
  const [saving, setSaving] = useState(false);

  const canSave = !!staffId && !!actId && !!terrId;

  const resetState = () => { setStaff(''); setAct(''); setTerr(''); setRep(false); setNotes(''); setErr(undefined); };
  const closeAll = () => { resetState(); onClose(); };

  const randomId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

  // salvataggio ottimistico: aggiorna subito il padre e chiudi, poi inserisci su Supabase in background
  const save = async () => {
    if (!canSave) return;
    setErr(undefined);
    setSaving(true);

    // costruisci riga ottimistica
    const staffObj = staffList.find((s:any) => s.id === staffId) ?? null;
    const actObj   = actList.find((a:any) => a.id === actId) ?? null;
    const terrObj  = terrList.find((t:any) => t.id === terrId) ?? null;

    const optimisticRow = {
      id: randomId(),
      day_id: dayId,
      reperibile: !!rep,
      notes: notes?.trim() || null,
      staff: staffObj ? { id: staffObj.id, display_name: staffObj.display_name } : null,
      activity: actObj ? { id: actObj.id, name: actObj.name } : null,
      territory: terrObj ? { id: terrObj.id, name: terrObj.name } : null,
    };

    // aggiorna UI immediatamente
    onCreated(optimisticRow);
    onClose(); // chiudi subito

    // inserisci sul DB senza join per massima velocità
    try {
    const { error } = await sb
  .from('assignments')
  .insert({
    day_id: dayId,
    staff_id: staffId,
    activity_id: actId || null,
    territory_id: terrId || null,
    reperibile: !!rep,
    notes: notes?.trim() || null,
  });


      if (error) {
        console.error('Insert failed:', error.message);
        // opzionale: mostrare toast non bloccante
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 grid place-items-center p-4 z-50">
      <div className="w-full max-w-md bg-white rounded-xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold">Nuova assegnazione · {iso.split('-').reverse().join('/')}</h2>
          <button onClick={closeAll} className="text-sm px-2 py-1 border rounded">Chiudi</button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs">Operatore *</label>
          <select className="w-full border rounded p-2 text-sm" value={staffId} onChange={e=>setStaff(e.target.value)}>
            <option value="">{staffList.length ? 'Seleziona…' : '— Nessun operatore —'}</option>
            {staffList.map((s:any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select>

          <label className="block text-xs">Attività *</label>
          <select className="w-full border rounded p-2 text-sm" value={actId} onChange={e=>setAct(e.target.value)}>
            <option value="">{actList.length ? 'Seleziona…' : '— Nessuna attività —'}</option>
            {actList.map((a:any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <label className="block text-xs">Territorio *</label>
          <select className="w-full border rounded p-2 text-sm" value={terrId} onChange={e=>setTerr(e.target.value)}>
            <option value="">{terrList.length ? 'Seleziona…' : '— Nessun territorio disponibile —'}</option>
            {terrList.map((t:any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <input id="rep" type="checkbox" checked={rep} onChange={e=>setRep(e.target.checked)} />
            <label htmlFor="rep" className="text-sm">Reperibile</label>
          </div>

          <label className="block text-xs">Note</label>
          <input className="w-full border rounded p-2 text-sm" value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>

        {err && <div className="text-xs text-red-600">{err}</div>}
        {!terrList.length && <div className="text-xs text-red-600">Nessun territorio. Controlla permessi/RLS e dati.</div>}

        <div className="flex justify-end gap-2">
          <button onClick={closeAll} className="px-3 py-1.5 border rounded text-sm">Annulla</button>
          <button onClick={save} disabled={saving || !canSave} className="px-3 py-1.5 border rounded text-sm">
            {saving ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
