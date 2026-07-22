'use client';

/**
 * PoC — Connessione remota back office ↔ operatore (co-browsing).
 *
 * Route PUBBLICA di TEST (non è nel matcher di middleware.ts, quindi niente login).
 * NON scrive NULLA sul database: il trasporto è Supabase Realtime **broadcast**
 * (pub/sub effimero) + presence. I dati del rapportino sono FINTI e vivono solo nel
 * browser. Serve a valutare dal vivo la via consigliata nello studio di fattibilità
 * (co-browsing / mirroring del DOM), che aggira il blocco di getDisplayMedia su mobile.
 *
 * Ruoli via URL: /r-demo (landing) · /r-demo?role=operatore · /r-demo?role=admin
 * Stessa "sessione" sui due dispositivi = stesso codice (default: "demo").
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

/* ─────────────────────────── Dati finti (nessun DB) ─────────────────────────── */

type Voce = {
  id: string;
  ordine: number;
  nominativo: string;
  via: string;
  comune: string;
  cap: string;
  matricola: string;
  pdr: string;
  odl: string;
  attivita: string;
  accessibilita: string;
  fascia: string;
  notaUfficio?: string;
};

const VOCI: Voce[] = [
  {
    id: 'v1', ordine: 1, nominativo: 'Mario Rossi', via: 'Via Roma 12', comune: 'Labico', cap: '00030',
    matricola: 'AC0012345', pdr: '00912345678', odl: 'ODL-778201', attivita: 'Sostituzione misuratore G4',
    accessibilita: 'Contatore esterno, cancello', fascia: '08:00 – 13:00',
    notaUfficio: 'Cliente disponibile solo di mattina.',
  },
  {
    id: 'v2', ordine: 2, nominativo: 'Giulia Bianchi', via: 'Via Verdi 5', comune: 'Zagarolo', cap: '00039',
    matricola: 'AC0067890', pdr: '00987654321', odl: 'ODL-778202', attivita: 'Verifica limitazione',
    accessibilita: 'Interno, citofono B', fascia: '14:00 – 18:00',
  },
  {
    id: 'v3', ordine: 3, nominativo: 'Antonio Esposito', via: 'Corso Italia 40', comune: 'Labico', cap: '00030',
    matricola: 'AC0055512', pdr: '00911122233', odl: 'ODL-778203', attivita: 'Limitazione massiva',
    accessibilita: 'Nicchia stradale', fascia: '08:00 – 18:00',
    notaUfficio: 'Sigillo precedente manomesso — verificare.',
  },
];

type Esito = '' | 'positivo' | 'negativo';
type VoceStato = { esito: Esito; sigillo: string; lettura: string; saracinesca: boolean; note: string };
const statoVuoto = (): VoceStato => ({ esito: '', sigillo: '', lettura: '', saracinesca: false, note: '' });

type Vista = 'lista' | 'focus';

/** Snapshot completo che l'operatore trasmette al back office (via broadcast). */
type Sync = {
  voci: Voce[]; // già mascherati alla sorgente se redazione attiva
  vista: Vista;
  indice: number;
  redact: boolean;
  per: Record<string, VoceStato>;
  scrollFrac: number;
  t: number;
};

const MASK = '••••••';
function mascheraVoce(v: Voce): Voce {
  return { ...v, nominativo: MASK, via: MASK, matricola: MASK, pdr: MASK };
}

/* ─────────────────────────── Utility ambiente ─────────────────────────── */

function useSupabase(): SupabaseClient | null {
  const ref = useRef<SupabaseClient | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  useEffect(() => {
    if (ref.current) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return; // gestito a UI: mostriamo un avviso
    ref.current = createClient(url, key, { auth: { persistSession: false } });
    setClient(ref.current);
  }, []);
  return client;
}

/* ─────────────────────────── Rapportino (vista condivisa) ─────────────────────────── */

const box = 'rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]';
const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm ' +
  'text-[var(--brand-text-main)] outline-none focus:border-[var(--brand-primary)]';

