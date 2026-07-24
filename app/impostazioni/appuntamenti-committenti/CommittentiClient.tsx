'use client';

import { useState } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ObjectHeader from '@/components/ui/ObjectHeader';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Badge from '@/components/Badge';
import Dialog from '@/components/ui/Dialog';
import { chiediConferma } from '@/components/ui/chiediConferma';
import { toast } from '@/components/ui/Toast';
import {
  coloreCommittente,
  type AppuntamentoCommittente,
  type AppuntamentoTerritorio,
} from '@/lib/appuntamenti/committenti';

const API = '/api/admin/appuntamenti-committenti';

async function chiama(method: string, body?: object, qs = ''): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${qs}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? 'Operazione non riuscita.');
  return json;
}

function ordina(rows: AppuntamentoCommittente[]): AppuntamentoCommittente[] {
  return [...rows]
    .map((c) => ({
      ...c,
      territori: [...c.territori].sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' })),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));
}

export default function CommittentiClient({ initial }: { initial: AppuntamentoCommittente[] }) {
  const [rows, setRows] = useState<AppuntamentoCommittente[]>(ordina(initial));
  const [busy, setBusy] = useState(false);
  const [nuovoCommittente, setNuovoCommittente] = useState<string | null>(null); // null = dialog chiuso

  const patchCommittente = (id: string, patch: Partial<AppuntamentoCommittente>) =>
    setRows((prev) => ordina(prev.map((c) => (c.id === id ? { ...c, ...patch } : c))));

  const patchTerritorio = (committenteId: string, terrId: string, patch: Partial<AppuntamentoTerritorio>) =>
    setRows((prev) => ordina(prev.map((c) =>
      c.id !== committenteId ? c
        : { ...c, territori: c.territori.map((t) => (t.id === terrId ? { ...t, ...patch } : t)) },
    )));

  const conErrore = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.'); }
    finally { setBusy(false); }
  };

  // — Committente —
  const creaCommittente = conErrore(async () => {
    const nome = (nuovoCommittente ?? '').trim();
    if (!nome) { toast.error('Nome committente richiesto.'); return; }
    const json = await chiama('POST', { tipo: 'committente', nome });
    setRows((prev) => ordina([...prev, json.committente as AppuntamentoCommittente]));
    setNuovoCommittente(null);
    toast.success('Committente aggiunto.');
  });

  const rinominaCommittente = (c: AppuntamentoCommittente, nome: string) => conErrore(async () => {
    if (nome.trim() === c.nome || !nome.trim()) return;
    await chiama('PATCH', { tipo: 'committente', id: c.id, nome: nome.trim() });
    patchCommittente(c.id, { nome: nome.trim() });
  })();

  const toggleCommittente = (c: AppuntamentoCommittente) => conErrore(async () => {
    await chiama('PATCH', { tipo: 'committente', id: c.id, attivo: !c.attivo });
    patchCommittente(c.id, { attivo: !c.attivo });
  })();

  const eliminaCommittente = (c: AppuntamentoCommittente) => conErrore(async () => {
    if (!(await chiediConferma({ title: `Eliminare il committente ${c.nome}?`, message: 'Vengono rimossi anche i suoi territori.', confirmLabel: 'Elimina', danger: true }))) return;
    await chiama('DELETE', undefined, `?tipo=committente&id=${c.id}`);
    setRows((prev) => prev.filter((x) => x.id !== c.id));
    toast.success('Committente eliminato.');
  })();

  // — Territorio —
  const aggiungiTerritorio = (c: AppuntamentoCommittente, nome: string, reset: () => void) => conErrore(async () => {
    if (!nome.trim()) { toast.error('Nome territorio richiesto.'); return; }
    const json = await chiama('POST', { tipo: 'territorio', committenteId: c.id, nome: nome.trim() });
    patchCommittente(c.id, { territori: [...c.territori, json.territorio as AppuntamentoTerritorio] });
    reset();
  })();

  const rinominaTerritorio = (c: AppuntamentoCommittente, t: AppuntamentoTerritorio, nome: string) => conErrore(async () => {
    if (nome.trim() === t.nome || !nome.trim()) return;
    await chiama('PATCH', { tipo: 'territorio', id: t.id, nome: nome.trim() });
    patchTerritorio(c.id, t.id, { nome: nome.trim() });
  })();

  const toggleTerritorio = (c: AppuntamentoCommittente, t: AppuntamentoTerritorio) => conErrore(async () => {
    await chiama('PATCH', { tipo: 'territorio', id: t.id, attivo: !t.attivo });
    patchTerritorio(c.id, t.id, { attivo: !t.attivo });
  })();

  const eliminaTerritorio = (c: AppuntamentoCommittente, t: AppuntamentoTerritorio) => conErrore(async () => {
    if (!(await chiediConferma({ title: `Eliminare il territorio ${t.nome}?`, confirmLabel: 'Elimina', danger: true }))) return;
    await chiama('DELETE', undefined, `?tipo=territorio&id=${t.id}`);
    patchCommittente(c.id, { territori: c.territori.filter((x) => x.id !== t.id) });
  })();

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'Impostazioni', href: '/impostazioni' }, { label: 'Committenti appuntamenti' }]} />

      <ObjectHeader
        title="Committenti appuntamenti"
        sub="Committenti e relativi territori per cui si registrano appuntamenti. Sono separati dai territori della mappa."
        actions={
          <Button size="sm" onClick={() => setNuovoCommittente('')}>
            <Plus size={14} aria-hidden />
            Nuovo committente
          </Button>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun committente. Aggiungi il primo per registrare appuntamenti.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)]">
              {/* Testa committente */}
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--brand-border)] px-4 py-3">
                <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: coloreCommittente(c.id) }} aria-hidden />
                <input
                  defaultValue={c.nome}
                  onBlur={(e) => rinominaCommittente(c, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`Nome committente ${c.nome}`}
                  className="min-w-[160px] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)] focus:outline-none"
                />
                {!c.attivo && <Badge variant="idle">Disattivo</Badge>}
                <span className="font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                  {c.territori.length} territori
                </span>
                <Button size="sm" variant="ghost" onClick={() => toggleCommittente(c)} disabled={busy}>
                  {c.attivo ? 'Disattiva' : 'Attiva'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => eliminaCommittente(c)} disabled={busy} aria-label={`Elimina committente ${c.nome}`}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>

              {/* Territori */}
              <ul className="divide-y divide-[var(--brand-border)]">
                {c.territori.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <MapPin size={14} className="shrink-0 text-[var(--brand-text-subtle)]" aria-hidden />
                    <input
                      defaultValue={t.nome}
                      onBlur={(e) => rinominaTerritorio(c, t, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      aria-label={`Nome territorio ${t.nome}`}
                      className="min-w-[140px] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)] focus:outline-none"
                    />
                    {!t.attivo && <Badge variant="idle">Disattivo</Badge>}
                    <Button size="sm" variant="ghost" onClick={() => toggleTerritorio(c, t)} disabled={busy}>
                      {t.attivo ? 'Disattiva' : 'Attiva'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => eliminaTerritorio(c, t)} disabled={busy} aria-label={`Elimina territorio ${t.nome}`}>
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </li>
                ))}
                <li className="px-4 py-2">
                  <AggiungiTerritorio busy={busy} onAdd={(nome, reset) => aggiungiTerritorio(c, nome, reset)} />
                </li>
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={nuovoCommittente !== null}
        onClose={() => setNuovoCommittente(null)}
        title="Nuovo committente"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setNuovoCommittente(null)}>Annulla</Button>
            <Button size="sm" onClick={creaCommittente} loading={busy}>Crea</Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Nome committente</span>
          <Input
            autoFocus
            value={nuovoCommittente ?? ''}
            onChange={(e) => setNuovoCommittente(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') creaCommittente(); }}
            placeholder="es. AcquaLatina"
          />
        </label>
      </Dialog>
    </div>
  );
}

function AggiungiTerritorio({ busy, onAdd }: { busy: boolean; onAdd: (nome: string, reset: () => void) => void }) {
  const [nome, setNome] = useState('');
  const reset = () => setNome('');
  return (
    <div className="flex items-center gap-2">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim()) onAdd(nome, reset); }}
        placeholder="+ aggiungi territorio"
        className="py-1.5 text-xs"
      />
      <Button size="sm" variant="outline" onClick={() => onAdd(nome, reset)} disabled={busy || !nome.trim()}>
        Aggiungi
      </Button>
    </div>
  );
}
