'use client';

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md
 * designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Registro autorizzazioni (vista gemella della coda). Allineamento Cockpit: testa
 * non più duplicata dalla ListaAttesaNav (toolbar con conteggio mono + Esporta),
 * glifi (⇩ export, ▾/▸ dettagli, → range date) → icone lucide, celle numeriche
 * (data, matricola, approvato il) in font-mono tabular-nums. Stato via primitivo
 * Badge già in uso. Fetch/CSV/filtri invariati.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Download, Undo2 } from 'lucide-react';
import { filtraRegistro, type FiltriRegistro } from '@/lib/interventi/manuali/filtraRegistro';
import { STATI_RICHIESTA } from '@/lib/interventi/manuali/types';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
import { attivitaUnificataDisplay } from '@/lib/attivita/attivitaDisplay';
import { formatDataIt, formatDataOraIt } from '@/lib/interventi/manuali/formatDataIt';
import { campiFoto } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { datiAnagraficaCoda } from '@/lib/interventi/manuali/filtraCoda';
import { RecuperoFotoRichiesta } from './RecuperoFotoRichiesta';
import { datiFormRevisione } from '@/lib/interventi/manuali/datiFormRevisione';
import { INFO_CAMPI_DISPONIBILI } from '@/utils/rapportini/infoCampi';
import type { RigaRichiesta, CommittenteManuale, StatoRichiesta } from '@/lib/interventi/manuali/types';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { daAssegnare } from '@/lib/interventi/manuali/daAssegnare';
import { riapribile } from '@/lib/interventi/manuali/riaperturaRifiuto';

const labelCls = 'text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

/** Mapping stato richiesta → badge colorato (verde = approvato, rosso = rifiutato, ecc.). */
const STATO_META: Record<StatoRichiesta, { variant: BadgeVariant; label: string }> = {
  in_attesa:   { variant: 'warn',     label: 'In attesa' },
  approvato:   { variant: 'ok',       label: 'Approvato' },
  rifiutato:   { variant: 'ko',       label: 'Rifiutato' },
  auto_liberi: { variant: 'progress', label: 'Auto liberi' },
  annullato:   { variant: 'idle',     label: 'Annullato' },
};