function badgeEsito(e: Esito) {
  if (e === 'positivo') return { t: 'Positivo', c: 'var(--brand-green)' };
  if (e === 'negativo') return { t: 'Negativo', c: 'var(--brand-magenta)' };
  return { t: 'Da esitare', c: 'var(--brand-text-muted)' };
}

type RapportinoProps = {
  voci: Voce[];
  vista: Vista;
  indice: number;
  per: Record<string, VoceStato>;
  interactive: boolean;
  highlight?: string | null; // campo evidenziato dal back office
  onSetIndice?: (i: number) => void;
  onSetVista?: (v: Vista) => void;
  onPatch?: (id: string, patch: Partial<VoceStato>) => void;
};

function Rapportino({
  voci, vista, indice, per, interactive, highlight, onSetIndice, onSetVista, onPatch,
}: RapportinoProps) {
  const voce = voci[indice] ?? voci[0];
  const stato = per[voce?.id] ?? statoVuoto();
  const dim = interactive ? '' : 'pointer-events-none select-none';

  if (vista === 'lista') {
    return (
      <div className={`flex flex-col gap-3 ${dim}`}>
        {voci.map((v, i) => {
          const b = badgeEsito((per[v.id] ?? statoVuoto()).esito);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => interactive && (onSetIndice?.(i), onSetVista?.('focus'))}
              className={`${box} p-4 text-left transition hover:border-[var(--brand-primary-border)]`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-[var(--brand-text-muted)]">{v.odl}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ color: b.c, border: `1px solid ${b.c}` }}
                >
                  {b.t}
                </span>
              </div>
              <div className="mt-1 text-base font-semibold">{v.nominativo}</div>
              <div className="text-sm text-[var(--brand-text-muted)]">{v.via} · {v.comune}</div>
              <div className="mt-2 text-xs text-[var(--brand-text-muted)]">{v.attivita} · {v.fascia}</div>
            </button>
          );
        })}
      </div>
    );
  }

  // vista focus (dettaglio intervento)
  const field = (key: string, label: string, node: ReactNode) => (
    <label
      className="flex flex-col gap-1"
      style={highlight === key ? { outline: '2px solid var(--brand-gold)', outlineOffset: 4, borderRadius: 10 } : undefined}
    >
      <span className="text-xs font-semibold text-[var(--brand-text-muted)]">{label}</span>
      {node}
    </label>
  );

  return (
    <div className={`flex flex-col gap-4 ${dim}`}>
      <div className="flex items-center gap-2">
        {interactive && (
          <button type="button" onClick={() => onSetVista?.('lista')}
            className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1 text-sm">← Elenco</button>
        )}
        <span className="font-mono text-xs text-[var(--brand-text-muted)]">{voce.odl}</span>
        <span className="ml-auto text-xs text-[var(--brand-text-muted)]">{indice + 1}/{voci.length}</span>
      </div>

      <div className={`${box} flex flex-col gap-3 p-4`}>
        <div className="text-lg font-semibold">{voce.nominativo}</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[11px] text-[var(--brand-text-muted)]">Indirizzo</div>{voce.via}, {voce.comune} {voce.cap}</div>
          <div><div className="text-[11px] text-[var(--brand-text-muted)]">Matricola</div><span className="font-mono">{voce.matricola}</span></div>
          <div><div className="text-[11px] text-[var(--brand-text-muted)]">PDR</div><span className="font-mono">{voce.pdr}</span></div>
          <div><div className="text-[11px] text-[var(--brand-text-muted)]">Attività</div>{voce.attivita}</div>
        </div>
        {voce.notaUfficio && (
          <div className="rounded-lg border border-[var(--brand-gold)]/40 bg-[var(--brand-gold)]/10 px-3 py-2 text-xs">
            <b>Nota ufficio:</b> {voce.notaUfficio}
          </div>
        )}
      </div>

      <div className={`${box} flex flex-col gap-3 p-4`}>
        <div className="text-sm font-semibold">Esito intervento</div>
        <div className="flex gap-2">
          {(['positivo', 'negativo'] as const).map((e) => {
            const on = stato.esito === e;
            const b = badgeEsito(e);
            return (
              <button key={e} type="button"
                onClick={() => interactive && onPatch?.(voce.id, { esito: on ? '' : e })}
                className="flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition"
                style={{ borderColor: on ? b.c : 'var(--brand-border)', color: on ? b.c : 'var(--brand-text-main)', background: on ? `${b.c}18` : 'transparent' }}>
                {b.t}
              </button>
            );
          })}
        </div>

        {field('sigillo', 'N. sigillo apposto',
          <input className={inputCls} value={stato.sigillo}
            onChange={(e) => interactive && onPatch?.(voce.id, { sigillo: e.target.value })}
            placeholder="es. 4471102" />)}

        {field('lettura', 'Lettura misuratore',
          <input className={inputCls} value={stato.lettura} inputMode="numeric"
            onChange={(e) => interactive && onPatch?.(voce.id, { lettura: e.target.value })}
            placeholder="mc" />)}

        <label className="flex items-center gap-2 text-sm"
          style={highlight === 'saracinesca' ? { outline: '2px solid var(--brand-gold)', outlineOffset: 4, borderRadius: 8 } : undefined}>
          <input type="checkbox" checked={stato.saracinesca} className="h-5 w-5"
            style={{ accentColor: 'var(--brand-primary)' }}
            onChange={(e) => interactive && onPatch?.(voce.id, { saracinesca: e.target.checked })} />
          Saracinesca chiusa
        </label>

        {field('note', 'Note operatore',
          <textarea className={`${inputCls} min-h-[64px]`} value={stato.note}
            onChange={(e) => interactive && onPatch?.(voce.id, { note: e.target.value })}
            placeholder="Annotazioni…" />)}

        <div className="rounded-lg border border-dashed border-[var(--brand-border)] px-3 py-4 text-center text-xs text-[var(--brand-text-muted)]">
          📷 Foto (placeholder — non attiva nel test)
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Pagina ─────────────────────────── */

type Role = 'landing' | 'operatore' | 'admin';

export default function RDemoPage() {
  const supabase = useSupabase();
  const [role, setRole] = useState<Role>('landing');
  const [room, setRoom] = useState('demo');
  const [ready, setReady] = useState(false);

  // leggi ruolo/room da URL solo lato client
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('role');
    if (r === 'operatore' || r === 'admin') setRole(r);
    const rm = p.get('room');
    if (rm) setRoom(rm.slice(0, 24));
    setReady(true);
  }, []);

  const envMissing = ready && supabase === null &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!ready) return <Shell><div className="text-sm text-[var(--brand-text-muted)]">Caricamento…</div></Shell>;

  if (role === 'landing') {
    return <Landing room={room} setRoom={setRoom} setRole={setRole} />;
  }

  return (
    <Shell>
      {envMissing && (
        <div className="mb-4 rounded-xl border border-[var(--brand-magenta)]/50 bg-[var(--brand-magenta)]/10 p-3 text-sm">
          ⚠️ Variabili <code>NEXT_PUBLIC_SUPABASE_URL/ANON_KEY</code> non disponibili in questo deploy:
          il canale realtime non può connettersi.
        </div>
      )}
      {role === 'operatore'
        ? <OperatoreView supabase={supabase} room={room} />
        : <AdminView supabase={supabase} room={room} />}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-5">
      {children}
      <footer className="mt-auto pt-4 text-center text-[11px] text-[var(--brand-text-muted)]">
        Modalità test · dati finti · canale effimero Supabase Realtime · nessuna scrittura su database
      </footer>
    </div>
  );
}

