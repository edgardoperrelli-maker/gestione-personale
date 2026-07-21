'use client';
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { buildEsiti, buildEsitiOperatori, filterRows, type ClientRow, type PerfFilters } from '@/lib/performance/shape';
import PerfFilterBar, { type FilterOptions } from './PerfFilterBar';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle, CHART_TICK_FILL } from './palette';

/** Grafico principale: esiti positivi/negativi per giorno + riepilogo per operatore. */
export default function PerformanceEsiti({ allRows, options, initial }: { allRows: ClientRow[]; options: FilterOptions; initial: PerfFilters }) {
  const [f, setF] = useState<PerfFilters>(initial);
  const rows = useMemo(() => filterRows(allRows, f), [allRows, f]);
  const { data, tot } = useMemo(() => buildEsiti(rows), [rows]);
  const operatori = useMemo(() => buildEsitiOperatori(rows), [rows]);
  const maxOp = Math.max(1, ...operatori.map((o) => o.totale));

  // Resolved concrete color strings for recharts SVG props (var() not resolved in SVG attrs).
  const cc = useChartColors();

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Esiti operatori</h2>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full border border-[var(--brand-border)] bg-[var(--success-soft)] px-2.5 py-0.5 font-medium text-[var(--success)] tabular-nums">
            {tot.positivi.toLocaleString('it-IT')} positivi
          </span>
          <span className="rounded-full border border-[var(--brand-border)] bg-[var(--danger-soft)] px-2.5 py-0.5 font-medium text-[var(--danger)] tabular-nums">
            {tot.negativi.toLocaleString('it-IT')} negativi
          </span>
          <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2.5 py-0.5 font-medium text-[var(--brand-text-main)] tabular-nums">
            {tot.pct}% riuscita
          </span>
        </div>
      </div>
      <p className="mb-2 text-xs text-[var(--brand-text-muted)]">Interventi eseguiti positivi e negativi per giorno nel periodo selezionato · scegli un operatore per vedere i suoi esiti</p>
      <PerfFilterBar value={f} onChange={setF} options={options} />
      {tot.totale === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento per i filtri selezionati.</p>
      ) : (
        <>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid stroke={cc.brandBorder} strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: cc.brandTextMuted }}
                  interval="preserveStartEnd"
                  minTickGap={12}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: cc.brandTextMuted }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => [Number(value).toLocaleString('it-IT'), String(name)]}
                  labelFormatter={(l) => `Giorno ${l}`}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                  cursor={{ fill: cc.brandBorder, opacity: 0.4 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: CHART_TICK_FILL }} />
                <Bar dataKey="positivi" name="Positivi" stackId="e" fill={cc.success} />
                <Bar dataKey="negativi" name="Negativi" stackId="e" fill={cc.danger} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Riepilogo per operatore: barra verde/rossa proporzionale, sempre coerente coi filtri sopra. */}
          <div className="mt-3 border-t border-[var(--brand-border)]/50 pt-3">
            <h3 className="mb-1.5 text-[13px] font-medium text-[var(--brand-text-main)]">Riuscita per operatore</h3>
            <div className="space-y-1">
              {operatori.map((o) => (
                <div key={o.id} className="grid grid-cols-[160px_1fr_56px] items-center gap-3 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--brand-surface-muted)]">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-[var(--brand-text-main)]">{o.name}</div>
                    <div className="truncate text-xs tabular-nums text-[var(--brand-text-muted)]">
                      <span className="text-[var(--success)]">{o.positivi.toLocaleString('it-IT')} pos</span>
                      {' · '}
                      <span className="text-[var(--danger)]">{o.negativi.toLocaleString('it-IT')} neg</span>
                    </div>
                  </div>
                  <div className="h-3.5 overflow-hidden rounded-[var(--radius-md)] bg-[var(--brand-border)]/40">
                    <div className="flex h-full" style={{ width: `${(o.totale / maxOp) * 100}%` }}>
                      {o.positivi > 0 && <div className="h-full" style={{ flex: o.positivi, background: 'var(--success)' }} title={`Positivi: ${o.positivi}`} />}
                      {o.negativi > 0 && <div className="h-full" style={{ flex: o.negativi, background: 'var(--danger)' }} title={`Negativi: ${o.negativi}`} />}
                    </div>
                  </div>
                  <div className="text-right text-[13px] font-semibold tabular-nums text-[var(--brand-text-main)]">{o.pct}%</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
