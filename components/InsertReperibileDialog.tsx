'use client';

import { useEffect, useState } from 'react';

import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { isTerritoryValidOnDay } from '@/lib/territories';
import type { Territory } from '@/types';

type Staff = { id:string; display_name:string; active?:boolean };

export default function InsertReperibileDialog({
  open, onClose, staffList, terrList, onInserted,
}:{
  open:boolean;
  onClose:()=>void;
  staffList:Staff[];
  terrList:Territory[];
  onInserted:(createdCount:number)=>void;
}) {
  const sb = supabaseBrowser();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string|undefined>();
  const [staffId, setStaffId] = useState<string>('');
  const [terrId, setTerrId] = useState<string>('');
  const [startIso, setStartIso] = useState<string>(''); // YYYY-MM-DD
  const [endIso, setEndIso] = useState<string>('');
  const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  useEffect(() => {
    if (!open) {
      setSaving(false);
      setErr(undefined);
      setStaffId('');
      setTerrId('');
      setStartIso('');
      setEndIso('');
    }
  }, [open]);

  if (!open) return null;

  function eachDateInclusive(a:string, b:string): string[] {
    // assume YYYY-MM-DD (locale Europe/Rome gestito a monte)
    const res:string[] = [];
    const [ay,am,ad] = a.split('-').map(Number);
    const [by,bm,bd] = b.split('-').map(Number);
    const d1 = new Date(ay, am-1, ad, 12);
    const d2 = new Date(by, bm-1, bd, 12);
    if (d1 > d2) return res;
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate()+1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      res.push(`${y}-${m}-${dd}`);
    }
    return res;
  }

  async function save() {
    if (!staffId || !terrId || !startIso || !endIso) {
      setErr('Compila tutti i campi.');
      return;
    }
    const days = eachDateInclusive(startIso, endIso);
    if (!days.length) {
      setErr('Intervallo date non valido.');
      return;
    }

    const selectedTerritory = terrList.find((territory) => territory.id === terrId);
    if (!selectedTerritory) {
      setErr('Territorio selezionato non disponibile.');
      return;
    }

    const invalidDay = days.find((iso) => !isTerritoryValidOnDay(selectedTerritory, iso, todayIso));
    if (invalidDay) {
      setErr(`Il territorio ${selectedTerritory.name} non e valido per il ${invalidDay}.`);
      return;
    }

    setSaving(true);
    setErr(undefined);
    let created = 0;

    try {
      for (const iso of days) {
        // 1) prendo il day_id
       const { data: dayRow, error: dayErr } = await sb
  .from('calendar_days')
  .select('id, day')
  .eq('day', iso)
  .maybeSingle();


        if (dayErr) throw dayErr;
        if (!dayRow) continue; // se il giorno non è nel mese caricato, salto

        // 2) inserisco/aggiorno assignment reperibile per quel giorno
        // tentativo insert
        const { error: insErr } = await sb
          .from('assignments')
          .insert({
            day_id: dayRow.id,
            staff_id: staffId,
            territory_id: terrId,
            activity_id: null,
            reperibile: true,
            notes: null,
          });

        if (insErr) {
          // se conflitto esistenza, provo update del record reperibile del giorno per quello staff
          const { error: updErr } = await sb
            .from('assignments')
            .update({
              territory_id: terrId,
              activity_id: null,
              reperibile: true,
              updated_at: new Date().toISOString(),
            })
            .eq('day_id', dayRow.id)
            .eq('staff_id', staffId)
            .select('id')
            .maybeSingle();
          if (updErr) throw insErr; // mantengo l’errore originale se anche update fallisce
        } else {
          created += 1;
        }
      }

      setSaving(false);
      onInserted(created);
      onClose(); // chiude la modale
    } catch (e: unknown) {
  setSaving(false);
  const msg = e instanceof Error ? e.message : String(e);
  setErr(msg || 'Errore salvataggio.');
}

  }

  // UI
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[oklch(0_0_0/0.6)]" onClick={() => !saving && onClose()} />
      <div className="absolute inset-x-0 top-10 mx-auto w-[95%] max-w-xl">
        <div className="bg-[var(--brand-surface)] rounded-2xl shadow-xl border border-[var(--brand-border)]">
          <div className="px-4 py-3 border-b border-[var(--brand-border)]">
            <h2 className="text-lg font-semibold">Inserisci Reperibile</h2>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-[var(--brand-text-muted)] mb-1">Operatore *</span>
                <select
                  className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                  value={staffId}
                  onChange={(e)=>setStaffId(e.target.value)}
                >
                  <option value="">— Seleziona —</option>
                  {staffList.map(s=>(
                    <option key={s.id} value={s.id}>{s.display_name}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="block text-[var(--brand-text-muted)] mb-1">Territorio *</span>
                <select
                  className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                  value={terrId}
                  onChange={(e)=>setTerrId(e.target.value)}
                >
                  <option value="">— Seleziona —</option>
                  {terrList.map(t=>(
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-[var(--brand-text-muted)] mb-1">Inizio *</span>
                <input
                  type="date"
                  className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                  value={startIso}
                  onChange={(e)=>setStartIso(e.target.value)}
                />
                <span className="text-xs text-[var(--brand-text-subtle)]">Selettore mostra calendario mensile con settimane.</span>
              </label>

              <label className="text-sm">
                <span className="block text-[var(--brand-text-muted)] mb-1">Fine *</span>
                <input
                  type="date"
                  className="w-full border border-[var(--brand-border)] rounded-lg px-3 py-2 bg-[var(--brand-surface)] text-[var(--brand-text-main)]"
                  value={endIso}
                  onChange={(e)=>setEndIso(e.target.value)}
                />
                <span className="text-xs text-[var(--brand-text-subtle)]">Selettore mostra calendario mensile con settimane.</span>
              </label>
            </div>

            {err && <div className="text-sm text-[var(--danger)]">{err}</div>}
          </div>

          <div className="px-4 py-3 border-t border-[var(--brand-border)] flex items-center justify-end gap-2">
            <button
              className="px-3 py-2 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] hover:bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]"
              onClick={()=>!saving && onClose()}
              disabled={saving}
            >
              Annulla
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-[var(--brand-primary)] text-[oklch(0.16_0.06_245)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Salvo…' : 'Salva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
