'use client';
/* Consolle Contratti — l'anagrafica unica delle commesse.
 * Struttura: committente (card) → contratto (blocco) → le quattro sezioni che il
 * contratto governa: TERRITORI di copertura, PREZZI, ATTIVITÀ e il flusso di azioni
 * che le copre. Le attività sono in SOLA LETTURA: vivono in `attivita_tassonomia`,
 * qui si vedono insieme al resto del contratto e si raggiungono con un link — così
 * ci si accorge subito di un'attività a listino senza flusso operatore. */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, MapPin, Workflow, TriangleAlert, ExternalLink } from 'lucide-react';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ObjectHeader from '@/components/ui/ObjectHeader';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Badge from '@/components/Badge';
import Select from '@/components/ui/Select';
import Dialog from '@/components/ui/Dialog';
import { chiediConferma } from '@/components/ui/chiediConferma';
import { toast } from '@/components/ui/Toast';
import {
  coloreCommittente,
  statoContratto,
  type Committente,
  type Contratto,
  type ContrattoTerritorio,
  type RigaListino,
} from '@/lib/contratti/tipi';
import type { AttivitaContratto } from './page';

const API = '/api/admin/contratti';

type Props = {
  initial: Committente[];
  listino: RigaListino[];
  attivitaPerCodice: Record<string, AttivitaContratto[]>;
  territories: { id: string; name: string }[];
  oggi: string;
};

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

