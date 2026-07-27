'use client';
/* Vista COMMESSE del modulo Contratti (§7bis) — l'anagrafica e basta:
 * committente → contratto → territori di copertura. Prezzi e attività vivono
 * nelle viste gemelle: tenerli qui è ciò che rendeva la pagina infinita. */
import { useState } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Badge from '@/components/Badge';
import Select from '@/components/ui/Select';
import Dialog from '@/components/ui/Dialog';
import { chiediConferma } from '@/components/ui/chiediConferma';
import { toast } from '@/components/ui/Toast';
import CardComprimibile from '@/components/ui/CardComprimibile';
import ContrattiNav from '../ContrattiNav';
import {
  coloreCommittente,
  statoContratto,
  type Committente,
  type Contratto,
  type ContrattoTerritorio,
} from '@/lib/contratti/tipi';

const API = '/api/admin/contratti';

const STATO: Record<ReturnType<typeof statoContratto>, { label: string; variant: 'ok' | 'warn' | 'idle' }> = {
  'in-corso': { label: 'In corso', variant: 'ok' },
  futuro: { label: 'Non ancora iniziato', variant: 'warn' },
  scaduto: { label: 'Scaduto', variant: 'idle' },
  sospeso: { label: 'Sospeso', variant: 'idle' },
};

async function chiama(method: string, body?: object, qs = ''): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${qs}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? 'Operazione non riuscita.');
  return json;
}

const perNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' });

/** Riepilogo da testa chiusa: dice se vale la pena aprire, senza aprire. */
function riepilogo(c: Committente): string {
  const ks = c.contratti ?? [];
  const territori = ks.reduce((n, k) => n + (k.territori ?? []).length, 0);
  if (ks.length === 0) return 'nessun contratto';
  const parti = [`${ks.length} ${ks.length === 1 ? 'contratto' : 'contratti'}`];
  if (territori > 0) parti.push(`${territori} ${territori === 1 ? 'territorio' : 'territori'}`);
  return parti.join(' · ');
}

function ordina(rows: Committente[]): Committente[] {
  return [...rows]
    .map((c) => ({
      ...c,
      contratti: [...(c.contratti ?? [])]
        .map((k) => ({ ...k, territori: [...(k.territori ?? [])].sort(perNome) }))
        .sort(perNome),
    }))
    .sort(perNome);
}

