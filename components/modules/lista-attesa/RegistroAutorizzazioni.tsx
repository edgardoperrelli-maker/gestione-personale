'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { filtraRegistro, type FiltriRegistro } from '@/lib/interventi/manuali/filtraRegistro';
import { STATI_RICHIESTA } from '@/lib/interventi/manuali/types';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
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
  const [filtri, setFiltri] = useState<FiltriRegistro>({ operatore: '', stato: '', committente: '', from: '', to: '' });

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

  const filtrate = useMemo(() => filtraRegistro(righe, filtri), [righe, filtri]);

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
    <section className="space-y-3">
      {/* Header: h2 dominante + Esporta */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-[var(--brand-text-main)]">Registro autorizzazioni</h2>
        <Button
          variant="secondary"
          size="sm"
          animated={false}
          disabled={filtrate.length === 0}
          onClick={esporta}
        >
          &#8615; Esporta CSV
        </Button>
      </div>

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2">
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
        <Input
          type="date"
          aria-label="Dal"
          value={filtri.from}
          max={filtri.to || undefined}
          onChange={(e) => setFiltri((f) => ({ ...f, from: e.target.value }))}
          className="py-1.5 text-xs"
        />
        <span className="text-xs text-[var(--brand-text-muted)]">&rarr;</span>
        <Input
          type="date"
          aria-label="Al"
          value={filtri.to}
          min={filtri.from || undefined}
          onChange={(e) => setFiltri((f) => ({ ...f, to: e.target.value }))}
          className="py-1.5 text-xs"
        />
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
                      <td className="whitespace-nowrap px-3 py-2">{formatDataIt(r.data)}</td>
                      <td className="px-3 py-2">{r.staff_name ?? r.staff_id}</td>
                      <td className="px-3 py-2">{etichettaCommittente(r.committente)}</td>
                      <td className="max-w-[200px] truncate px-3 py-2" title={a.via || undefined}>{a.via || '—'}</td>
                      <td className="px-3 py-2">{a.matricola || '—'}</td>
                      <td className="max-w-[160px] truncate px-3 py-2" title={a.attivita || undefined}>{a.attivita || '—'}</td>
                      <td className="px-3 py-2"><StatoBadge stato={r.stato} /></td>
                      <td className="px-3 py-2">{r.deciso_da_name ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-[var(--brand-text-muted)]">{r.deciso_at ? formatDataOraIt(r.deciso_at) : '—'}</td>
                      <td className="px-3 py-2 text-[var(--brand-text-muted)]">{r.motivo_rifiuto ?? ''}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-text-muted)]">
                          <span aria-hidden>{apertaId === r.id ? '▾' : '▸'}</span>
                          {apertaId === r.id ? 'Chiudi' : 'Dettagli'}
                        </span>
                      </td>
                    </tr>
                    {apertaId === r.id && (
                      <tr>
                        <td colSpan={11} className="bg-[var(--brand-surface-muted)] px-3 py-3">
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
    </section>
  );
}
