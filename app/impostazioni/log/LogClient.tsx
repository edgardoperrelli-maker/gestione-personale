'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import Input from '@/components/Input';
import ObjectHeader from '@/components/ui/ObjectHeader';

type Riga = {
  id: string;
  fonte: 'accesso' | 'azione';
  occorso_il: string;
  utente_id: string | null;
  utente_email: string | null;
  azione: string;
  entita: string | null;
  entita_id: string | null;
  esito: string | null;
  ip: string | null;
  dettaglio: Record<string, unknown>;
};

type Utente = { id: string; email: string };

/** Etichette leggibili: nel registro l'azione è un nome puntato, qui diventa una frase. */
const ETICHETTE: Record<string, string> = {
  login: 'Accesso',
  logout: 'Uscita',
  token_refreshed: 'Sessione rinnovata',
  token_revoked: 'Sessione revocata',
  user_modified: 'Utenza modificata',
  user_signedup: 'Utenza creata',
  user_deleted: 'Utenza eliminata',
  user_updated_password: 'Password cambiata',
  'piano.crea': 'Piano creato',
  'piano.salva': 'Piano salvato',
  'piano.elimina': 'Piano ELIMINATO',
  'piano.residuo.elimina': 'Piano residuo eliminato (anti-duplicato)',
  'piano.operatore.rimuovi': 'Operatore rimosso dal piano',
  'rapportino.orfano.elimina': 'Rapportino eliminato (operatore fuori dal piano)',
  'rapportino.conflitto.sostituisci': 'Rapportino sostituito (conflitto)',
  'ordine.top': 'Ordini segnati/tolti da TOP',
};

/**
 * Le azioni che distruggono. Si colorano di rosso perché sono le uniche che, sbagliate, non si
 * annullano: è da qui che si parte quando qualcosa è sparito.
 */
const DISTRUTTIVE = new Set([
  'piano.elimina',
  'piano.residuo.elimina',
  'piano.operatore.rimuovi',
  'rapportino.orfano.elimina',
  'rapportino.conflitto.sostituisci',
  'user_deleted',
]);

const ORA_ITALIANA: Intl.DateTimeFormatOptions = {
  timeZone: 'Europe/Rome',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
};

function quando(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('it-IT', ORA_ITALIANA);
}

/** `u_mara.boccia@local.it` → `mara.boccia`: il dominio interno è rumore in tabella. */
function nomeUtente(email: string | null): string {
  if (!email) return '—';
  return email.replace(/^u_/, '').replace(/@local(\.it)?$/, '');
}

