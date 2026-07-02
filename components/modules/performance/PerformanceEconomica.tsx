'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import type { Aggregato } from '@/lib/produzione/aggregaProduzione';
import type { ClasseDiscrepanza } from '@/lib/produzione/riconciliazione';
import EditorListinoAcea from './EditorListinoAcea';
import KpiDirezione from './economica/KpiDirezione';
import TrendProduzioneSal from './economica/TrendProduzioneSal';
import ComposizioneProduzione from './economica/ComposizioneProduzione';
import PersonaleImpegno from './economica/PersonaleImpegno';
import { eur, num, type DatiProduzione } from './economica/tipi';

const AUDIT_LABEL: Record<ClasseDiscrepanza, string> = {
  SOLO_PORTALE: 'Solo nel portale ACEA (assente da DB e master)',
  DB_NON_IN_MASTER: 'Nel DB ma non nel master',
  MASTER_NON_IN_DB: 'Nel master ma non nel DB',
  POSITIVO_DB_NON_COMPLETATO_PORTALE: 'Positivo nel DB ma non consuntivato sul portale (Produzione > SAL)',
  COMPLETATO_PORTALE_NON_POSITIVO_DB: 'Consuntivato sul portale ma non positivo nel DB',
  VOCE_DISCORDE: 'Voce DB ≠ voce master',
  VOCE_NON_RISOLTA: 'Voce non derivabile dall’attività',
};
const ORDINE_AUDIT: ClasseDiscrepanza[] = [
  'POSITIVO_DB_NON_COMPLETATO_PORTALE',
  'COMPLETATO_PORTALE_NON_POSITIVO_DB',
  'DB_NON_IN_MASTER',
  'MASTER_NON_IN_DB',
  'SOLO_PORTALE',
  'VOCE_DISCORDE',
  'VOCE_NON_RISOLTA',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

const field =
  'rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs text-[var(--brand-text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]';

export default function PerformanceEconomica() {
  const now = useMemo(() => new Date(), []);
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // Default = ultimi 30 giorni (così non è vuoto il 1° del mese, quando il "mese corrente" non ha dati).
  const trentaGiorniFa = useMemo(() => {
    const d = new Date(now);
    d.setDate(now.getDate() - 30);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [now]);

  const [from, setFrom] = useState(trentaGiorniFa);
  const [to, setTo] = useState(today);
  const [dati, setDati] = useState<DatiProduzione | null>(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/admin/acea/produzione?from=${from}&to=${to}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setDati((await res.json()) as DatiProduzione);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore caricamento.');
      setDati(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const setRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };
  const presetMese = () => setRange(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, today);
  const presetTrimestre = () => setRange(`${now.getFullYear()}-${pad(now.getMonth() - (now.getMonth() % 3) + 1)}-01`, today);
  const presetAnno = () => setRange(`${now.getFullYear()}-01-01`, today);

  // "Allinea da ACEA": comanda l'agente a rileggere i master (DUNNING/ZAGAROLO). L'agente esegue al
  // prossimo giro (stesso flag di "Richiedi stato ACEA"); poi ricarica la foglietta per vedere i dati.
  const [allineaMsg, setAllineaMsg] = useState<string | null>(null);
  const allinea = async (target: 'dunning' | 'zagarolo') => {
    setAllineaMsg('Invio richiesta…');
    try {
      const res = await fetch('/api/admin/agente/acea-stato', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setAllineaMsg(`Richiesto: l’agente leggerà il master ${target === 'zagarolo' ? 'ZAGAROLO (massive)' : 'DUNNING'} al prossimo giro.`);
    } catch (e) {
      setAllineaMsg(e instanceof Error ? e.message : 'Errore richiesta allineamento.');
    }
  };

  const exportUrl = `/api/admin/acea/produzione/export?from=${from}&to=${to}`;
  const exportNonClassificateUrl = `/api/admin/acea/produzione/non-classificate?from=${from}&to=${to}`;
  const invalid = Boolean(from && to && from > to);

  const auditClassi = dati ? ORDINE_AUDIT.filter((c) => dati.auditSummary[c] > 0) : [];

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Produzione economica (ACEA)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-[var(--brand-text-subtle)]">Allinea master:</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={() => allinea('dunning')}>Dunning</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={() => allinea('zagarolo')}>Zagarolo</Button>
          <span className="mx-1 h-4 w-px bg-[var(--brand-border)]" aria-hidden />
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={() => setEditorOpen((v) => !v)}>
            {editorOpen ? 'Chiudi listino' : 'Listino tariffe'}
          </Button>
          <a
            href={invalid ? undefined : exportUrl}
            className={`inline-flex h-7 items-center rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3 text-xs font-medium text-white ${invalid ? 'pointer-events-none opacity-50' : ''}`}
          >
            Scarica Excel (dashboard)
          </a>
          <a
            href={invalid ? undefined : exportNonClassificateUrl}
            className={`inline-flex h-7 items-center rounded-[var(--radius-md)] border border-[var(--brand-border)] px-3 text-xs font-medium text-[var(--brand-text-main)] ${invalid ? 'pointer-events-none opacity-50' : ''}`}
          >
            Esporta non classificate{dati ? ` (${dati.nonClassificate.length})` : ''}
          </a>
          <a
            href={invalid ? undefined : `/presentazione/produzione-acea?from=${from}&to=${to}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex h-7 items-center rounded-[var(--radius-md)] border border-[var(--brand-primary)] px-3 text-xs font-medium text-[var(--brand-primary)] ${invalid ? 'pointer-events-none opacity-50' : ''}`}
          >
            Presentazione
          </a>
        </div>
      </div>
      {allineaMsg && <p className="mb-2 text-xs text-[var(--brand-text-muted)]">{allineaMsg}</p>}

      {editorOpen && (
        <div className="mb-4 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
          <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Listino tariffe per voce (con validità)</h3>
          <EditorListinoAcea onSaved={carica} />
        </div>
      )}

      {/* Barra periodo */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} aria-label="Da" />
        <span className="text-xs text-[var(--brand-text-subtle)]">→</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} aria-label="A" />
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetMese}>Mese</Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetTrimestre}>Trim.</Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 py-0 text-xs" onClick={presetAnno}>Anno</Button>
        {invalid && <span className="text-xs text-[var(--danger)]">Da &gt; A</span>}
        {loading && <span className="text-xs text-[var(--brand-text-subtle)]">Carico…</span>}
      </div>

      {errore && <p className="text-sm text-[var(--danger)]">{errore}</p>}

      {dati && (
        <>
          <KpiDirezione dati={dati} operative />

          {/* Trend cumulato Produzione vs SAL */}
          <div className="mb-4">
            <TrendProduzioneSal dati={dati} />
          </div>

          {/* Composizione: donut per voce + top attività */}
          <div className="mb-4">
            <ComposizioneProduzione dati={dati} />
          </div>

          {/* Personale impegnato */}
          <div className="mb-4">
            <PersonaleImpegno dati={dati} />
          </div>

          {/* Produzione vs SAL per voce (tabella operativa) */}
          <div className="mb-4 rounded-xl border border-[var(--brand-border)] p-3">
            <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione vs SAL per voce</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--brand-text-muted)]">
                  <th className="py-1 pr-2">Voce</th>
                  <th className="py-1 pr-2 text-right">Produzione</th>
                  <th className="py-1 pr-2 text-right">SAL</th>
                </tr>
              </thead>
              <tbody>
                {dati.produzione.perVoce.map((v) => {
                  const sal = dati.sal.perVoce.find((s) => s.chiave === v.chiave);
                  return (
                    <tr key={v.chiave} className="border-t border-[var(--brand-border)]">
                      <td className="py-1 pr-2 font-medium text-[var(--brand-text-main)]">{v.chiave}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{eur(v.valore)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-[var(--brand-text-muted)]">{eur(sal?.valore ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Per attività (dettaglio granulare del listino) */}
          <div className="mb-4">
            <TabellaAgg titolo="Produzione per attività" righe={dati.produzione.perAttivita} max={30} />
          </div>

          {/* Per operatore / territorio */}
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TabellaAgg titolo="Per operatore" righe={dati.produzione.perOperatore} />
            <TabellaAgg titolo="Per territorio" righe={dati.produzione.perTerritorio} />
          </div>

          {/* Audit a tre vie */}
          <div className="rounded-xl border border-[var(--brand-border)] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-medium text-[var(--brand-text-main)]">Audit a tre vie (DB · master · portale)</h3>
              {(!dati.masterPopolato || !dati.portalePopolato) && (
                <Badge variant="warn">
                  {!dati.masterPopolato && !dati.portalePopolato
                    ? 'Snapshot master e portale non ancora popolati'
                    : !dati.masterPopolato
                      ? 'Snapshot master non popolato'
                      : 'Snapshot portale non popolato'}
                </Badge>
              )}
              {dati.masterPopolato && dati.portalePopolato && auditClassi.length === 0 && (
                <Badge variant="success">Nessuna discrepanza</Badge>
              )}
              {auditClassi.map((c) => (
                <Badge key={c} variant="warning">{AUDIT_LABEL[c]}: {num(dati.auditSummary[c])}</Badge>
              ))}
            </div>
            {(!dati.masterPopolato || !dati.portalePopolato) && (
              <p className="mb-2 text-xs text-[var(--brand-text-muted)]">
                L’audit DB↔master↔portale è limitato finché l’agente non carica gli snapshot. Usa
                «Allinea master» e lancia il giro «Richiedi stato ACEA» dall’agente, poi ricarica.
              </p>
            )}
            {dati.audit.length > 0 && (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--brand-surface)]">
                    <tr className="text-left text-[var(--brand-text-muted)]">
                      <th className="py-1 pr-2">ODL</th>
                      <th className="py-1 pr-2">Discrepanza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dati.audit.map((d, i) => (
                      <tr key={`${d.odl}-${d.classe}-${i}`} className="border-t border-[var(--brand-border)]">
                        <td className="py-1 pr-2 font-mono text-[var(--brand-text-main)]">{d.odl}</td>
                        <td className="py-1 pr-2 text-[var(--brand-text-muted)]">{AUDIT_LABEL[d.classe]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dati.auditTruncated && (
                  <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">Elenco troncato: mostrate {num(dati.audit.length)} di {num(dati.auditTotale)} discrepanze.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function TabellaAgg({ titolo, righe, max = 12 }: { titolo: string; righe: Aggregato[]; max?: number }) {
  const top = righe.slice(0, max);
  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">{titolo}</h3>
      {top.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {top.map((r) => (
              <tr key={r.chiave} className="border-t border-[var(--brand-border)] first:border-t-0">
                <td className="py-1 pr-2 text-[var(--brand-text-main)]">{r.label}</td>
                <td className="py-1 pr-2 text-right tabular-nums text-[var(--brand-text-muted)]">{r.conteggio.toLocaleString('it-IT')}</td>
                <td className="py-1 pr-2 text-right font-medium tabular-nums">{r.valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
