'use client';

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md
 * designed-as-app · pre-emit critique: P5 H5 E5 S4 R5 V4
 *
 * Torre di controllo live: rail-filtri operatori a sinistra, banco mappa+dettaglio
 * a destra. Il modulo precedeva il sistema Cockpit: l'allineamento ha portato la
 * testa a ObjectHeader (badge Live nel ribbon, un solo primario «Esporta» + comandi
 * di ripristino dopo separatore), un'apertura a KpiStrip sui contatori del giorno
 * (numeri già esposti dal motore, mai inventati), <input date> → DatePicker,
 * <select> → primitivo Select, i comandi grezzi → Button, gli emoji dei contatori
 * per-operatore → pallini --status-* con numeri mono, raggi in scala, ring
 * focus-visible e aria-pressed sui filtri. Fetch/realtime/logica mappa invariati.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { coloreStato, raggruppaPerOperatore, filtraInterventi, operatoriVisibili, rigaDettaglio, ordinaPerChiusura, SENTINELLA_NON_ASSEGNATI, type TonoTorre } from '@/lib/interventi/torreView';
import { labelStato } from '@/lib/interventi/interventiView';
import { useInterventiFeed, type TorreIntervento } from '@/lib/interventi/useInterventiFeed';
import { EsportaExcelButton } from './EsportaExcelButton';
import { toast } from '@/components/ui/Toast';
import ObjectHeader from '@/components/ui/ObjectHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import { KpiCard, KpiStrip } from '@/components/ui/KpiCard';

export type { TorreIntervento };

const TorreMappa = dynamic(() => import('./TorreMappa'), { ssr: false });

const TONO: Record<TonoTorre, { fg: string; dot: string; label: string; bg: string }> = {
  ok: { fg: 'var(--success)', dot: 'var(--status-ok)', label: 'Fatto', bg: 'var(--success-soft)' },
  ko: { fg: 'var(--danger)', dot: 'var(--status-ko)', label: 'Non fatto', bg: 'var(--danger-soft)' },
  attesa: { fg: 'var(--brand-text-main)', dot: 'var(--status-warn)', label: 'Da fare', bg: 'var(--warning-soft)' },
  corso: { fg: 'var(--brand-text-main)', dot: 'var(--status-progress)', label: 'In corso', bg: 'var(--status-progress-soft)' },
  annullato: { fg: 'var(--brand-text-muted)', dot: 'var(--status-idle)', label: 'Annullato', bg: 'var(--brand-surface-muted)' },
  da_assegnare: { fg: 'var(--brand-text-muted)', dot: 'var(--status-idle)', label: 'Da assegnare', bg: 'var(--brand-surface-muted)' },
};

/** Ora locale italiana HH:MM dell'inserimento esito (chiuso_at). */
function oraEsito(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
}