function oggi(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function giorniFa(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

/**
 * Riassunto in una riga di cosa ha toccato l'azione. Sono le chiavi che `registraAzione`
 * scrive di più: se c'è dell'altro, resta il JSON completo sotto «Dettaglio».
 */
function riassunto(r: Riga): string | null {
  const d = r.dettaglio ?? {};
  const pezzi: string[] = [];
  const num = (k: string): number | null => (typeof d[k] === 'number' ? (d[k] as number) : null);

  if (d.piano_data || d.data) pezzi.push(`giorno ${String(d.piano_data ?? d.data)}`);
  if (d.piano_territorio || d.territorio) pezzi.push(String(d.piano_territorio ?? d.territorio));

  const nRap = num('n_rapportini_eliminati') ?? num('n_rapportini');
  if (nRap !== null && nRap > 0) pezzi.push(`${nRap} rapportini`);
  const nInviati = num('n_rapportini_inviati');
  if (nInviati !== null && nInviati > 0) pezzi.push(`${nInviati} già inviati`);

  const nInt = num('n_interventi_eliminati') ?? num('n_interventi');
  if (nInt !== null && nInt > 0) pezzi.push(`${nInt} interventi`);
  const nCompl = num('n_interventi_completati_eliminati') ?? num('n_interventi_completati');
  if (nCompl !== null && nCompl > 0) pezzi.push(`${nCompl} completati`);

  const nRimossi = num('n_operatori_rimossi');
  if (nRimossi !== null && nRimossi > 0) pezzi.push(`${nRimossi} operatori tolti`);
  if (d.staff_name) pezzi.push(String(d.staff_name));
  if (d.errore) pezzi.push(String(d.errore));

  return pezzi.length ? pezzi.join(' · ') : null;
}

export default function LogClient() {
  const [righe, setRighe] = useState<Riga[]>([]);
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);

  const [tipo, setTipo] = useState<'tutto' | 'accessi' | 'azioni'>('tutto');
  const [utente, setUtente] = useState('');
  const [dal, setDal] = useState(giorniFa(7));
  const [al, setAl] = useState(oggi());
  const [q, setQ] = useState('');
  const [rumore, setRumore] = useState(false);

  useEffect(() => {
    fetch('/api/admin/audit?meta=1')
      .then((r) => r.json())
      .then((d) => setUtenti(d.utenti ?? []))
      .catch(() => setUtenti([]));
  }, []);

  const carica = useCallback(async () => {
    setCaricamento(true);
    setErrore(null);
    try {
      const p = new URLSearchParams({ tipo, limit: '300' });
      if (utente) p.set('utente', utente);
      // `al` è un giorno: senza l'ora di chiusura si perderebbe tutto quello del giorno stesso.
      if (dal) p.set('dal', `${dal}T00:00:00.000Z`);
      if (al) p.set('al', `${al}T23:59:59.999Z`);
      if (q.trim()) p.set('q', q.trim());
      if (rumore) p.set('rumore', '1');
      const res = await fetch(`/api/admin/audit?${p.toString()}`);
      const dati = await res.json();
      if (!res.ok) throw new Error(dati.error ?? 'Errore lettura registro.');
      setRighe(dati.righe ?? []);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore lettura registro.');
      setRighe([]);
    } finally {
      setCaricamento(false);
    }
  }, [tipo, utente, dal, al, q, rumore]);

  useEffect(() => { void carica(); }, [carica]);

  const nDistruttive = useMemo(() => righe.filter((r) => DISTRUTTIVE.has(r.azione)).length, [righe]);

  const classeCampo =
    'w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]';

  return (
    <div className="space-y-6">
      <ObjectHeader
        title="Log accessi e azioni"
        sub="Chi è entrato e cosa ha fatto. Le operazioni che distruggono dati registrano anche cosa si sono portate via."
      />

      <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
        <div className="grid gap-3 min-[640px]:grid-cols-2 min-[1024px]:grid-cols-3 min-[1280px]:grid-cols-6">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--brand-text-muted)]">Tipo</span>
            <select className={classeCampo} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option value="tutto">Tutto</option>
              <option value="accessi">Solo accessi</option>
              <option value="azioni">Solo azioni</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--brand-text-muted)]">Utenza</span>
            <select className={classeCampo} value={utente} onChange={(e) => setUtente(e.target.value)}>
              <option value="">Tutte</option>
              {utenti.map((u) => (
                <option key={u.id} value={u.email}>{nomeUtente(u.email)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--brand-text-muted)]">Dal</span>
            <Input type="date" value={dal} onChange={(e) => setDal(e.target.value)} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--brand-text-muted)]">Al</span>
            <Input type="date" value={al} onChange={(e) => setAl(e.target.value)} />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[var(--brand-text-muted)]">Cerca</span>
            <Input
              placeholder="utenza, azione, id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void carica(); }}
            />
          </label>

          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => void carica()} loading={caricamento}>Aggiorna</Button>
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-[var(--brand-text-muted)]">
          <input type="checkbox" checked={rumore} onChange={(e) => setRumore(e.target.checked)} />
          Includi i rinnovi di sessione (utile per sapere chi era collegato a una certa ora, ma sono molti)
        </label>
      </div>

      {errore && (
        <div className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {errore}
        </div>
      )}

      <div className="flex items-center gap-3 text-sm text-[var(--brand-text-muted)]">
        <span>{righe.length} eventi</span>
        {nDistruttive > 0 && <Badge variant="danger">{nDistruttive} distruttivi</Badge>}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)]">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-[var(--brand-surface-muted)] text-left text-xs uppercase text-[var(--brand-text-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Quando</th>
              <th className="px-3 py-2 font-medium">Utenza</th>
              <th className="px-3 py-2 font-medium">Azione</th>
              <th className="px-3 py-2 font-medium">Cosa ha toccato</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {caricamento && righe.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--brand-text-muted)]">Caricamento…</td></tr>
            )}
            {!caricamento && righe.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--brand-text-muted)]">Nessun evento nel periodo scelto.</td></tr>
            )}
            {righe.map((r) => {
              const distruttiva = DISTRUTTIVE.has(r.azione);
              const testo = riassunto(r);
              return (
                <tr
                  key={r.id}
                  className={`border-t border-[var(--brand-border)] align-top ${distruttiva ? 'bg-[var(--danger-soft)]' : ''}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{quando(r.occorso_il)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{nomeUtente(r.utente_email)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={r.esito === 'errore' ? 'ko' : distruttiva ? 'danger' : r.fonte === 'accesso' ? 'muted' : 'progress'}>
                      {ETICHETTE[r.azione] ?? r.azione}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-[var(--brand-text-muted)]">
                    {testo ?? '—'}
                    {aperta === r.id && (
                      <pre className="mt-2 max-h-80 overflow-auto rounded-[var(--radius-md)] bg-[var(--brand-surface-muted)] p-3 text-xs">
                        {JSON.stringify({ entita: r.entita, entita_id: r.entita_id, ip: r.ip, ...r.dettaglio }, null, 2)}
                      </pre>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs underline text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]"
                      onClick={() => setAperta(aperta === r.id ? null : r.id)}
                    >
                      {aperta === r.id ? 'Chiudi' : 'Dettaglio'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