function Landing({ room, setRoom, setRole }: { room: string; setRoom: (s: string) => void; setRole: (r: Role) => void }) {
  return (
    <Shell>
      <div className="flex flex-col gap-1">
        <div className="font-mono text-[11px] uppercase tracking-widest text-[var(--brand-primary)]">app gp · PoC</div>
        <h1 className="text-2xl font-bold leading-tight">Test connessione remota</h1>
        <p className="text-sm text-[var(--brand-text-muted)]">
          Apri <b>lato Operatore</b> sul telefono e <b>lato Back office</b> sul computer, con lo stesso codice sessione.
          Il back office vedrà il rapportino dell'operatore dal vivo, dopo il consenso.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-[var(--brand-text-muted)]">Codice sessione (uguale sui due dispositivi)</span>
        <input className={inputCls} value={room} onChange={(e) => setRoom(e.target.value.slice(0, 24))} />
      </label>

      <div className="grid gap-3">
        <button type="button" onClick={() => setRole('operatore')}
          className="rounded-xl bg-[var(--brand-primary)] px-4 py-4 text-left font-semibold text-[oklch(0.16_0.06_245)]">
          📱 Apri come Operatore <span className="block text-xs font-normal opacity-80">(il telefono sul campo)</span>
        </button>
        <button type="button" onClick={() => setRole('admin')}
          className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4 text-left font-semibold">
          🖥️ Apri come Back office <span className="block text-xs font-normal text-[var(--brand-text-muted)]">(admin, guarda e guida)</span>
        </button>
      </div>
      <p className="text-[11px] text-[var(--brand-text-muted)]">
        Suggerimento: sul computer puoi anche aggiungere <code>?role=admin&room={room || 'demo'}</code> all'indirizzo.
      </p>
    </Shell>
  );
}

