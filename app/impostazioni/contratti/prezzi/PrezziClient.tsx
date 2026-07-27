'use client';
/* Vista PREZZI del modulo Contratti (§7bis) — il listino di TUTTE le commesse in
 * una tabella densa con header sticky (§9), invece di due righe annegate dentro
 * la scheda di ogni contratto. Chi deve battere le tariffe le vede tutte insieme. */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Badge from '@/components/Badge';
import Select from '@/components/ui/Select';
import Dialog from '@/components/ui/Dialog';
import { chiediConferma } from '@/components/ui/chiediConferma';
import { toast } from '@/components/ui/Toast';
import ContrattiNav from '../ContrattiNav';
import type { RigaListino } from '@/lib/contratti/tipi';

const API = '/api/admin/contratti';

/** Contratto in forma piatta: la tabella mostra la commessa, non la gerarchia. */
export type ContrattoOpzione = { id: string; etichetta: string; valido_dal: string | null };

async function chiama(method: string, body?: object, qs = ''): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${qs}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? 'Operazione non riuscita.');
  return json;
}

const euro = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const giorno = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function PrezziClient({
  initial,
  contratti,
}: {
  initial: RigaListino[];
  contratti: ContrattoOpzione[];
}) {
  const [righe, setRighe] = useState<RigaListino[]>(initial);
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [nuova, setNuova] = useState(false);

  const nomeContratto = useMemo(
    () => new Map(contratti.map((k) => [k.id, k.etichetta])),
    [contratti],
  );

  const visibili = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    const ordinate = [...righe].sort((a, b) => {
      const ka = nomeContratto.get(a.contratto_id ?? '') ?? '';
      const kb = nomeContratto.get(b.contratto_id ?? '') ?? '';
      return ka.localeCompare(kb, 'it', { sensitivity: 'base' })
        || (a.etichetta ?? '').localeCompare(b.etichetta ?? '', 'it', { sensitivity: 'base' });
    });
    if (!f) return ordinate;
    return ordinate.filter((r) =>
      `${nomeContratto.get(r.contratto_id ?? '') ?? ''} ${r.etichetta ?? ''} ${r.azione_chiave ?? ''}`
        .toLowerCase()
        .includes(f),
    );
  }, [righe, filtro, nomeContratto]);

  const daFissare = righe.filter((r) => r.prezzo === 0).length;

  const conErrore = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Errore.'); }
    finally { setBusy(false); }
  };

  const salvaPrezzo = (r: RigaListino, valore: string) => conErrore(async () => {
    const n = Number(valore.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) { toast.error('Prezzo non valido.'); return; }
    if (n === r.prezzo) return;
    await chiama('PATCH', { tipo: 'listino', id: r.id, prezzo: n });
    setRighe((prev) => prev.map((x) => (x.id === r.id ? { ...x, prezzo: n } : x)));
    toast.success('Prezzo aggiornato.');
  })();

  const elimina = (r: RigaListino) => conErrore(async () => {
    const ok = await chiediConferma({
      title: `Eliminare la tariffa ${r.etichetta}?`, confirmLabel: 'Elimina', danger: true,
    });
    if (!ok) return;
    await chiama('DELETE', undefined, `?tipo=listino&id=${r.id}`);
    setRighe((prev) => prev.filter((x) => x.id !== r.id));
  })();

  return (
    <div className="space-y-4">
      <ContrattiNav
        attiva="prezzi"
        azioni={
          <Button size="sm" onClick={() => setNuova(true)} disabled={contratti.length === 0}>
            <Plus size={14} aria-hidden />
            Nuova tariffa
          </Button>
        }
      />

      {daFissare > 0 && (
        <p className="rounded-[var(--radius-lg)] border border-[var(--status-warn)]/40 bg-[var(--status-warn-soft)] px-4 py-2.5 text-sm text-[var(--brand-text-main)]">
          {daFissare === 1 ? 'Una tariffa è a € 0,00' : `${daFissare} tariffe sono a € 0,00`}: la produzione
          le conteggia a zero finché non hai messo il prezzo di capitolato.
        </p>
      )}

      <Input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Cerca per commessa, attività o extra…"
        aria-label="Cerca nel listino"
        className="max-w-md"
      />

      {righe.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessuna tariffa a listino.
        </div>
      ) : (
        <div className="max-h-[min(32rem,calc(100dvh-24rem))] overflow-auto overscroll-contain rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)]">
          <table className="min-w-full divide-y divide-[var(--brand-border)] text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--brand-surface-muted)]">
              <tr>
                {['Commessa', 'Attività', 'Prezzo', 'Dal', 'Al', ''].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--brand-text-muted)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--brand-border)]">
              {visibili.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--brand-surface-muted)]">
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--brand-text-muted)]">
                    {nomeContratto.get(r.contratto_id ?? '') ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[var(--brand-text-main)]">{r.etichetta}</span>
                    {r.azione_chiave && (
                      <Badge variant="primary" className="ml-1.5">extra · {r.azione_chiave}</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={String(r.prezzo)}
                        onBlur={(e) => salvaPrezzo(r, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-24 py-1 text-right font-mono text-xs tabular-nums"
                        aria-label={`Prezzo di ${r.etichetta}`}
                      />
                      <span className="font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                        {euro(r.prezzo)}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                    {giorno(r.valido_dal)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                    {giorno(r.valido_al)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => elimina(r)} disabled={busy} aria-label={`Elimina tariffa ${r.etichetta}`}>
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
              {visibili.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--brand-text-muted)]">
                    Nessuna tariffa corrisponde alla ricerca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--brand-text-subtle)]">
        Una tariffa per attività; le righe marcate <em>extra</em> si sommano quando l&apos;operatore
        spunta quell&apos;azione nel rapportino.
      </p>

      <DialogNuovaTariffa
        aperto={nuova}
        contratti={contratti}
        onClose={() => setNuova(false)}
        onCreata={(riga) => { setRighe((prev) => [...prev, riga]); setNuova(false); }}
      />
    </div>
  );
}

