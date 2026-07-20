'use client';

// Pannello "Controllo esiti DB ↔ ACEA" nella foglia Aggiorna stato ODL.
// Calcolo on-demand (GET /api/admin/agente/confronto-esiti), nessuna scrittura: solo report.
// Default sulla finestra corrente dell'agente, interruttore "tutto lo storico", export Excel.
// Decisioni di design: lib/agente/confrontoEsitiAcea.ts (grigliata 20/07).
import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import type { EsitoConfrontoAcea, RigaDbVersoAcea } from '@/lib/agente/confrontoEsitiAcea';

type MancanteRow = { odl: string; operatore: string | null; statoDb: string | null; ultimaData: string | null };
type MaiVistoRow = { odl: string; operatore: string | null };

type ConfrontoResponse = {
  vuoto?: boolean;
  motivo?: string;
  error?: string;
  aggiornatoAl?: string | null;
  finestraGiorni?: number;
  storico?: boolean;
  dbVersoAcea?: { totale: number; conteggi: Record<EsitoConfrontoAcea, number>; righe: RigaDbVersoAcea[] };
  aceaVersoDb?: { totale: number; ok: number; mancanti: MancanteRow[]; maiVisti: MaiVistoRow[] };
};

const ETICHETTA_ESITO: Record<EsitoConfrontoAcea, string> = {
  ok: 'OK',
  ok_causale_assente: 'OK, causale assente',
  nostro_carico: 'A nostro carico (non pagato)',
  non_consuntivato: 'Non esitato su ACEA',
  non_in_export: "Non nell'export",
};

const MAX_RIGHE_VISTA = 150;

function dataOraIt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function dataIt(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

function StatBox({ label, value, tono }: { label: string; value: number; tono?: 'ok' | 'warn' | 'danger' }) {
  const colore = tono === 'danger' ? 'var(--danger)' : tono === 'warn' ? 'var(--warning)' : 'var(--brand-primary)';
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'color-mix(in oklch, var(--brand-primary-soft) 40%, transparent)' }}>
      <div className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color: colore }}>{value}</div>
    </div>
  );
}