/* ─────────────────────────── Operatore ─────────────────────────── */

function OperatoreView({ supabase, room }: { supabase: SupabaseClient | null; room: string }) {
  const [vista, setVista] = useState<Vista>('lista');
  const [indice, setIndice] = useState(0);
  const [per, setPer] = useState<Record<string, VoceStato>>(() =>
    Object.fromEntries(VOCI.map((v) => [v.id, statoVuoto()])));
  const [redact, setRedact] = useState(false);
  const [consenso, setConsenso] = useState(false);       // sta condividendo
  const [richiesta, setRichiesta] = useState(false);      // il back office ha chiesto
  const [adminOnline, setAdminOnline] = useState(false);
  const [connesso, setConnesso] = useState(false);
  const [hint, setHint] = useState<{ field: string | null; text: string } | null>(null);

  const chRef = useRef<RealtimeChannel | null>(null);
  const dirty = useRef(true);
  const scrollFrac = useRef(0);

  const patch = useCallback((id: string, p: Partial<VoceStato>) => {
    setPer((prev) => ({ ...prev, [id]: { ...(prev[id] ?? statoVuoto()), ...p } }));
    dirty.current = true;
  }, []);

  const buildSync = useCallback((): Sync => ({
    voci: redact ? VOCI.map(mascheraVoce) : VOCI,
    vista, indice, redact, per, scrollFrac: scrollFrac.current, t: Date.now(),
  }), [redact, vista, indice, per]);

  // marca "dirty" ad ogni cambio di stato osservabile
  useEffect(() => { dirty.current = true; }, [vista, indice, per, redact]);

  // connessione realtime
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`cobrowse:${room}`, {
      config: { broadcast: { self: false }, presence: { key: 'operatore' } },
    });
    chRef.current = ch;
    ch.on('broadcast', { event: 'assist_request' }, () => setRichiesta(true));
    ch.on('broadcast', { event: 'hint' }, ({ payload }) => {
      setHint(payload as { field: string | null; text: string });
      window.setTimeout(() => setHint(null), 4000);
    });
    ch.on('broadcast', { event: 'end_admin' }, () => setAdminOnline(false));
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      setAdminOnline(Object.keys(st).some((k) => k.includes('admin')) ||
        Object.values(st).flat().some((m: unknown) => (m as { role?: string })?.role === 'admin'));
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { setConnesso(true); ch.track({ role: 'operatore', at: Date.now() }); }
    });
    return () => { supabase.removeChannel(ch); chRef.current = null; };
  }, [supabase, room]);

  // trasmissione periodica quando c'è consenso
  useEffect(() => {
    if (!consenso) return;
    dirty.current = true;
    const id = window.setInterval(() => {
      const ch = chRef.current;
      if (!ch || !dirty.current) return;
      dirty.current = false;
      ch.send({ type: 'broadcast', event: 'sync', payload: buildSync() });
    }, 140);
    return () => window.clearInterval(id);
  }, [consenso, buildSync]);

  // scroll → dirty
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      scrollFrac.current = h > 0 ? window.scrollY / h : 0;
      dirty.current = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function accetta() {
    setConsenso(true); setRichiesta(false);
    chRef.current?.send({ type: 'broadcast', event: 'consent', payload: { granted: true } });
  }
  function termina() {
    setConsenso(false);
    chRef.current?.send({ type: 'broadcast', event: 'consent', payload: { granted: false } });
    chRef.current?.send({ type: 'broadcast', event: 'end_op' });
  }

  return (
    <div className="flex flex-col gap-4">
      <Header
        title="Rapportino"
        sub="Operatore · telefono"
        status={connesso ? (consenso ? 'Condivisione attiva' : (adminOnline ? 'Back office in linea' : 'In attesa')) : 'Connessione…'}
        tone={consenso ? 'live' : connesso ? 'idle' : 'wait'}
      />

      {/* handshake consenso */}
      {!consenso && richiesta && (
        <Banner tone="ask">
          <div className="font-semibold">Il back office chiede di assistere questo rapportino.</div>
          <div className="mt-0.5 text-xs opacity-90">Vedrà solo questa schermata, in sola lettura. Puoi interrompere quando vuoi.</div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={accetta}
              className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)]">Accetto</button>
            <button type="button" onClick={() => setRichiesta(false)}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold">Rifiuto</button>
          </div>
        </Banner>
      )}

      {consenso && (
        <Banner tone="live">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">🔴 Stai condividendo con il back office</span>
            <button type="button" onClick={termina}
              className="rounded-lg border border-[var(--brand-magenta)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-magenta)]">Interrompi</button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)}
              className="h-4 w-4" style={{ accentColor: 'var(--brand-gold)' }} />
            Nascondi i dati sensibili (nome, indirizzo, matricola, PDR) al supporto
          </label>
        </Banner>
      )}

      {hint && (
        <Banner tone="hint">💡 Il supporto evidenzia: <b>{hint.text}</b></Banner>
      )}

      <Rapportino
        voci={VOCI} vista={vista} indice={indice} per={per} interactive
        highlight={hint?.field ?? null}
        onSetIndice={setIndice} onSetVista={setVista} onPatch={patch}
      />

      <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-center text-xs text-[var(--brand-text-muted)]">
        Invio disabilitato in modalità test — nessun dato verrà salvato.
      </div>
    </div>
  );
}