function DialogNuovaTariffa({
  aperto, contratti, onClose, onCreata,
}: {
  aperto: boolean;
  contratti: ContrattoOpzione[];
  onClose: () => void;
  onCreata: (riga: RigaListino) => void;
}) {
  const [contrattoId, setContrattoId] = useState(contratti[0]?.id ?? '');
  const [etichetta, setEtichetta] = useState('');
  const [prezzo, setPrezzo] = useState('0');
  const [azione, setAzione] = useState('');
  const [dal, setDal] = useState('');
  const [salvando, setSalvando] = useState(false);

  const crea = async () => {
    if (salvando) return;
    if (!contrattoId) { toast.error('Commessa richiesta.'); return; }
    if (!etichetta.trim()) { toast.error('Attività richiesta.'); return; }
    const k = contratti.find((x) => x.id === contrattoId);
    const validoDal = dal || k?.valido_dal || new Date().toISOString().slice(0, 10);
    setSalvando(true);
    try {
      const json = await chiama('POST', {
        tipo: 'listino',
        contrattoId,
        etichetta: etichetta.trim(),
        prezzo: Number(prezzo.replace(',', '.')) || 0,
        azione_chiave: azione.trim() || null,
        valido_dal: validoDal,
      });
      onCreata(json.riga as RigaListino);
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
      open={aperto}
      onClose={onClose}
      title="Nuova tariffa"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Annulla</Button>
          <Button size="sm" onClick={crea} loading={salvando}>Aggiungi</Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Commessa</span>
          <Select value={contrattoId} onChange={(e) => setContrattoId(e.target.value)}>
            {contratti.map((k) => <option key={k.id} value={k.id}>{k.etichetta}</option>)}
          </Select>
        </label>
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
