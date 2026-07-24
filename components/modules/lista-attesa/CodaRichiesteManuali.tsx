'use client';

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md
 * designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Coda «Richieste manuali». Allineamento Cockpit: testa non più duplicata dalla
 * ListaAttesaNav (il titolo lo dà l'h1), toolbar di stato con conteggio mono +
 * pallino live, pill presa-in-carico → primitivo Badge, icona lucide su Aggiorna,
 * un solo livello di card bordata (il pannello di revisione perde la sua cornice,
 * vive dentro la riga). Rotte/feed realtime/azioni invariati.
 */

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { PannelloRevisioneRichiesta } from './PannelloRevisioneRichiesta';
import { useRichiesteManualiFeed } from '@/lib/interventi/manuali/useRichiesteManualiFeed';
import { statoPresaInCarico } from '@/lib/interventi/manuali/etichettaPresaInCarico';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';
import { formatDataIt, formatOraIt } from '@/lib/interventi/manuali/formatDataIt';
import { datiAnagraficaCoda, filtraCoda } from '@/lib/interventi/manuali/filtraCoda';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
import type { TassonomiaRiga } from '@/lib/attivita/tassonomia';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';

export function CodaRichiesteManuali({
  infoCampi,
  infoCampiPerCommittente,
  campiPerCommittente,
  userId,
  adminNomi,
  tassonomia,
}: {
  infoCampi: TemplateInfoCampo[];
  infoCampiPerCommittente: Partial<Record<CommittenteManuale, TemplateInfoCampo[]>>;
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  userId: string;
  adminNomi: Record<string, string>;
  /** Tassonomia attività: alimenta la select obbligatoria nel pannello di revisione (spec §7). */
  tassonomia?: TassonomiaRiga[];
}) {
  const { richieste, count, live, refresh } = useRichiesteManualiFeed();
  const [aperta, setAperta] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState('');
  const [filtroOperatore, setFiltroOperatore] = useState('');
  const [filtroCommittente, setFiltroCommittente] = useState('');
  const [filtroAttivita, setFiltroAttivita] = useState('');

  const operatori = useMemo(() => {
    const m = new Map<string, string>();
    richieste.forEach((r) => { if (r.staff_id) m.set(r.staff_id, r.staff_name ?? r.staff_id); });
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [richieste]);
  const committenti = useMemo(() => [...new Set(richieste.map((r) => r.committente))].sort(), [richieste]);
  const attivita = useMemo(
    () => [...new Set(richieste.map((r) => datiAnagraficaCoda(r).attivita).filter(Boolean))].sort(),
    [richieste],
  );

  const filtrate = useMemo(
    () => filtraCoda(richieste, { ricerca, operatore: filtroOperatore, committente: filtroCommittente, attivita: filtroAttivita }),
    [richieste, ricerca, filtroOperatore, filtroCommittente, filtroAttivita],
  );
  const filtroAttivo = ricerca.trim() !== '' || filtroOperatore !== '' || filtroCommittente !== '' || filtroAttivita !== '';

  const prendi = async (id: string, override = false) => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/interventi-manuali/${id}/prendi`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ override }),
      });
      await refresh();
    } finally { setBusyId(null); }
  };
  const rilascia = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/admin/interventi-manuali/${id}/rilascia`, { method: 'POST' });
      await refresh();
    } finally { setBusyId(null); }
  };

  return (
    <section aria-label="Richieste manuali" className="space-y-3">
      {/* Toolbar di stato: conteggio in attesa (mono) + pallino live + Aggiorna.
          Il titolo lo porta l'h1 della ListaAttesaNav: qui niente h2 duplicato. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-[var(--brand-text-muted)]">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${live ? 'bg-[var(--status-ok)]' : 'bg-[var(--status-idle)]'}`}
            title={live ? 'Realtime attivo' : 'Realtime non attivo (polling)'}
          />
          <span>
            <span className="font-mono font-semibold tabular-nums text-[var(--brand-text-main)]">
              {filtroAttivo ? `${filtrate.length} di ${count}` : count}
            </span>{' '}
            in attesa
          </span>
        </p>
        <Button variant="secondary" size="sm" animated={false} onClick={() => void refresh()}>
          <RefreshCw size={15} aria-hidden /> Aggiorna
        </Button>
      </div>

      {/* Ricerca + filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca via, matricola, ODS…"
          className="min-w-[200px] flex-1 py-1.5 text-xs"
        />
        <Select
          value={filtroOperatore}
          onChange={(e) => setFiltroOperatore(e.target.value)}
          className="py-1.5 text-xs"
        >
          <option value="">Tutti gli operatori</option>
          {operatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </Select>
        <Select
          value={filtroCommittente}
          onChange={(e) => setFiltroCommittente(e.target.value)}
          className="py-1.5 text-xs"
        >
          <option value="">Tutti i committenti</option>
          {committenti.map((c) => <option key={c} value={c}>{etichettaCommittente(c)}</option>)}
        </Select>
        <Select
          value={filtroAttivita}
          onChange={(e) => setFiltroAttivita(e.target.value)}
          className="py-1.5 text-xs"
        >
          <option value="">Tutte le attività</option>
          {attivita.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>

      {richieste.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta in attesa.</p>
      ) : filtrate.length === 0 ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Nessuna richiesta per i filtri selezionati.</p>
      ) : (
        <ul className="space-y-1.5">
          {filtrate.map((r) => {
            const presa = statoPresaInCarico(r.preso_in_carico_da, userId, adminNomi);
            const busy = busyId === r.id;
            const dati = datiAnagraficaCoda(r);
            return (
              <li
                key={r.id}
                className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)]"
              >
                {/* Row collapsed: ~36px */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setAperta((a) => (a === r.id ? null : r.id))}
                    className="flex flex-col items-start gap-0.5 rounded-[var(--radius-sm)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  >
                    <span className="text-sm font-semibold text-[var(--brand-text-main)]">
                      {r.staff_name ?? r.staff_id} · {etichettaCommittente(r.committente)}
                    </span>
                    {(dati.via || dati.matricola) && (
                      <span className="text-xs text-[var(--brand-text-main)]">
                        {dati.via}
                        {dati.via && dati.matricola && ' · '}
                        {dati.matricola && (
                          <>matr. <span className="font-mono tabular-nums">{dati.matricola}</span></>
                        )}
                      </span>
                    )}
                    <span className="text-xs font-medium text-[var(--brand-text-muted)]">
                      <span className="font-mono tabular-nums">{formatDataIt(r.data)}</span> · inviata{' '}
                      <span className="font-mono tabular-nums">{formatOraIt(r.created_at)}</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {presa.etichetta && (
                      <Badge variant={presa.miaPresa ? 'primary' : 'muted'}>{presa.etichetta}</Badge>
                    )}
                    {presa.mostraPrendi && (
                      <Button variant="primary" size="sm" animated={false} disabled={busy} onClick={() => void prendi(r.id)}>
                        Prendi
                      </Button>
                    )}
                    {presa.mostraRilascia && (
                      <Button variant="secondary" size="sm" animated={false} disabled={busy} onClick={() => void rilascia(r.id)}>
                        Rilascia
                      </Button>
                    )}
                    {presa.mostraOverride && (
                      <Button variant="danger" size="sm" animated={false} disabled={busy} onClick={() => void prendi(r.id, true)}>
                        Override
                      </Button>
                    )}
                  </div>
                </div>
                {aperta === r.id && (
                  <div className="border-t border-[var(--brand-border)] px-3 pb-3 pt-2.5">
                    <PannelloRevisioneRichiesta
                      riga={r}
                      infoCampi={infoCampiPerCommittente[r.committente] ?? infoCampi}
                      campiEsito={campiPerCommittente[r.committente] ?? []}
                      tassonomia={tassonomia}
                      onDecisa={() => { setAperta(null); void refresh(); }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