export default function LiveClient({
  data,
  minData,
  maxData,
  interventi,
  operatori,
  territori,
}: {
  data: string;
  minData: string;
  maxData: string;
  interventi: TorreIntervento[];
  operatori: { id: string; display_name: string }[];
  territori: { id: string; name: string }[];
}) {
  const { items, live, lastUpdate, refresh } = useInterventiFeed(data, {
    channelPrefix: 'torre',
    initialItems: interventi,
  });
  const [selStaff, setSelStaff] = useState<string | null>(null);
  const [selTerr, setSelTerr] = useState<string | null>(null);
  const [filtroStato, setFiltroStato] = useState<'tutti' | 'ok' | 'ko' | 'attesa'>('tutti');
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [rigenerando, setRigenerando] = useState(false);
  const risincronizza = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/interventi/risincronizza?data=${data}`, { method: 'POST' });
      if (res.ok) await refresh();
    } catch {
      /* ignora: l'utente può ritentare */
    } finally {
      setSyncing(false);
    }
  };
  const [confermaRigenera, setConfermaRigenera] = useState(false);
  const rigenera = () => setConfermaRigenera(true);
  const eseguiRigenera = async () => {
    setRigenerando(true);
    try {
      const res = await fetch(`/api/interventi/rigenera-giorno?data=${data}`, { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as {
        creati?: number;
        preservati?: number;
        scartati?: number;
        piani?: number;
        error?: string;
      };
      if (res.ok) {
        await refresh();
        toast.success(`Rigenerati: ${j.creati ?? 0} creati, ${j.preservati ?? 0} preservati${j.scartati ? `, ${j.scartati} scartati` : ''} su ${j.piani ?? 0} piani.`);
      } else {
        toast.error(`Rigenerazione non riuscita — ${j.error ?? res.status}.`);
      }
    } catch {
      toast.error('Errore di rete nella rigenerazione.');
    } finally {
      setRigenerando(false);
      setConfermaRigenera(false);
    }
  };

  const itemsTerr = filtraInterventi(items, selTerr, null);
  const gruppi = raggruppaPerOperatore(itemsTerr, operatori);
  const gruppiVisibili = operatoriVisibili(gruppi, selTerr);
  const totali = items.reduce(
    (acc, it) => {
      const t = coloreStato(it.stato, it.esito);
      if (t === 'ok') acc.fatti += 1;
      else if (t === 'ko') acc.nonFatti += 1;
      else if (t === 'attesa') acc.daFare += 1;
      return acc;
    },
    { fatti: 0, nonFatti: 0, daFare: 0 },
  );

  // La mappa mostra gli interventi dell'operatore selezionato (filtro), o tutti.
  const itemsMappa = filtraInterventi(items, selTerr, selStaff);
  const nomeSel = selStaff
    ? gruppi.find((g) => (g.operatore.id ?? SENTINELLA_NON_ASSEGNATI) === selStaff)?.operatore.display_name
    : null;

  const contaLista = itemsMappa.reduce(
    (acc, it) => {
      const t = coloreStato(it.stato, it.esito);
      if (t === 'ok') acc.ok += 1;
      else if (t === 'ko') acc.ko += 1;
      else if (t === 'attesa') acc.attesa += 1;
      return acc;
    },
    { ok: 0, ko: 0, attesa: 0 },
  );
  const itemsLista = ordinaPerChiusura(
    filtroStato === 'tutti' ? itemsMappa : itemsMappa.filter((it) => coloreStato(it.stato, it.esito) === filtroStato),
  );

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <ObjectHeader
        title="Live"
        sub={<span className="font-mono tabular-nums">{data}</span>}
        ribbon={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: live ? 'var(--status-ok-soft)' : 'var(--brand-surface-muted)',
                color: live ? 'var(--status-ok)' : 'var(--brand-text-muted)',
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: live ? 'var(--status-ok)' : 'var(--status-idle)' }} />
              {live ? 'Live' : 'Non connesso'}
            </span>
            {lastUpdate && (
              <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                agg. <span className="font-mono tabular-nums">{lastUpdate}</span>
              </span>
            )}
          </div>
        }
        actions={
          <>
            <DatePicker
              value={data}
              onChange={(iso) => iso && router.push(`/hub/live?data=${iso}`)}
              min={minData}
              max={maxData}
              ariaLabel="Giorno"
            />
            <EsportaExcelButton defaultData={data} maxData={maxData} selStaff={selStaff} selTerr={selTerr} filtroStato={filtroStato} />
            <span className="mx-0.5 h-6 w-px" style={{ backgroundColor: 'var(--brand-border)' }} aria-hidden />
            <Button
              variant="outline"
              onClick={() => void risincronizza()}
              loading={syncing}
              title="Ri-aggancia le voci e riapplica gli esiti dei rapportini già compilati"
            >
              {syncing ? 'Sincronizzo…' : 'Risincronizza esiti'}
            </Button>
            <Button
              variant="outline"
              onClick={() => void rigenera()}
              loading={rigenerando}
              title="Ricrea gli interventi del giorno dai task salvati dei piani (ripristino), preservando i completati"
            >
              {rigenerando ? 'Rigenero…' : 'Rigenera interventi'}
            </Button>
          </>
        }
      />

      <KpiStrip>
        <KpiCard label="Interventi" value={items.length} tone="primary" />
        <KpiCard label="Fatti" value={totali.fatti} tone="ok" />
        <KpiCard label="Non fatti" value={totali.nonFatti} tone="ko" />
        <KpiCard label="Da fare" value={totali.daFare} tone="warn" />
      </KpiStrip>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Colonna sinistra: operatori come filtri, scrollabile */}
        <div className="space-y-2.5 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1">
          {territori.length > 0 && (
            <Select
              value={selTerr ?? ''}
              onChange={(e) => {
                setSelTerr(e.target.value || null);
                setSelStaff(null);
              }}
              aria-label="Territorio"
            >
              <option value="">Tutti i territori</option>
              {territori.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          )}
          {gruppiVisibili.map((g) => {
            const opKey = g.operatore.id ?? SENTINELLA_NON_ASSEGNATI;
            const sel = selStaff === opKey;
            return (
              <button
                key={opKey}
                type="button"
                aria-pressed={sel}
                onClick={() => setSelStaff((p) => (p === opKey ? null : opKey))}
                className="w-full rounded-[var(--radius-lg)] border p-3 text-left transition hover:border-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                style={{
                  borderColor: sel ? 'var(--brand-primary)' : 'var(--brand-border)',
                  backgroundColor: sel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                  boxShadow: sel ? '0 0 0 1px var(--brand-primary)' : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                    {g.operatore.display_name}
                  </span>
                  <div className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums" style={{ color: 'var(--brand-text-muted)' }}>
                    <span className="inline-flex items-center gap-1" title="Da fare">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--status-warn)' }} />
                      {g.conteggi.assegnati}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Fatti">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--status-ok)' }} />
                      {g.conteggi.fatti}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Non fatti">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--status-ko)' }} />
                      {g.conteggi.nonFatti}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Colonna destra: mappa filtrata, resta visibile mentre scorri */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:h-fit">
          {selStaff && (
            <div
              className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--primary-text)' }}
            >
              <span className="font-semibold">Filtro mappa: {nomeSel}</span>
              <button
                type="button"
                onClick={() => setSelStaff(null)}
                className="rounded-[var(--radius-sm)] font-medium underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                Mostra tutti
              </button>
            </div>
          )}
          <TorreMappa interventi={itemsMappa} />

          {/* Dettaglio lavori (operatore selezionato o tutti): righe colorate, live. */}
          <section className="rounded-[var(--radius-xl)] border" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}>
            <header
              className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
            >
              <span className="truncate">{nomeSel ? `Dettaglio lavori — ${nomeSel}` : 'Tutti i lavori'}</span>
              <span className="shrink-0 font-mono text-xs font-medium tabular-nums" style={{ color: 'var(--brand-text-muted)' }}>{itemsMappa.length}</span>
            </header>
            <div className="flex flex-wrap gap-1.5 border-b px-3 py-2" style={{ borderColor: 'var(--brand-border)' }}>
              {([
                { key: 'tutti', label: 'Tutti', n: itemsMappa.length },
                { key: 'ok', label: 'Fatti', n: contaLista.ok },
                { key: 'ko', label: 'Non fatti', n: contaLista.ko },
                { key: 'attesa', label: 'Da fare', n: contaLista.attesa },
              ] as const).map((c) => {
                const active = filtroStato === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFiltroStato(c.key)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                    style={{
                      borderColor: active ? 'var(--brand-primary)' : 'var(--brand-border)',
                      backgroundColor: active ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                      color: active ? 'var(--primary-text)' : 'var(--brand-text-muted)',
                    }}
                  >
                    {c.label} <span className="font-mono tabular-nums">{c.n}</span>
                  </button>
                );
              })}
            </div>
            <ul className="max-h-[360px] divide-y divide-[var(--brand-border)] overflow-y-auto">
              {itemsLista.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessun lavoro.</li>
              ) : (
                itemsLista.map((it) => {
                  const tono = TONO[coloreStato(it.stato, it.esito)];
                  const ko = it.stato === 'completato' && it.esito !== 'eseguito_positivo';
                  const riga = rigaDettaglio(it);
                  return (
                    <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm" style={{ backgroundColor: tono.bg }}>
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 self-start rounded-full" style={{ backgroundColor: tono.dot }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium" style={{ color: 'var(--brand-text-main)' }}>{riga.primario}</span>
                          {it.chiuso_at && (
                            <span className="shrink-0 font-mono text-xs font-normal tabular-nums" style={{ color: 'var(--brand-text-muted)' }}>{oraEsito(it.chiuso_at)}</span>
                          )}
                        </div>
                        {riga.secondario && (
                          <div className="truncate text-xs" style={{ color: 'var(--brand-text-muted)' }}>{riga.secondario}</div>
                        )}
                        {ko && it.esito_motivo && (
                          <div className="truncate text-xs" style={{ color: tono.fg }}>{it.esito_motivo}</div>
                        )}
                      </div>
                      <span className="shrink-0 self-start text-xs font-medium" style={{ color: tono.fg }}>
                        {it.stato === 'completato' ? tono.label : labelStato(it.stato)}
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confermaRigenera}
        title="Rigenerare gli interventi del giorno?"
        message="Ricrea gli assegnati dai task della distribuzione dei piani salvati e preserva i completati."
        confirmLabel="Rigenera"
        loading={rigenerando}
        onConfirm={eseguiRigenera}
        onClose={() => setConfermaRigenera(false)}
      />
    </main>
  );
}
