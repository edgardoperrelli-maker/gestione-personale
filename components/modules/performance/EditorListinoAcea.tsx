'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/Button';

// Editor del listino tariffe ACEA (4 voci × periodi di validità). CRUD su /api/admin/acea/listino.
// Modellato sul pattern di PannelloContabilita (input inline + salvataggio per riga).

interface ListinoRow {
  id: string;
  voce: number;
  kpi: string;
  prezzo: number;
  valido_dal: string;
  valido_al: string | null;
  attivo: boolean;
  note: string | null;
}

const VOCI: { voce: number; kpi: string; label: string }[] = [
  { voce: 10, kpi: 'EL', label: 'EL — Limitazioni' },
  { voce: 11, kpi: 'ES', label: 'ES — Sospensioni' },
  { voce: 12, kpi: 'ERC', label: 'ERC — Rimozione contatori' },
  { voce: 6, kpi: 'ERA', label: 'ERA — Rimozione abusi' },
];

const field =
  'rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';

function oggiISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EditorListinoAcea({ onSaved }: { onSaved?: () => void }) {
  const [rows, setRows] = useState<ListinoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState({ voce: 10, prezzo: 0, valido_dal: oggiISO(), valido_al: '', note: '' });

  const carica = async () => {
    setLoading(true);
    setErrore(null);
    try {
      const res = await fetch('/api/admin/acea/listino', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const j = (await res.json()) as { listino: ListinoRow[] };
      setRows(j.listino ?? []);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore caricamento listino.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carica();
  }, []);

  const aggiorna = (id: string, patch: Partial<ListinoRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const salva = async (r: ListinoRow) => {
    setErrore(null);
    const res = await fetch('/api/admin/acea/listino', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: r.id,
        prezzo: r.prezzo,
        valido_dal: r.valido_dal,
        valido_al: r.valido_al ?? '',
        attivo: r.attivo,
        note: r.note ?? '',
      }),
    });
    if (!res.ok) setErrore((await res.json().catch(() => ({}))).error ?? 'Errore salvataggio.');
    else onSaved?.();
  };

  const elimina = async (id: string) => {
    setErrore(null);
    const res = await fetch(`/api/admin/acea/listino?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) setErrore((await res.json().catch(() => ({}))).error ?? 'Errore eliminazione.');
    else {
      await carica();
      onSaved?.();
    }
  };

  const aggiungi = async () => {
    setErrore(null);
    const res = await fetch('/api/admin/acea/listino', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nuovo),
    });
    if (!res.ok) setErrore((await res.json().catch(() => ({}))).error ?? 'Errore inserimento.');
    else {
      setNuovo({ voce: 10, prezzo: 0, valido_dal: oggiISO(), valido_al: '', note: '' });
      await carica();
      onSaved?.();
    }
  };

  return (
    <div className="space-y-3">
      {errore && <p className="text-xs text-[var(--danger)]">{errore}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--brand-text-muted)]">
              <th className="py-1 pr-2">Voce</th>
              <th className="py-1 pr-2">Prezzo €</th>
              <th className="py-1 pr-2">Valido dal</th>
              <th className="py-1 pr-2">Valido al</th>
              <th className="py-1 pr-2">Attivo</th>
              <th className="py-1 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-border)]">
                <td className="py-1 pr-2 font-medium text-[var(--brand-text-main)]">{r.kpi}</td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    step="0.01"
                    value={r.prezzo}
                    onChange={(e) => aggiorna(r.id, { prezzo: Number(e.target.value) })}
                    className={`${field} w-24`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" value={r.valido_dal} onChange={(e) => aggiorna(r.id, { valido_dal: e.target.value })} className={field} />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="date"
                    value={r.valido_al ?? ''}
                    onChange={(e) => aggiorna(r.id, { valido_al: e.target.value || null })}
                    className={field}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    checked={r.attivo}
                    onChange={(e) => aggiorna(r.id, { attivo: e.target.checked })}
                    className="accent-[var(--brand-primary)]"
                  />
                </td>
                <td className="py-1 pr-2">
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={() => salva(r)}>Salva</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs text-[var(--danger)]" onClick={() => elimina(r.id)}>Elimina</Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-3 text-center text-[var(--brand-text-muted)]">Nessuna tariffa. Aggiungine una qui sotto.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--brand-text-muted)]">
          Voce
          <select value={nuovo.voce} onChange={(e) => setNuovo((n) => ({ ...n, voce: Number(e.target.value) }))} className={field}>
            {VOCI.map((v) => <option key={v.voce} value={v.voce}>{v.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--brand-text-muted)]">
          Prezzo €
          <input type="number" step="0.01" value={nuovo.prezzo} onChange={(e) => setNuovo((n) => ({ ...n, prezzo: Number(e.target.value) }))} className={`${field} w-24`} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--brand-text-muted)]">
          Valido dal
          <input type="date" value={nuovo.valido_dal} onChange={(e) => setNuovo((n) => ({ ...n, valido_dal: e.target.value }))} className={field} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--brand-text-muted)]">
          Valido al (vuoto = aperto)
          <input type="date" value={nuovo.valido_al} onChange={(e) => setNuovo((n) => ({ ...n, valido_al: e.target.value }))} className={field} />
        </label>
        <Button type="button" variant="primary" size="sm" className="h-8" onClick={aggiungi}>Aggiungi tariffa</Button>
      </div>
    </div>
  );
}
