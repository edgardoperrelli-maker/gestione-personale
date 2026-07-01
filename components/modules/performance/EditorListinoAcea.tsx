'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/Button';

// Editor del listino tariffe ACEA PER ATTIVITÀ (× periodi di validità). CRUD su /api/admin/acea/listino.
// "Scopri attività" popola il listino dalle attività reali trovate nei dati (interventi + master).

interface ListinoRow {
  id: string;
  attivita: string;
  etichetta: string;
  voce: number | null;
  kpi: string | null;
  prezzo: number;
  valido_dal: string;
  valido_al: string | null;
  attivo: boolean;
  note: string | null;
}

const field =
  'rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';

function oggiISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EditorListinoAcea({ onSaved }: { onSaved?: () => void }) {
  const [rows, setRows] = useState<ListinoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState({ etichetta: '', prezzo: 0, valido_dal: oggiISO() });

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
      body: JSON.stringify({ id: r.id, prezzo: r.prezzo, valido_dal: r.valido_dal, valido_al: r.valido_al ?? '', attivo: r.attivo }),
    });
    if (!res.ok) setErrore((await res.json().catch(() => ({}))).error ?? 'Errore salvataggio.');
    else onSaved?.();
  };

  const elimina = async (id: string) => {
    setErrore(null);
    const res = await fetch(`/api/admin/acea/listino?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) setErrore((await res.json().catch(() => ({}))).error ?? 'Errore eliminazione.');
    else { await carica(); onSaved?.(); }
  };

  const aggiungi = async () => {
    setErrore(null);
    const res = await fetch('/api/admin/acea/listino', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nuovo),
    });
    if (!res.ok) setErrore((await res.json().catch(() => ({}))).error ?? 'Errore inserimento.');
    else { setNuovo({ etichetta: '', prezzo: 0, valido_dal: oggiISO() }); await carica(); onSaved?.(); }
  };

  const scopri = async () => {
    setErrore(null);
    setMsg('Scopro le attività dai dati…');
    const res = await fetch('/api/admin/acea/listino/scopri', { method: 'POST' });
    if (!res.ok) {
      setMsg(null);
      setErrore((await res.json().catch(() => ({}))).error ?? 'Errore scoperta attività.');
      return;
    }
    const j = (await res.json()) as { aggiunte: number; gia: number };
    setMsg(`Aggiunte ${j.aggiunte} attività (già a listino: ${j.gia}). Imposta i prezzi qui sotto.`);
    await carica();
    onSaved?.();
  };

  const riconcilia = async () => {
    setErrore(null);
    setMsg('Cerco attività non ancora mappate…');
    const res = await fetch('/api/admin/acea/attivita/riconcilia', { method: 'POST' });
    if (!res.ok) {
      setMsg(null);
      setErrore((await res.json().catch(() => ({}))).error ?? 'Errore riconciliazione.');
      return;
    }
    const j = (await res.json()) as { aggiunte: number; attivita: { committente: string; attivita: string }[] };
    if (j.aggiunte === 0) {
      setMsg('Nessuna attività nuova: l’alias è già allineato.');
    } else {
      const elenco = j.attivita.slice(0, 8).map((a) => `${a.committente}: ${a.attivita}`).join(' · ');
      setMsg(`Aggiunte ${j.aggiunte} attività "Da classificare"${j.aggiunte > 8 ? ' (prime 8)' : ''}: ${elenco}`);
    }
    await carica();
    onSaved?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" size="sm" className="h-8" onClick={scopri}>Scopri attività dai dati</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={riconcilia}>Riconcilia attività non mappate</Button>
        {msg && <span className="text-xs text-[var(--brand-text-muted)]">{msg}</span>}
        {errore && <span className="text-xs text-[var(--danger)]">{errore}</span>}
      </div>

      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--brand-surface)]">
            <tr className="text-left text-[var(--brand-text-muted)]">
              <th className="py-1 pr-2">Attività</th>
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
                <td className="py-1 pr-2 text-[var(--brand-text-main)]">{r.etichetta}</td>
                <td className="py-1 pr-2 text-[var(--brand-text-muted)]">{r.kpi ?? '—'}</td>
                <td className="py-1 pr-2">
                  <input type="number" step="0.01" value={r.prezzo} onChange={(e) => aggiorna(r.id, { prezzo: Number(e.target.value) })} className={`${field} w-24`} />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" value={r.valido_dal} onChange={(e) => aggiorna(r.id, { valido_dal: e.target.value })} className={field} />
                </td>
                <td className="py-1 pr-2">
                  <input type="date" value={r.valido_al ?? ''} onChange={(e) => aggiorna(r.id, { valido_al: e.target.value || null })} className={field} />
                </td>
                <td className="py-1 pr-2">
                  <input type="checkbox" checked={r.attivo} onChange={(e) => aggiorna(r.id, { attivo: e.target.checked })} className="accent-[var(--brand-primary)]" />
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
              <tr><td colSpan={7} className="py-3 text-center text-[var(--brand-text-muted)]">Nessuna tariffa. Usa «Scopri attività dai dati».</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--brand-text-muted)]">
          Attività (manuale)
          <input type="text" value={nuovo.etichetta} onChange={(e) => setNuovo((n) => ({ ...n, etichetta: e.target.value }))} className={`${field} w-56`} placeholder="es. Sostituzione saracinesca" />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--brand-text-muted)]">
          Prezzo €
          <input type="number" step="0.01" value={nuovo.prezzo} onChange={(e) => setNuovo((n) => ({ ...n, prezzo: Number(e.target.value) }))} className={`${field} w-24`} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--brand-text-muted)]">
          Valido dal
          <input type="date" value={nuovo.valido_dal} onChange={(e) => setNuovo((n) => ({ ...n, valido_dal: e.target.value }))} className={field} />
        </label>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={aggiungi} disabled={!nuovo.etichetta.trim()}>Aggiungi</Button>
      </div>
    </div>
  );
}
