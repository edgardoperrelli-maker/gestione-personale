'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import Button from '@/components/Button';
import Input from '@/components/Input';
import MultiSelect from '@/components/ui/MultiSelect';
import Skeleton from '@/components/ui/Skeleton';
import { LOBBY, realtimeClient, type Richiesta } from '@/lib/assistenza/transport';
import SessionePanel from './SessionePanel';

type RapportinoOggi = { sid: string; staff: string; data: string; stato: string };
type Sessione = { sid: string; staff: string; data: string };

/**
 * Modulo back office "Assistenza". Multi-sessione: l'admin può avviare più assistenze in
 * parallelo. Due modi di iniziare: (1) risponde a una richiesta arrivata dall'operatore
 * (lobby), (2) sceglie un rapportino del giorno corrente e invia lui la richiesta.
 */
export default function AssistenzaClient() {
  const [rapportini, setRapportini] = useState<RapportinoOggi[]>([]);
  const [richieste, setRichieste] = useState<Record<string, Richiesta>>({});
  const [sessioni, setSessioni] = useState<Sessione[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const lobbyRef = useRef<RealtimeChannel | null>(null);

  const carica = useCallback(async () => {
    setCaricamento(true);
    setErrore(null);
    try {
      const res = await fetch('/api/admin/assistenza/rapportini-oggi', { cache: 'no-store' });
      if (!res.ok) throw new Error('Caricamento non riuscito');
      const json = (await res.json()) as { rapportini: RapportinoOggi[] };
      setRapportini(json.rapportini ?? []);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  // lobby: richieste in arrivo dagli operatori
  useEffect(() => {
    const cli = realtimeClient();
    if (!cli) return;
    const ch = cli.channel(LOBBY);
    lobbyRef.current = ch;
    ch.on('broadcast', { event: 'richiesta' }, ({ payload }) => {
      const r = payload as Richiesta;
      setRichieste((prev) => ({ ...prev, [r.sid]: r }));
    });
    ch.on('broadcast', { event: 'ritira' }, ({ payload }) => {
      const sid = (payload as { sid: string }).sid;
      setRichieste((prev) => {
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    });
    ch.subscribe();
    return () => { cli.removeChannel(ch); lobbyRef.current = null; };
  }, []);

  const apri = useCallback((s: Sessione, origine: 'backoffice' | 'operatore' = 'backoffice') => {
    setSessioni((prev) => (prev.some((x) => x.sid === s.sid) ? prev : [...prev, s]));
    setRichieste((prev) => {
      const next = { ...prev };
      delete next[s.sid];
      return next;
    });
    // audit best-effort (non blocca l'assistenza se la migration non è applicata)
    void fetch('/api/admin/assistenza/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sid: s.sid, staff: s.staff, data: s.data, origine }),
    }).catch(() => { /* no-op */ });
  }, []);

  const chiudi = useCallback((sid: string) => {
    setSessioni((prev) => prev.filter((x) => x.sid !== sid));
  }, []);

  const richiesteList = Object.values(richieste).sort((a, b) => b.at - a.at);
  const env = realtimeClient() !== null;

  // filtri (niente lista intera per default): operatori (multiselect a esclusione) + ricerca
  const [filtroOp, setFiltroOp] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const operatoriOptions = useMemo(() => {
    const nomi = Array.from(new Set(rapportini.map((r) => r.staff))).sort((a, b) => a.localeCompare(b));
    return nomi.map((n) => ({ value: n, label: n }));
  }, [rapportini]);
  const filtroAttivo = filtroOp.length > 0 || q.trim() !== '';
  const rapportiniFiltrati = useMemo(() => {
    if (!filtroAttivo) return [];
    const needle = q.trim().toLowerCase();
    return rapportini.filter((r) => {
      if (filtroOp.length > 0 && !filtroOp.includes(r.staff)) return false;
      if (needle && !r.staff.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rapportini, filtroOp, q, filtroAttivo]);

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--brand-text-main)]">Assistenza</h1>
          <p className="text-sm text-[var(--brand-text-muted)]">
            Assisti gli operatori sul rapportino, in diretta e in sola lettura. Sessioni multiple in parallelo.
          </p>
        </div>
        <Button size="sm" onClick={carica} loading={caricamento}>
          Aggiorna
        </Button>
      </div>

      {!env && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--status-warn)]/40 bg-[var(--status-warn-soft)] p-3 text-sm text-[var(--brand-text-main)]">
          Servizio realtime non disponibile su questo ambiente (variabili Supabase mancanti).
        </div>
      )}

      {/* richieste in arrivo */}
      {richiesteList.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)]/30 p-4 shadow-[var(--shadow-sm)]">
          <div className="mb-2 text-sm font-semibold">Richieste in arrivo</div>
          <div className="flex flex-col gap-2">
            {richiesteList.map((r) => (
              <div key={r.sid} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2">
                <div className="text-sm"><b>{r.staff}</b> <span className="font-mono text-[var(--brand-text-muted)] tabular-nums">· {r.data}</span></div>
                <Button size="sm" variant="primary" onClick={() => apri({ sid: r.sid, staff: r.staff, data: r.data }, 'operatore')}>
                  Apri
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* sessioni aperte */}
      {sessioni.length > 0 && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sessioni.map((s) => (
            <SessionePanel key={s.sid} sid={s.sid} staff={s.staff} data={s.data} onClose={() => chiudi(s.sid)} />
          ))}
        </section>
      )}

      {/* rapportini del giorno — con filtri, niente lista intera per default */}
      <section className="rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="text-sm font-semibold text-[var(--brand-text-main)]">Rapportini di oggi</div>
          <span className="font-mono text-xs text-[var(--brand-text-muted)] tabular-nums">{rapportini.length} totali</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <MultiSelect
              label="Operatori"
              ariaLabel="Filtra per operatore"
              options={operatoriOptions}
              values={filtroOp}
              onChange={setFiltroOp}
              disabled={caricamento || rapportini.length === 0}
            />
            <div className="w-48">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca operatore…"
                aria-label="Cerca operatore"
              />
            </div>
            {filtroAttivo && (
              <button type="button" onClick={() => { setFiltroOp([]); setQ(''); }}
                className="rounded-[var(--radius-sm)] text-xs text-[var(--brand-text-muted)] underline hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">azzera</button>
            )}
          </div>
        </div>

        {caricamento ? (
          <div className="flex flex-col gap-2 py-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : errore ? (
          <div className="py-4 text-sm text-[var(--status-ko)]">{errore}</div>
        ) : rapportini.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun rapportino per oggi.</div>
        ) : !filtroAttivo ? (
          <div className="py-8 text-center text-sm text-[var(--brand-text-muted)]">
            Scegli un operatore dal filtro o cerca per nome per avviare l&apos;assistenza.
          </div>
        ) : rapportiniFiltrati.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun operatore corrisponde al filtro.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rapportiniFiltrati.map((r) => {
              const aperta = sessioni.some((x) => x.sid === r.sid);
              return (
                <div key={r.sid} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-bg)] px-3 py-2">
                  <div className="text-sm">
                    <b>{r.staff}</b>
                    <span className="ml-2 rounded-full border border-[var(--brand-border)] px-2 py-0.5 text-[11px] text-[var(--brand-text-muted)]">{r.stato}</span>
                  </div>
                  <Button size="sm" variant="primary" disabled={aperta || !env}
                    onClick={() => apri({ sid: r.sid, staff: r.staff, data: r.data })}>
                    {aperta ? 'Aperta' : 'Assisti'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