const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export default function ContrattiClient({ initial, listino, attivitaPerCodice, territories, oggi }: Props) {
  const [rows, setRows] = useState<Committente[]>(ordina(initial));
  const [prezzi, setPrezzi] = useState<RigaListino[]>(listino);
  const [busy, setBusy] = useState(false);
  const [nuovoCommittente, setNuovoCommittente] = useState<string | null>(null);
  const [nuovoContratto, setNuovoContratto] = useState<Committente | null>(null);
  const [nuovoPrezzo, setNuovoPrezzo] = useState<Contratto | null>(null);

  const prezziPerContratto = useMemo(() => {
    const m = new Map<string, RigaListino[]>();
    for (const r of prezzi) {
      if (!r.contratto_id) continue;
      m.set(r.contratto_id, [...(m.get(r.contratto_id) ?? []), r]);
    }
    return m;
  }, [prezzi]);

  const conErrore = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.'); }
    finally { setBusy(false); }
  };

  const patchCommittente = (id: string, patch: Partial<Committente>) =>
    setRows((prev) => ordina(prev.map((c) => (c.id === id ? { ...c, ...patch } : c))));

  const patchContratto = (committenteId: string, contrattoId: string, patch: Partial<Contratto>) =>
    patchCommittenteContratti(committenteId, (ks) =>
      ks.map((k) => (k.id === contrattoId ? { ...k, ...patch } : k)));

  const patchCommittenteContratti = (committenteId: string, fn: (ks: Contratto[]) => Contratto[]) =>
    setRows((prev) => ordina(prev.map((c) => (c.id === committenteId ? { ...c, contratti: fn(c.contratti ?? []) } : c))));

  /* — Committente — */
  const creaCommittente = conErrore(async () => {
    const nome = (nuovoCommittente ?? '').trim();
    if (!nome) { toast.error('Nome committente richiesto.'); return; }
    const json = await chiama('POST', { tipo: 'committente', nome });
    setRows((prev) => ordina([...prev, { ...(json.riga as Committente), contratti: [] }]));
    setNuovoCommittente(null);
    toast.success('Committente aggiunto.');
  });

  const rinomina = (tipo: 'committente' | 'contratto' | 'territorio', id: string, nome: string, applica: () => void) =>
    conErrore(async () => {
      if (!nome.trim()) return;
      await chiama('PATCH', { tipo, id, nome: nome.trim() });
      applica();
    })();

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
    patchCommittenteContratti(c.id, (ks) => [...ks, { ...(json.riga as Contratto), territori: [] }]);
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
    patchCommittenteContratti(c.id, (ks) => ks.filter((x) => x.id !== k.id));
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
    patchContratto(c.id, k.id, {
      territori: k.territori.map((x) => (x.id === t.id ? { ...x, ...patch } : x)),
    });

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

  /* — Prezzi — */
  const salvaPrezzo = (r: RigaListino, prezzo: string) => conErrore(async () => {
    const n = Number(prezzo.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) { toast.error('Prezzo non valido.'); return; }
    if (n === r.prezzo) return;
    await chiama('PATCH', { tipo: 'listino', id: r.id, prezzo: n });
    setPrezzi((prev) => prev.map((x) => (x.id === r.id ? { ...x, prezzo: n } : x)));
    toast.success('Prezzo aggiornato.');
  })();

  const eliminaPrezzo = (r: RigaListino) => conErrore(async () => {
    if (!(await chiediConferma({ title: `Eliminare la tariffa ${r.etichetta}?`, confirmLabel: 'Elimina', danger: true }))) return;
    await chiama('DELETE', undefined, `?tipo=listino&id=${r.id}`);
    setPrezzi((prev) => prev.filter((x) => x.id !== r.id));
  })();

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'Impostazioni', href: '/impostazioni' }, { label: 'Contratti' }]} />

      <ObjectHeader
        title="Contratti"
        sub="Le commesse e ciò che le definisce: territori di copertura, prezzi e attività. Un committente può avere più contratti nel tempo."
        actions={
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
            <section
              key={c.id}
              className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)]"
            >
              <header className="flex flex-wrap items-center gap-2 border-b border-[var(--brand-border)] px-4 py-3">
                <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: coloreCommittente(c.id) }} aria-hidden />
                <input
                  defaultValue={c.nome}
                  onBlur={(e) => rinomina('committente', c.id, e.target.value, () => patchCommittente(c.id, { nome: e.target.value.trim() }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`Nome committente ${c.nome}`}
                  className="min-w-[160px] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:outline-none"
                />
                {c.codice && (
                  <span className="font-mono text-xs text-[var(--brand-text-muted)]" title="Codice di runtime: collega il contratto a interventi, tassonomia e flussi operatore">
                    {c.codice}
                  </span>
                )}
                {!c.attivo && <Badge variant="idle">Disattivo</Badge>}
                <Button size="sm" variant="outline" onClick={() => setNuovoContratto(c)} disabled={busy}>
                  <Plus size={14} aria-hidden />
                  Contratto
                </Button>
                <Button size="sm" variant="ghost" onClick={() => eliminaCommittente(c)} disabled={busy} aria-label={`Elimina committente ${c.nome}`}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </header>

              {(c.contratti ?? []).length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--brand-text-muted)]">
                  Nessun contratto per questo committente.
                </p>
              ) : (
                <div className="divide-y divide-[var(--brand-border)]">
                  {(c.contratti ?? []).map((k) => (
                    <BloccoContratto
                      key={k.id}
                      committente={c}
                      contratto={k}
                      prezzi={prezziPerContratto.get(k.id) ?? []}
                      attivita={c.codice ? (attivitaPerCodice[c.codice] ?? []) : []}
                      territories={territories}
                      oggi={oggi}
                      busy={busy}
                      onRinomina={(nome) => rinomina('contratto', k.id, nome, () => patchContratto(c.id, k.id, { nome: nome.trim() }))}
                      onValidita={(campo, v) => patchValidita(c, k, campo, v)}
                      onToggle={() => toggleContratto(c, k)}
                      onElimina={() => eliminaContratto(c, k)}
                      onAddTerritorio={(nome, reset) => aggiungiTerritorio(c, k, nome, reset)}
                      onRinominaTerritorio={(t, nome) => rinomina('territorio', t.id, nome, () => patchTerritorio(c, k, t, { nome: nome.trim() }))}
                      onCollegaTerritorio={(t, tid) => collegaTerritorio(c, k, t, tid)}
                      onEliminaTerritorio={(t) => eliminaTerritorio(c, k, t)}
                      onNuovoPrezzo={() => setNuovoPrezzo(k)}
                      onSalvaPrezzo={salvaPrezzo}
                      onEliminaPrezzo={eliminaPrezzo}
                    />
                  ))}
                </div>
              )}
            </section>
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

      <DialogNuovoPrezzo
        contratto={nuovoPrezzo}
        busy={busy}
        onClose={() => setNuovoPrezzo(null)}
        onCreato={(riga) => { setPrezzi((prev) => [...prev, riga]); setNuovoPrezzo(null); }}
      />
    </div>
  );
}

/* ── Contratto: le quattro sezioni ─────────────────────────────────────────── */

type BloccoProps = {
  committente: Committente;
  contratto: Contratto;
  prezzi: RigaListino[];
  attivita: AttivitaContratto[];
  territories: { id: string; name: string }[];
  oggi: string;
  busy: boolean;
  onRinomina: (nome: string) => void;
  onValidita: (campo: 'valido_dal' | 'valido_al', valore: string) => void;
  onToggle: () => void;
  onElimina: () => void;
  onAddTerritorio: (nome: string, reset: () => void) => void;
  onRinominaTerritorio: (t: ContrattoTerritorio, nome: string) => void;
  onCollegaTerritorio: (t: ContrattoTerritorio, territoryId: string) => void;
  onEliminaTerritorio: (t: ContrattoTerritorio) => void;
  onNuovoPrezzo: () => void;
  onSalvaPrezzo: (r: RigaListino, prezzo: string) => void;
  onEliminaPrezzo: (r: RigaListino) => void;
};

