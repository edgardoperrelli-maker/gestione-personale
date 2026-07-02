'use client';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Button from '@/components/Button';
import { giorniSettimana, lunediSettimana } from '@/lib/produzione/settimana';
import type { CandelaGiorno, CandelaOperatore } from '@/lib/produzione/aggregaCandele';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, giornoIT } from './tipi';

interface RispostaCandele {
  from: string;
  to: string;
  operatori: CandelaOperatore[];
}

const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/** Sposta una data ISO 'YYYY-MM-DD' di `n` giorni (UTC). */
function spostaGiorni(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Candele settimanali per operatore (design 2026-07-02). A differenza degli altri componenti di
 * `economica/`, NON prende `dati` come prop: gestisce da solo stato-settimana e fetch, perché il
 * filtro periodo è esplicitamente scollegato dal periodo (mensile/range) del resto della pagina.
 */
export default function CandeleSettimanali() {
  const cc = useChartColors();
  const [lunedi, setLunedi] = useState(() => lunediSettimana(new Date().toISOString().slice(0, 10)));
  const [dati, setDati] = useState<RispostaCandele | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const giorni = useMemo(() => giorniSettimana(lunedi), [lunedi]);
  const to = giorni[6];

  useEffect(() => {
    let vivo = true;
    setDati(null);
    setErrore(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/acea/produzione/candele?from=${lunedi}&to=${to}`, { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        if (vivo) setDati((await res.json()) as RispostaCandele);
      } catch (e) {
        if (vivo) setErrore(e instanceof Error ? e.message : 'Errore caricamento.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [lunedi, to]);

  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-[var(--brand-text-main)]">Candele settimanali per operatore</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 py-0 text-xs print:hidden"
            onClick={() => setLunedi((l) => spostaGiorni(l, -7))}
            aria-label="Settimana precedente"
          >
            ←
          </Button>
          <span className="text-xs text-[var(--brand-text-muted)]">
            Settimana del {giornoIT(giorni[0])} – {giornoIT(giorni[6])}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 py-0 text-xs print:hidden"
            onClick={() => setLunedi((l) => spostaGiorni(l, 7))}
            aria-label="Settimana successiva"
          >
            →
          </Button>
        </div>
      </div>

      {errore && <p className="text-sm text-[var(--danger)]">{errore}</p>}
      {!dati && !errore && <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Carico i dati…</p>}

      {dati && dati.operatori.length === 0 && (
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun operatore con attività ACEA in questa settimana.</p>
      )}

      {dati && dati.operatori.length > 0 && (
        <div className="space-y-2">
          {dati.operatori.map((op) => (
            <div key={op.chiave} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs text-[var(--brand-text-muted)]" title={op.label}>
                {op.label}
              </span>
              <div style={{ width: '100%', height: 40 }}>
                <ResponsiveContainer>
                  <BarChart data={op.giorni} margin={{ top: 2, right: 4, bottom: 2, left: 4 }} barCategoryGap="20%">
                    <XAxis
                      dataKey="data"
                      tickFormatter={(_v, i) => GIORNI_BREVI[i] ?? ''}
                      tick={{ fill: cc.brandTextMuted, fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis hide domain={[0, 'auto']} />
                    <Tooltip
                      formatter={(v, name) => [num(Number(v)), String(name)]}
                      labelFormatter={(l, payload) => {
                        const g = payload?.[0]?.payload as CandelaGiorno | undefined;
                        if (!g) return String(l);
                        const idx = giorni.indexOf(g.data);
                        const nomeGiorno = idx >= 0 ? GIORNI_BREVI[idx] : '';
                        return `${nomeGiorno} ${giornoIT(g.data)} — ${num(g.assegnati)} assegnati · ${eur(g.valore)}`;
                      }}
                      contentStyle={chartTooltipContent}
                      itemStyle={chartItemStyle}
                      labelStyle={chartLabelStyle}
                    />
                    <Bar dataKey="positivi" stackId="c" name="Positivi" fill={cc.success} />
                    <Bar dataKey="negativi" stackId="c" name="Negativi" fill={cc.danger} />
                    <Bar dataKey="nonLavorati" stackId="c" name="Non lavorati" fill={cc.brandTextMuted} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
        Altezza = interventi ACEA assegnati (positivi + negativi + mai lavorati) per giorno, NON normalizzata.
        € nel tooltip = produzione dedup per matricola.
      </p>
    </div>
  );
}