export default function CommesseClient({
  initial,
  territories,
  oggi,
}: {
  initial: Committente[];
  territories: { id: string; name: string }[];
  oggi: string;
}) {
  const [rows, setRows] = useState<Committente[]>(ordina(initial));
  const [busy, setBusy] = useState(false);
  const [nuovoCommittente, setNuovoCommittente] = useState<string | null>(null);
  const [nuovoContratto, setNuovoContratto] = useState<Committente | null>(null);

  const conErrore = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.'); }
    finally { setBusy(false); }
  };

  const patchCommittente = (id: string, patch: Partial<Committente>) =>
    setRows((prev) => ordina(prev.map((c) => (c.id === id ? { ...c, ...patch } : c))));

  const mappaContratti = (committenteId: string, fn: (ks: Contratto[]) => Contratto[]) =>
    setRows((prev) => ordina(prev.map((c) => (c.id === committenteId ? { ...c, contratti: fn(c.contratti ?? []) } : c))));

  const patchContratto = (committenteId: string, contrattoId: string, patch: Partial<Contratto>) =>
    mappaContratti(committenteId, (ks) => ks.map((k) => (k.id === contrattoId ? { ...k, ...patch } : k)));

  const rinomina = (tipo: 'committente' | 'contratto' | 'territorio', id: string, nome: string, applica: () => void) =>
    conErrore(async () => {
      if (!nome.trim()) return;
      await chiama('PATCH', { tipo, id, nome: nome.trim() });
      applica();
    })();

  /* — Committente — */
  const creaCommittente = conErrore(async () => {
    const nome = (nuovoCommittente ?? '').trim();
    if (!nome) { toast.error('Nome committente richiesto.'); return; }
    const json = await chiama('POST', { tipo: 'committente', nome });
    setRows((prev) => ordina([...prev, { ...(json.riga as Committente), contratti: [] }]));
    setNuovoCommittente(null);
    toast.success('Committente aggiunto.');
  });

  const eliminaCommittente = (c: Committente) => conErrore(async () => {
    const ok = await chiediConferma({
      title: `Eliminare il committente ${c.nome}?`,
      message: 'Vengono rimossi anche i suoi contratti, territori e prezzi.',
      confirmLabel: 'Elimina', danger: true,
    });
    if (!ok) return;
    await chiama('DELETE', undefined, `?tipo=committente&id=${c.id}`);
    setRows((prev) => prev.filter((x) => x.id !== c.id));
    toast.success('Committente eliminato.');
  })();

  /* — Contratto — */
  const creaContratto = conErrore(async () => {
    const c = nuovoContratto;
    if (!c) return;
    const json = await chiama('POST', { tipo: 'contratto', committenteId: c.id, nome: `Commessa ${c.nome}` });
    mappaContratti(c.id, (ks) => [...ks, { ...(json.riga as Contratto), territori: [] }]);
    setNuovoContratto(null);
    toast.success('Contratto creato.');
  });

  const patchValidita = (c: Committente, k: Contratto, campo: 'valido_dal' | 'valido_al', valore: string) =>
    conErrore(async () => {
      await chiama('PATCH', { tipo: 'contratto', id: k.id, [campo]: valore });
      patchContratto(c.id, k.id, { [campo]: valore || null });
    })();

  const toggleContratto = (c: Committente, k: Contratto) => conErrore(async () => {
    await chiama('PATCH', { tipo: 'contratto', id: k.id, attivo: !k.attivo });
    patchContratto(c.id, k.id, { attivo: !k.attivo });
  })();

  const eliminaContratto = (c: Committente, k: Contratto) => conErrore(async () => {
    const ok = await chiediConferma({
      title: `Eliminare il contratto ${k.nome}?`,
      message: 'Vengono rimossi anche i suoi territori e prezzi.',
      confirmLabel: 'Elimina', danger: true,
    });
    if (!ok) return;
    await chiama('DELETE', undefined, `?tipo=contratto&id=${k.id}`);
    mappaContratti(c.id, (ks) => ks.filter((x) => x.id !== k.id));
  })();

  /* — Territori di copertura — */
  const aggiungiTerritorio = (c: Committente, k: Contratto, nome: string, reset: () => void) =>
    conErrore(async () => {
      if (!nome.trim()) { toast.error('Nome territorio richiesto.'); return; }
      const json = await chiama('POST', { tipo: 'territorio', contrattoId: k.id, nome: nome.trim() });
      patchContratto(c.id, k.id, { territori: [...k.territori, json.riga as ContrattoTerritorio] });
      reset();
    })();

  const patchTerritorio = (c: Committente, k: Contratto, t: ContrattoTerritorio, patch: Partial<ContrattoTerritorio>) =>
    patchContratto(c.id, k.id, { territori: k.territori.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) });

  const collegaTerritorio = (c: Committente, k: Contratto, t: ContrattoTerritorio, territoryId: string) =>
    conErrore(async () => {
      await chiama('PATCH', { tipo: 'territorio', id: t.id, territory_id: territoryId });
      patchTerritorio(c, k, t, { territory_id: territoryId || null });
    })();

  const eliminaTerritorio = (c: Committente, k: Contratto, t: ContrattoTerritorio) => conErrore(async () => {
    if (!(await chiediConferma({ title: `Eliminare ${t.nome}?`, confirmLabel: 'Elimina', danger: true }))) return;
    await chiama('DELETE', undefined, `?tipo=territorio&id=${t.id}`);
    patchContratto(c.id, k.id, { territori: k.territori.filter((x) => x.id !== t.id) });
  })();

  return (
    <div className="space-y-4">
      <ContrattiNav
        attiva="commesse"
        azioni={
          <Button size="sm" onClick={() => setNuovoCommittente('')}>
            <Plus size={14} aria-hidden />
            Nuovo committente
          </Button>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun committente. Aggiungi il primo per aprire una commessa.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <CardComprimibile
              key={c.id}
              etichetta={`Committente ${c.nome}`}
              scorrevole="28rem"
              intestazione={
                <>
                  <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: coloreCommittente(c.id) }} aria-hidden />
                  <span className="truncate text-sm font-semibold text-[var(--brand-text-main)]" title={c.nome}>{c.nome}</span>
                  {c.codice && (
                    <span
                      className="font-mono text-xs text-[var(--brand-text-muted)]"
                      title="Codice di runtime: collega il contratto a interventi, tassonomia e flussi operatore"
                    >
                      {c.codice}
                    </span>
                  )}
                  {!c.attivo && <Badge variant="idle">Disattivo</Badge>}
                  <span className="ml-auto font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                    {riepilogo(c)}
                  </span>
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--brand-border)] px-4 py-2.5">
                <input
                  defaultValue={c.nome}
                  onBlur={(e) => rinomina('committente', c.id, e.target.value, () => patchCommittente(c.id, { nome: e.target.value.trim() }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`Nome committente ${c.nome}`}
                  className="min-w-[10rem] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:outline-none"
                />
                <Button size="sm" variant="outline" onClick={() => setNuovoContratto(c)} disabled={busy}>
                  <Plus size={14} aria-hidden />
                  Contratto
                </Button>
                <Button size="sm" variant="ghost" onClick={() => eliminaCommittente(c)} disabled={busy} aria-label={`Elimina committente ${c.nome}`}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>

              {(c.contratti ?? []).length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--brand-text-muted)]">
                  Nessun contratto per questo committente.
                </p>
              ) : (
                <div className="divide-y divide-[var(--brand-border)]">
                  {(c.contratti ?? []).map((k) => {
                    const stato = STATO[statoContratto(k, oggi)];
                    return (
                      <div key={k.id} className="space-y-3 px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            defaultValue={k.nome}
                            onBlur={(e) => rinomina('contratto', k.id, e.target.value, () => patchContratto(c.id, k.id, { nome: e.target.value.trim() }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            aria-label={`Nome contratto ${k.nome}`}
                            className="min-w-[11rem] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:outline-none"
                          />
                          <Badge variant={stato.variant}>{stato.label}</Badge>
                          <label className="flex items-center gap-1 text-xs text-[var(--brand-text-muted)]">
                            dal
                            <Input
                              type="date"
                              defaultValue={k.valido_dal ?? ''}
                              onBlur={(e) => patchValidita(c, k, 'valido_dal', e.target.value)}
                              className="w-[9.5rem] py-1 text-xs"
                              aria-label={`Inizio validità di ${k.nome}`}
                            />
                          </label>
                          <label className="flex items-center gap-1 text-xs text-[var(--brand-text-muted)]">
                            al
                            <Input
                              type="date"
                              defaultValue={k.valido_al ?? ''}
                              onBlur={(e) => patchValidita(c, k, 'valido_al', e.target.value)}
                              className="w-[9.5rem] py-1 text-xs"
                              aria-label={`Fine validità di ${k.nome}`}
                            />
                          </label>
                          <Button size="sm" variant="ghost" onClick={() => toggleContratto(c, k)} disabled={busy}>
                            {k.attivo ? 'Sospendi' : 'Riattiva'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => eliminaContratto(c, k)} disabled={busy} aria-label={`Elimina contratto ${k.nome}`}>
                            <Trash2 size={14} aria-hidden />
                          </Button>
                        </div>

                        <div className="space-y-2 rounded-[var(--radius-lg)] bg-[var(--brand-surface-muted)] p-3">
                          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                            Territori di copertura
                          </h2>
                          <ul className="space-y-1">
                            {k.territori.length === 0 && (
                              <li className="py-1 text-xs text-[var(--brand-text-muted)]">Nessun territorio coperto.</li>
                            )}
                            {k.territori.map((t) => (
                              <li key={t.id} className="flex flex-wrap items-center gap-2">
                                <MapPin size={14} className="shrink-0 text-[var(--brand-text-subtle)]" aria-hidden />
                                <input
                                  defaultValue={t.nome}
                                  onBlur={(e) => rinomina('territorio', t.id, e.target.value, () => patchTerritorio(c, k, t, { nome: e.target.value.trim() }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  aria-label={`Nome territorio ${t.nome}`}
                                  className="min-w-[6rem] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:outline-none"
                                />
                                <Select
                                  value={t.territory_id ?? ''}
                                  onChange={(e) => collegaTerritorio(c, k, t, e.target.value)}
                                  disabled={busy}
                                  className="w-[11rem] py-1 text-xs"
                                  aria-label={`Territorio di pianificazione per ${t.nome}`}
                                >
                                  <option value="">— non pianificato —</option>
                                  {territories.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                                </Select>
                                <Button size="sm" variant="ghost" onClick={() => eliminaTerritorio(c, k, t)} disabled={busy} aria-label={`Elimina ${t.nome}`}>
                                  <Trash2 size={14} aria-hidden />
                                </Button>
                              </li>
                            ))}
                          </ul>
                          <AggiungiTerritorio busy={busy} onAdd={(nome, reset) => aggiungiTerritorio(c, k, nome, reset)} />
                          <p className="text-xs text-[var(--brand-text-muted)]">
                            La tendina collega il comune al territorio di pianificazione di cronoprogramma e mappa.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardComprimibile>
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

      <Dialog
        open={nuovoContratto !== null}
        onClose={() => setNuovoContratto(null)}
        title={`Nuovo contratto${nuovoContratto ? ` — ${nuovoContratto.nome}` : ''}`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setNuovoContratto(null)}>Annulla</Button>
            <Button size="sm" onClick={creaContratto} loading={busy}>Crea</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--brand-text-muted)]">
          Il contratto nasce con un nome provvisorio: rinominalo e imposta la validità
          direttamente nella scheda.
        </p>
      </Dialog>
    </div>
  );
}

function AggiungiTerritorio({ busy, onAdd }: { busy: boolean; onAdd: (nome: string, reset: () => void) => void }) {
  const [nome, setNome] = useState('');
  return (
    <div className="flex items-center gap-2">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim()) onAdd(nome, () => setNome('')); }}
        placeholder="+ aggiungi comune o zona"
        className="py-1.5 text-xs"
      />
      <Button size="sm" variant="outline" onClick={() => onAdd(nome, () => setNome(''))} disabled={busy || !nome.trim()}>
        Aggiungi
      </Button>
    </div>
  );
}