/* ─────────────────────────── Back office (admin) ─────────────────────────── */

function AdminView({ supabase, room }: { supabase: SupabaseClient | null; room: string }) {
  const [mirror, setMirror] = useState<Sync | null>(null);
  const [opOnline, setOpOnline] = useState(false);
  const [consenso, setConsenso] = useState(false);
  const [connesso, setConnesso] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const mirrorScroll = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`cobrowse:${room}`, {
      config: { broadcast: { self: false }, presence: { key: 'admin' } },
    });
    chRef.current = ch;
    ch.on('broadcast', { event: 'sync' }, ({ payload }) => {
      const s = payload as Sync;
      setMirror(s);
      setLatency(Math.max(0, Date.now() - s.t));
    });
    ch.on('broadcast', { event: 'consent' }, ({ payload }) => setConsenso(!!(payload as { granted?: boolean }).granted));
    ch.on('broadcast', { event: 'end_op' }, () => { setConsenso(false); setMirror(null); });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      setOpOnline(Object.values(st).flat().some((m: unknown) => (m as { role?: string })?.role === 'operatore'));
    });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { setConnesso(true); ch.track({ role: 'admin', at: Date.now() }); }
    });
    return () => { supabase.removeChannel(ch); chRef.current = null; };
  }, [supabase, room]);

  // applica lo scroll dell'operatore al contenitore mirror
  useEffect(() => {
    const el = mirrorScroll.current;
    if (!el || !mirror) return;
    const h = el.scrollHeight - el.clientHeight;
    el.scrollTop = h * (mirror.scrollFrac || 0);
  }, [mirror]);

  function richiedi() { chRef.current?.send({ type: 'broadcast', event: 'assist_request' }); }
  function evidenzia(field: string | null, text: string) {
    chRef.current?.send({ type: 'broadcast', event: 'hint', payload: { field, text } });
  }

  return (
    <div className="flex flex-col gap-4">
      <Header
        title="Assistenza remota"
        sub="Back office · admin"
        status={connesso ? (consenso ? 'Sessione attiva' : (opOnline ? 'Operatore in linea' : 'Operatore offline')) : 'Connessione…'}
        tone={consenso ? 'live' : connesso ? 'idle' : 'wait'}
      />

      {!consenso && (
        <Banner tone="ask">
          <div className="text-sm">
            {opOnline ? 'Operatore in linea.' : 'In attesa che l\'operatore apra la sessione…'}
          </div>
          <button type="button" onClick={richiedi} disabled={!opOnline}
            className="mt-2 rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-40">
            Richiedi assistenza
          </button>
        </Banner>
      )}

      {consenso && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand-green)]/40 bg-[var(--brand-green)]/10 px-3 py-2 text-xs">
          <span className="font-semibold text-[var(--brand-green)]">● Live</span>
          {latency != null && <span className="text-[var(--brand-text-muted)]">latenza ~{latency} ms</span>}
          {mirror?.redact && <span className="rounded bg-[var(--brand-gold)]/20 px-1.5 py-0.5 text-[var(--brand-gold)]">dati mascherati dall'operatore</span>}
          <span className="ml-auto text-[var(--brand-text-muted)]">sola lettura</span>
        </div>
      )}

      {/* strumenti di guida */}
      {consenso && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-[var(--brand-text-muted)]">Guida l'operatore →</span>
          <button type="button" onClick={() => evidenzia('sigillo', 'N. sigillo apposto')} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs">Evidenzia “Sigillo”</button>
          <button type="button" onClick={() => evidenzia('saracinesca', 'Saracinesca chiusa')} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs">Evidenzia “Saracinesca”</button>
          <button type="button" onClick={() => evidenzia(null, 'controlla la nota ufficio')} className="rounded-md border border-[var(--brand-border)] px-2 py-1 text-xs">Manda nota</button>
        </div>
      )}

      {/* mirror */}
      <div ref={mirrorScroll} className="max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3">
        {consenso && mirror
          ? <Rapportino voci={mirror.voci} vista={mirror.vista} indice={mirror.indice} per={mirror.per} interactive={false} />
          : <div className="py-16 text-center text-sm text-[var(--brand-text-muted)]">
              {consenso ? 'In attesa del primo aggiornamento…' : 'La copia dello schermo operatore comparirà qui dopo il consenso.'}
            </div>}
      </div>
      <p className="text-[11px] text-[var(--brand-text-muted)]">
        Questa è una <b>ricostruzione del DOM</b> trasmessa via Supabase Realtime, non una cattura schermo:
        è esattamente il meccanismo che funziona su iPhone. Non vedi altre app o schermate di sistema.
      </p>
    </div>
  );
}

/* ─────────────────────────── UI comuni ─────────────────────────── */

function Header({ title, sub, status, tone }: { title: string; sub: string; status: string; tone: 'live' | 'idle' | 'wait' }) {
  const c = tone === 'live' ? 'var(--brand-green)' : tone === 'idle' ? 'var(--brand-primary)' : 'var(--brand-text-muted)';
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-lg font-bold leading-tight">{title}</div>
        <div className="text-xs text-[var(--brand-text-muted)]">{sub}</div>
      </div>
      <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
        style={{ borderColor: c, color: c }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />
        {status}
      </span>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'ask' | 'live' | 'hint'; children: ReactNode }) {
  const map = {
    ask: 'border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)]/40',
    live: 'border-[var(--brand-magenta)]/50 bg-[var(--brand-magenta)]/10',
    hint: 'border-[var(--brand-gold)]/50 bg-[var(--brand-gold)]/10',
  } as const;
  return <div className={`rounded-xl border p-3 text-sm ${map[tone]}`}>{children}</div>;
}