function StatoBadge({ stato }: { stato: StatoRichiesta }) {
  const m = STATO_META[stato] ?? { variant: 'muted' as BadgeVariant, label: String(stato) };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function toCsv(righe: RigaRichiesta[]): string {
  const head = ['Data', 'Operatore', 'Committente', 'Via', 'Matricola', 'Attività', 'Stato', 'Approvatore', 'Approvato il', 'Note', 'Motivo rifiuto', 'Creato'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = righe.map((r) => {
    const a = datiAnagraficaCoda(r);
    return [
      formatDataIt(r.data),
      r.staff_name ?? r.staff_id,
      etichettaCommittente(r.committente),
      a.via,
      a.matricola,
      a.attivita,
      r.stato,
      r.deciso_da_name ?? '',
      formatDataOraIt(r.deciso_at),
      r.note,
      r.motivo_rifiuto,
      formatDataOraIt(r.created_at),
    ]
      .map(esc)
      .join(',');
  });
  return [head.join(','), ...rows].join('\r\n');
}

/** Valore leggibile di un campo esito per la vista read-only del registro. */
function formatValoreEsito(campo: TemplateCampo, v: unknown): string {
  if (campo.tipo === 'crocetta') return v === true || v === 'true' || v === 'SI' || v === 'X' || v === 1 ? 'SI' : '—';
  const s = v === null || v === undefined ? '' : String(v);
  return s.trim() === '' ? '—' : s;
}

/** Dettaglio read-only di una richiesta espandendo la riga: anagrafica + esiti + note + foto. */
function DettaglioRiga({ riga, campiEsito }: { riga: RigaRichiesta; campiEsito: TemplateCampo[] }) {
  const dati = datiFormRevisione(riga);
  const anagrafiche = INFO_CAMPI_DISPONIBILI
    .map((c) => ({ chiave: c.chiave, etichetta: c.etichettaDefault, valore: ((dati.anagrafica as Record<string, string>)[c.chiave] ?? '').trim() }))
    .filter((a) => a.valore !== '');
  const esiti = campiEsito.filter((c) => c.tipo !== 'foto');
  return (
    <div className="space-y-3">
      {anagrafiche.length > 0 && (
        <div className="space-y-1">
          <p className={labelCls}>Anagrafica</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 md:grid-cols-3">
            {anagrafiche.map((a) => (
              <div key={a.chiave} className="min-w-0">
                <span className="block truncate text-xs uppercase tracking-wide text-[var(--brand-text-muted)]">{a.etichetta}</span>
                <span className="text-sm text-[var(--brand-text-main)]">{a.valore}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {esiti.length > 0 && (
        <div className="space-y-1">
          <p className={labelCls}>Esiti</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 md:grid-cols-3">
            {esiti.map((c) => (
              <div key={c.chiave} className="min-w-0">
                <span className="block truncate text-xs uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</span>
                <span className="text-sm text-[var(--brand-text-main)]">{formatValoreEsito(c, dati.risposte[c.chiave])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {riga.note && (
        <div className="space-y-1">
          <p className={labelCls}>Note</p>
          <p className="text-sm text-[var(--brand-text-main)]">{riga.note}</p>
        </div>
      )}
      <div className="space-y-1">
        <p className={labelCls}>Foto</p>
        <RecuperoFotoRichiesta richiestaId={riga.id} slotFoto={campiFoto(campiEsito)} />
      </div>
    </div>
  );
}

export function RegistroAutorizzazioni({ campiPerCommittente }: { campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>> }) {
  const [righe, setRighe] = useState<RigaRichiesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [apertaId, setApertaId] = useState<string | null>(null);
  const [filtri, setFiltri] = useState<FiltriRegistro>({ operatore: '', stato: '', committente: '', from: '', to: '', ricerca: '' });
  // Coda «da assegnare»: filtro DERIVATO, non un valore di `stato`. L'approvazione è la
  // decisione dell'ufficio, l'assegnazione sul sistema del committente è un fatto esterno.
  const [soloDaAssegnare, setSoloDaAssegnare] = useState(false);
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [registrando, setRegistrando] = useState(false);
  // Riga il cui rifiuto si sta annullando: la conferma sta qui perché è l'unico punto
  // dell'app in cui una richiesta rifiutata è ancora raggiungibile (la coda mostra solo le
  // `in_attesa`, e dopo il rifiuto la pratica esce di lì).
  const [daRiaprire, setDaRiaprire] = useState<RigaRichiesta | null>(null);
  const [riaprendo, setRiaprendo] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/interventi-manuali?stato=tutti', { cache: 'no-store' });
      const j = res.ok ? ((await res.json()) as { richieste?: RigaRichiesta[] }) : { richieste: [] };
      setRighe(j.richieste ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void carica();
  }, [carica]);

  const operatori = useMemo(() => {
    const m = new Map<string, string>();
    righe.forEach((r) => {
      if (r.staff_id) m.set(r.staff_id, r.staff_name ?? r.staff_id);
    });
    return [...m.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [righe]);

  const filtrate = useMemo(() => {
    const base = filtraRegistro(righe, filtri);
    return soloDaAssegnare ? base.filter(daAssegnare) : base;
  }, [righe, filtri, soloDaAssegnare]);

  // La selezione vive solo sulle righe visibili e ancora da assegnare: cambiare filtro non
  // deve lasciare in memoria righe che non si vedono più (si spunterebbero alla cieca).
  const selezionabili = useMemo(() => filtrate.filter(daAssegnare).map((r) => r.id), [filtrate]);
  const selezionati = useMemo(() => selezionabili.filter((id) => selezione.has(id)), [selezionabili, selezione]);

  const registraAssegnati = async () => {
    if (selezionati.length === 0) return;
    if (!window.confirm(`Segnare ${selezionati.length} ${selezionati.length === 1 ? 'ordine' : 'ordini'} come assegnati sul sistema del committente?`)) return;
    setRegistrando(true);
    try {
      const res = await fetch('/api/admin/interventi-manuali/da-assegnare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selezionati }),
      });
      const j = (await res.json().catch(() => ({}))) as { registrate?: number; error?: string };
      if (!res.ok) { toast.error(j.error ?? 'Registrazione non riuscita.'); return; }
      // Il server dice quante hanno cambiato stato DAVVERO: se qualcuno ha spuntato le stesse
      // righe nel frattempo, il numero è più basso e va detto invece che nascosto.
      const n = j.registrate ?? 0;
      if (n < selezionati.length) toast.success(`${n} di ${selezionati.length} registrati: le altre erano già assegnate.`);
      else toast.success(`${n} ${n === 1 ? 'ordine registrato' : 'ordini registrati'}.`);
      setSelezione(new Set());
      await carica();
    } finally {
      setRegistrando(false);
    }
  };

  /** Annulla un rifiuto sbagliato: la richiesta torna in coda «in attesa», da approvare a mano. */
  const riapri = async () => {
    if (!daRiaprire) return;
    setRiaprendo(true);
    try {
      const res = await fetch(`/api/admin/interventi-manuali/${daRiaprire.id}/riapri`, { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        // `gia_gestita` = qualcuno l'ha già rimessa in coda (o decisa) nel frattempo: il
        // registro qui è una fotografia, e dirlo è meglio di un generico "non riuscito".
        toast.error(j.error === 'gia_gestita'
          ? 'Richiesta già ripresa da un altro utente: aggiorna il registro.'
          : 'Riapertura non riuscita.');
        return;
      }
      toast.success('Richiesta riaperta: è tornata in coda, in attesa di approvazione.');
      setDaRiaprire(null);
      await carica();
    } finally {
      setRiaprendo(false);
    }
  };

  const esporta = () => {
    const blob = new Blob([toCsv(filtrate)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registro-autorizzazioni-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Registro autorizzazioni" className="space-y-3">
      {/* Toolbar: conteggio risultati (mono) + Esporta. Il titolo lo porta l'h1
          della ListaAttesaNav: qui niente h2 duplicato. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--brand-text-muted)]">
          <span className="font-mono font-semibold tabular-nums text-[var(--brand-text-main)]">
            {filtrate.length}
          </span>{' '}
          {filtrate.length === 1 ? 'richiesta' : 'richieste'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Coda «da assegnare»: approvati che l'ufficio non ha ancora registrato sul
              sistema del committente. Su AcquaLatina l'assegnazione si fa a mano. */}
          <Button
            variant={soloDaAssegnare ? 'primary' : 'secondary'}
            size="sm"
            animated={false}
            aria-pressed={soloDaAssegnare}
            onClick={() => { setSoloDaAssegnare((v) => !v); setSelezione(new Set()); }}
          >
            Da assegnare
            <span className="ml-1.5 font-mono tabular-nums">{righe.filter(daAssegnare).length}</span>
          </Button>
          {soloDaAssegnare && (
            <>
              <Button
                variant="secondary"
                size="sm"
                animated={false}
                disabled={filtrate.length === 0}
                onClick={() => { window.location.href = `/api/admin/interventi-manuali/da-assegnare${filtri.committente ? `?committente=${encodeURIComponent(filtri.committente)}` : ''}`; }}
              >
                <Download size={15} aria-hidden /> Esporta XLSX
              </Button>
              <Button
                variant="primary"
                size="sm"
                animated={false}
                loading={registrando}
                disabled={selezionati.length === 0 || registrando}
                onClick={() => void registraAssegnati()}
              >
                Segna come assegnati
                {selezionati.length > 0 && <span className="ml-1.5 font-mono tabular-nums">{selezionati.length}</span>}
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            animated={false}
            disabled={filtrate.length === 0}
            onClick={esporta}
          >
            <Download size={15} aria-hidden /> Esporta CSV
          </Button>
        </div>
      </div>

      {/* Ricerca + filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Cerca via, matricola, ODL"
          value={filtri.ricerca ?? ''}
          onChange={(e) => setFiltri((f) => ({ ...f, ricerca: e.target.value }))}
          placeholder="Cerca via, matricola, ODL&hellip;"
          className="w-full py-1.5 text-xs"
        />
        <Select
          value={filtri.operatore}
          onChange={(e) => setFiltri((f) => ({ ...f, operatore: e.target.value }))}
          className="py-1.5 text-xs"
        >
          <option value="">Tutti gli operatori</option>
          {operatori.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Select>
        <Select
          value={filtri.stato}
          onChange={(e) => setFiltri((f) => ({ ...f, stato: e.target.value }))}
          className="py-1.5 text-xs"
        >
          <option value="">Tutti gli stati</option>
          {STATI_RICHIESTA.map((s) => (
            <option key={s} value={s}>
              {STATO_META[s]?.label ?? s}
            </option>
          ))}
        </Select>
        <Select
          value={filtri.committente}
          onChange={(e) => setFiltri((f) => ({ ...f, committente: e.target.value }))}
          className="py-1.5 text-xs"
        >
          <option value="">Tutti i committenti</option>
          <option value="acea">Acea</option>
          <option value="italgas">Italgas</option>
          <option value="altro">Altro</option>
          <option value="lim_massive">Limitazioni massive</option>
        </Select>
        <div className="flex w-full items-center gap-2 sm:max-w-sm">
          <Input
            type="date"
            aria-label="Dal"
            value={filtri.from}
            max={filtri.to || undefined}
            onChange={(e) => setFiltri((f) => ({ ...f, from: e.target.value }))}
            className="min-w-0 flex-1 py-1.5 text-xs"
          />
          <ArrowRight size={14} aria-hidden className="shrink-0 text-[var(--brand-text-muted)]" />
          <Input
            type="date"
            aria-label="Al"
            value={filtri.to}
            min={filtri.from || undefined}
            onChange={(e) => setFiltri((f) => ({ ...f, to: e.target.value }))}
            className="min-w-0 flex-1 py-1.5 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Caricamento&hellip;</p>
      ) : filtrate.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta per i filtri selezionati.</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]">
              <tr>
                {/* Colonna di selezione: compare solo nella coda «da assegnare», dove serve.
                    Fuori di lì sarebbe una casella che non fa niente. */}
                {soloDaAssegnare && (
                  <th className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      aria-label="Seleziona tutti gli ordini da assegnare"
                      checked={selezionabili.length > 0 && selezionati.length === selezionabili.length}
                      ref={(el) => { if (el) el.indeterminate = selezionati.length > 0 && selezionati.length < selezionabili.length; }}
                      onChange={(e) => setSelezione(e.target.checked ? new Set(selezionabili) : new Set())}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Data</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Operatore</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Committente</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Via</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Matricola</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Attività</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Stato</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Approvatore</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Approvato il</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Motivo</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Dettagli</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--brand-border)]">
              {filtrate.map((r) => {
                const a = datiAnagraficaCoda(r);
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setApertaId((cur) => (cur === r.id ? null : r.id))}
                      className="cursor-pointer transition hover:bg-[var(--brand-surface-muted)]"
                    >
                      {soloDaAssegnare && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Seleziona ODL di ${r.staff_name ?? r.staff_id}`}
                            checked={selezione.has(r.id)}
                            onChange={(e) => setSelezione((cur) => {
                              const next = new Set(cur);
                              if (e.target.checked) next.add(r.id); else next.delete(r.id);
                              return next;
                            })}
                            className="h-4 w-4 accent-[var(--brand-primary)]"
                          />
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">{formatDataIt(r.data)}</td>
                      <td className="px-3 py-2">{r.staff_name ?? r.staff_id}</td>
                      <td className="px-3 py-2">{etichettaCommittente(r.committente)}</td>
                      <td className="max-w-[200px] truncate px-3 py-2" title={a.via || undefined}>{a.via || '—'}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{a.matricola || '—'}</td>
                      <td className="max-w-[160px] truncate px-3 py-2" title={a.attivita || undefined}>{attivitaUnificataDisplay(a.attivita) || '—'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <StatoBadge stato={r.stato} />
                          {/* Derivato dal timestamp nullo, non un valore di `stato`: l'assegnazione
                              sul sistema del committente e' un fatto esterno, non una decisione. */}
                          {daAssegnare(r) && <Badge variant="warn">Da assegnare</Badge>}
                          {/* Rifiutata per errore: qui accanto al verdetto, che è dove uno se ne
                              accorge. `stopPropagation` perché la riga intera apre i dettagli. */}
                          {riapribile(r.stato) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              animated={false}
                              title="Annulla il rifiuto: la richiesta torna in coda"
                              onClick={(e) => { e.stopPropagation(); setDaRiaprire(r); }}
                            >
                              <Undo2 size={14} aria-hidden /> Riapri
                            </Button>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.deciso_da_name ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-[var(--brand-text-muted)]">{r.deciso_at ? formatDataOraIt(r.deciso_at) : '—'}</td>
                      <td className="px-3 py-2 text-[var(--brand-text-muted)]">{r.motivo_rifiuto ?? ''}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={apertaId === r.id}
                          onClick={(e) => { e.stopPropagation(); setApertaId((cur) => (cur === r.id ? null : r.id)); }}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-xs font-semibold text-[var(--brand-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                        >
                          {apertaId === r.id ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                          {apertaId === r.id ? 'Chiudi' : 'Dettagli'}
                        </button>
                      </td>
                    </tr>
                    {apertaId === r.id && (
                      <tr>
                        <td colSpan={soloDaAssegnare ? 12 : 11} className="bg-[var(--brand-surface-muted)] px-3 py-3">
                          <DettaglioRiga riga={r} campiEsito={campiPerCommittente[r.committente] ?? []} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={daRiaprire !== null}
        title="Riaprire questa richiesta?"
        message={
          <>
            Torna nella coda «Richieste manuali» come <b>in attesa</b>: il rifiuto e il suo motivo
            vengono cancellati e la voce torna «sospesa» sul rapportino dell&apos;operatore, che non
            deve rifare nulla. Da lì la approvi col flusso normale.
          </>
        }
        confirmLabel="Riapri"
        loading={riaprendo}
        onConfirm={() => void riapri()}
        onClose={() => setDaRiaprire(null)}
      />
    </section>
  );
}