export function ConfrontoEsitiAcea({ ultimoGiroTs }: { ultimoGiroTs: string | null }) {
  const [storico, setStorico] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [dati, setDati] = useState<ConfrontoResponse | null>(null);

  const carica = useCallback(async (usaStorico: boolean) => {
    setLoading(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/admin/agente/confronto-esiti${usaStorico ? '?storico=1' : ''}`, { cache: 'no-store' });
      const j = (await res.json().catch(() => ({}))) as ConfrontoResponse;
      if (!res.ok) {
        setErrore(j.error ?? `Errore ${res.status}`);
        setDati(null);
      } else {
        setDati(j);
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore di rete.');
      setDati(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Al montaggio, al cambio finestra/storico e quando arriva un nuovo giro dell'agente.
  useEffect(() => {
    void carica(storico);
  }, [carica, storico, ultimoGiroTs]);

  const esportaExcel = useCallback(() => {
    if (!dati?.dbVersoAcea || !dati?.aceaVersoDb) return;
    const wb = XLSX.utils.book_new();
    const disallineati = dati.dbVersoAcea.righe.map((r) => ({
      'ODL': r.odl,
      'Data esecuzione (DB)': dataIt(r.dataDb),
      'Esito controllo': ETICHETTA_ESITO[r.esito],
      'Stato ACEA': r.statoAcea ?? '—',
      'Causale scostamento': r.causa ?? '—',
    }));
    const mancanti = dati.aceaVersoDb.mancanti.map((r) => ({
      'ODL': r.odl,
      'Assegnatario ACEA': r.operatore ?? '—',
      'Nel nostro DB': r.statoDb ?? '—',
      'Ultima data (DB)': dataIt(r.ultimaData),
    }));
    const maiVisti = dati.aceaVersoDb.maiVisti.map((r) => ({
      'ODL': r.odl,
      'Assegnatario ACEA': r.operatore ?? '—',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(disallineati), 'DB non su ACEA');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mancanti), 'ACEA non nel DB');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(maiVisti), 'Mai visti dall\'app');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `confronto-esiti-acea-${stamp}${dati.storico ? '-storico' : ''}.xlsx`);
  }, [dati]);

  const c = dati?.dbVersoAcea?.conteggi;

  return (
    <Card animated={false}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
              Controllo esiti DB ↔ ACEA
            </h2>
            <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
              {dati?.vuoto
                ? dati.motivo
                : <>Dati ACEA al {dataOraIt(dati?.aggiornatoAl)} · {dati?.storico ? 'tutto lo storico' : `ultimi ${dati?.finestraGiorni ?? 60} giorni`}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
              <input type="checkbox" checked={storico} onChange={(e) => setStorico(e.target.checked)} disabled={loading} />
              Tutto lo storico
            </label>
            <Button variant="secondary" onClick={() => void carica(storico)} disabled={loading}>
              {loading ? 'Calcolo…' : 'Ricalcola'}
            </Button>
            <Button variant="secondary" onClick={esportaExcel} disabled={loading || !dati?.dbVersoAcea}>
              Esporta Excel
            </Button>
          </div>
        </div>

        {errore && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{errore}</p>
        )}

        {c && dati?.dbVersoAcea && dati?.aceaVersoDb && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <StatBox label="Positivi DB verificati" value={dati.dbVersoAcea.totale} />
              <StatBox label="OK su ACEA" value={c.ok} tono="ok" />
              <StatBox label="Non esitati su ACEA" value={c.non_consuntivato} tono="danger" />
              <StatBox label="A nostro carico" value={c.nostro_carico} tono="warn" />
              <StatBox label="Non nell'export" value={c.non_in_export} tono="warn" />
              <StatBox label="ACEA ok, manca nel DB" value={dati.aceaVersoDb.mancanti.length} tono="danger" />
              <StatBox label="Mai visti dall'app" value={dati.aceaVersoDb.maiVisti.length} tono="warn" />
            </div>

            {dati.dbVersoAcea.righe.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                  Positivi nostri non allineati su ACEA ({dati.dbVersoAcea.righe.length})
                </h3>
                <div className="max-h-64 overflow-auto rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: 'var(--brand-text-muted)' }}>
                        <th className="px-2 py-1 text-left">ODL</th>
                        <th className="px-2 py-1 text-left">Data (DB)</th>
                        <th className="px-2 py-1 text-left">Esito controllo</th>
                        <th className="px-2 py-1 text-left">Stato ACEA</th>
                        <th className="px-2 py-1 text-left">Causale</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: 'var(--brand-text-main)' }}>
                      {dati.dbVersoAcea.righe.slice(0, MAX_RIGHE_VISTA).map((r) => (
                        <tr key={r.odl} className="border-t" style={{ borderColor: 'var(--brand-border)' }}>
                          <td className="px-2 py-1 font-mono">{r.odl}</td>
                          <td className="px-2 py-1">{dataIt(r.dataDb)}</td>
                          <td className="px-2 py-1" style={{ color: r.esito === 'non_consuntivato' ? 'var(--danger)' : 'var(--warning)' }}>
                            {ETICHETTA_ESITO[r.esito]}
                          </td>
                          <td className="px-2 py-1">{r.statoAcea ?? '—'}</td>
                          <td className="px-2 py-1">{r.causa ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dati.dbVersoAcea.righe.length > MAX_RIGHE_VISTA && (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>
                    Mostrate le prime {MAX_RIGHE_VISTA}: l&rsquo;elenco completo è nell&rsquo;export Excel.
                  </p>
                )}
              </div>
            )}

            {dati.aceaVersoDb.mancanti.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                  Positivi ACEA senza positivo nel nostro DB ({dati.aceaVersoDb.mancanti.length})
                </h3>
                <div className="max-h-64 overflow-auto rounded-lg border" style={{ borderColor: 'var(--brand-border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: 'var(--brand-text-muted)' }}>
                        <th className="px-2 py-1 text-left">ODL</th>
                        <th className="px-2 py-1 text-left">Assegnatario ACEA</th>
                        <th className="px-2 py-1 text-left">Nel nostro DB</th>
                        <th className="px-2 py-1 text-left">Ultima data (DB)</th>
                      </tr>
                    </thead>
                    <tbody style={{ color: 'var(--brand-text-main)' }}>
                      {dati.aceaVersoDb.mancanti.slice(0, MAX_RIGHE_VISTA).map((r) => (
                        <tr key={r.odl} className="border-t" style={{ borderColor: 'var(--brand-border)' }}>
                          <td className="px-2 py-1 font-mono">{r.odl}</td>
                          <td className="px-2 py-1">{r.operatore ?? '—'}</td>
                          <td className="px-2 py-1" style={{ color: 'var(--danger)' }}>{r.statoDb ?? '—'}</td>
                          <td className="px-2 py-1">{dataIt(r.ultimaData)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dati.aceaVersoDb.mancanti.length > MAX_RIGHE_VISTA && (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>
                    Mostrate le prime {MAX_RIGHE_VISTA}: l&rsquo;elenco completo è nell&rsquo;export Excel.
                  </p>
                )}
              </div>
            )}

            {dati.aceaVersoDb.maiVisti.length > 0 && (
              <p className="text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>
                {dati.aceaVersoDb.maiVisti.length} ODL positivi su ACEA mai comparsi nell&rsquo;app
                (lavori pre-app o mai pianificati qui): elenco nell&rsquo;export Excel.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