function BloccoContratto(p: BloccoProps) {
  const { contratto: k, oggi, busy } = p;
  const stato = STATO[statoContratto(k, oggi)];
  const senzaFlusso = p.attivita.filter((a) => !a.flusso).length;

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={k.nome}
          onBlur={(e) => p.onRinomina(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label={`Nome contratto ${k.nome}`}
          className="min-w-[180px] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:outline-none"
        />
        <Badge variant={stato.variant}>{stato.label}</Badge>
        <label className="flex items-center gap-1 text-xs text-[var(--brand-text-muted)]">
          dal
          <Input
            type="date"
            defaultValue={k.valido_dal ?? ''}
            onBlur={(e) => p.onValidita('valido_dal', e.target.value)}
            className="w-[9.5rem] py-1 text-xs"
            aria-label="Inizio validità"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--brand-text-muted)]">
          al
          <Input
            type="date"
            defaultValue={k.valido_al ?? ''}
            onBlur={(e) => p.onValidita('valido_al', e.target.value)}
            className="w-[9.5rem] py-1 text-xs"
            aria-label="Fine validità"
          />
        </label>
        <Button size="sm" variant="ghost" onClick={p.onToggle} disabled={busy}>
          {k.attivo ? 'Sospendi' : 'Riattiva'}
        </Button>
        <Button size="sm" variant="ghost" onClick={p.onElimina} disabled={busy} aria-label={`Elimina contratto ${k.nome}`}>
          <Trash2 size={14} aria-hidden />
        </Button>
      </div>

      <div className="grid gap-4 min-[1100px]:grid-cols-2">
        {/* — Territori di copertura — */}
        <Sezione titolo="Territori di copertura">
          <ul className="space-y-1">
            {k.territori.length === 0 && (
              <li className="py-1 text-xs text-[var(--brand-text-muted)]">Nessun territorio coperto.</li>
            )}
            {k.territori.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <MapPin size={14} className="shrink-0 text-[var(--brand-text-subtle)]" aria-hidden />
                <input
                  defaultValue={t.nome}
                  onBlur={(e) => p.onRinominaTerritorio(t, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-label={`Nome territorio ${t.nome}`}
                  className="min-w-[100px] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border)] focus:border-[var(--brand-primary)] focus:outline-none"
                />
                <Select
                  value={t.territory_id ?? ''}
                  onChange={(e) => p.onCollegaTerritorio(t, e.target.value)}
                  disabled={busy}
                  className="w-[11rem] py-1 text-xs"
                  aria-label={`Territorio di pianificazione per ${t.nome}`}
                >
                  <option value="">— non pianificato —</option>
                  {p.territories.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => p.onEliminaTerritorio(t)} disabled={busy} aria-label={`Elimina ${t.nome}`}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <AggiungiTerritorio busy={busy} onAdd={p.onAddTerritorio} />
          <p className="text-xs text-[var(--brand-text-subtle)]">
            La tendina collega il comune al territorio di pianificazione di cronoprogramma e mappa.
          </p>
        </Sezione>

        {/* — Prezzi — */}
        <Sezione
          titolo="Prezzi"
          azione={
            <Button size="sm" variant="outline" onClick={p.onNuovoPrezzo} disabled={busy}>
              <Plus size={14} aria-hidden />
              Tariffa
            </Button>
          }
        >
          {p.prezzi.length === 0 ? (
            <p className="text-xs text-[var(--brand-text-muted)]">Nessuna tariffa a listino.</p>
          ) : (
            <ul className="space-y-1">
              {p.prezzi.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[120px] flex-1 truncate text-sm text-[var(--brand-text-main)]" title={r.etichetta ?? ''}>
                    {r.etichetta}
                    {r.azione_chiave && (
                      <Badge variant="primary" className="ml-1.5">extra · {r.azione_chiave}</Badge>
                    )}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={String(r.prezzo)}
                    onBlur={(e) => p.onSalvaPrezzo(r, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-24 py-1 text-right font-mono text-xs tabular-nums"
                    aria-label={`Prezzo ${r.etichetta}`}
                  />
                  <span className="font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                    {euro(r.prezzo)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => p.onEliminaPrezzo(r)} disabled={busy} aria-label={`Elimina tariffa ${r.etichetta}`}>
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[var(--brand-text-subtle)]">
            Una tariffa per attività; le righe marcate <em>extra</em> si sommano quando l&apos;operatore
            spunta quell&apos;azione nel rapportino.
          </p>
        </Sezione>

        {/* — Attività + flusso operatore — */}
        <div className="min-[1100px]:col-span-2">
          <Sezione
            titolo="Attività e azioni operatore"
            azione={
              <Link
                href="/impostazioni/azioni-operatori"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
              >
                Configura le azioni
                <ExternalLink size={12} aria-hidden />
              </Link>
            }
          >
            {senzaFlusso > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--status-warn)]">
                <TriangleAlert size={13} aria-hidden />
                {senzaFlusso === 1 ? "Un'attività non ha" : `${senzaFlusso} attività non hanno`} un flusso di
                azioni: gli operatori non saprebbero cosa compilare.
              </p>
            )}
            {p.attivita.length === 0 ? (
              <p className="text-xs text-[var(--brand-text-muted)]">
                {p.committente.codice
                  ? 'Nessuna attività censita in tassonomia per questo committente.'
                  : 'Committente senza codice di runtime: non ha ancora lavorazioni a sistema.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {p.attivita.map((a) => (
                  <li key={a.gruppo} className="rounded-[var(--radius-md)] border border-[var(--brand-border)] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[var(--brand-text-main)]">{a.gruppo}</span>
                      {a.flusso ? (
                        <Badge variant="ok">
                          <Workflow size={11} aria-hidden className="mr-1 inline" />
                          {a.flusso}
                        </Badge>
                      ) : (
                        <Badge variant="warn">Nessun flusso</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
                      {a.descrizioni.join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-[var(--brand-text-subtle)]">
              Le attività si gestiscono in{' '}
              <Link href="/impostazioni/attivita-tassonomia" className="text-[var(--brand-primary)] hover:underline">
                Tassonomia attività
              </Link>
              : qui si vedono insieme al contratto per non perderne nessuna.
            </p>
          </Sezione>
        </div>
      </div>
    </div>
  );
}

function Sezione({ titolo, azione, children }: { titolo: string; azione?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-[var(--radius-lg)] bg-[var(--brand-surface-muted)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{titolo}</h3>
        {azione}
      </div>
      {children}
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

function DialogNuovoPrezzo({
  contratto, busy, onClose, onCreato,
}: {
  contratto: Contratto | null;
  busy: boolean;
  onClose: () => void;
  onCreato: (riga: RigaListino) => void;
}) {
  const [etichetta, setEtichetta] = useState('');
  const [prezzo, setPrezzo] = useState('0');
  const [azione, setAzione] = useState('');
  const [dal, setDal] = useState('');
  const [salvando, setSalvando] = useState(false);

  const crea = async () => {
    if (!contratto || salvando) return;
    if (!etichetta.trim()) { toast.error('Attività richiesta.'); return; }
    const validoDal = dal || contratto.valido_dal || new Date().toISOString().slice(0, 10);
    setSalvando(true);
    try {
      const json = await chiama('POST', {
        tipo: 'listino',
        contrattoId: contratto.id,
        etichetta: etichetta.trim(),
        prezzo: Number(prezzo.replace(',', '.')) || 0,
        azione_chiave: azione.trim() || null,
        valido_dal: validoDal,
      });
      onCreato(json.riga as RigaListino);
      setEtichetta(''); setPrezzo('0'); setAzione(''); setDal('');
      toast.success('Tariffa aggiunta.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={contratto !== null}
      onClose={onClose}
      title="Nuova tariffa"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Annulla</Button>
          <Button size="sm" onClick={crea} loading={salvando || busy}>Aggiungi</Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Attività</span>
          <Input autoFocus value={etichetta} onChange={(e) => setEtichetta(e.target.value)} placeholder="es. Sostituzione misuratore" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Prezzo €</span>
            <Input type="number" step="0.01" min="0" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Valido dal</span>
            <Input type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">
            Extra su azione <span className="font-normal">(facoltativo)</span>
          </span>
          <Input value={azione} onChange={(e) => setAzione(e.target.value)} placeholder="es. saracinesca" />
          <span className="mt-1 block text-xs text-[var(--brand-text-subtle)]">
            Chiave dell&apos;azione del rapportino che fa scattare l&apos;extra. Vuoto = tariffa della voce base.
          </span>
        </label>
      </div>
    </Dialog>
  );
}
