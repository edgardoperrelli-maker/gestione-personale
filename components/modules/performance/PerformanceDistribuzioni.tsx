'use client';
import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { buildDistribuzioni, filterRows, type ClientRow, type DistribuzioneSlice, type PerfFilters } from '@/lib/performance/shape';
import PerfFilterBar, { type FilterOptions } from './PerfFilterBar';
import { colorForMacro, PALETTE, chartTooltipContent, chartItemStyle, chartLabelStyle } from './palette';

function Donut({ title, data, colorBy }: { title: string; data: DistribuzioneSlice[]; colorBy: 'macro' | 'index' }) {
  const total = data.reduce((s, d) => s + d.n, 0);
  const color = (chiave: string, i: number) => (colorBy === 'macro' ? colorForMacro(chiave) : PALETTE[i % PALETTE.length]);
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">{title}</h3>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato.</p>
      ) : (
        <>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="n"
                  nameKey="chiave"
                  innerRadius={45}
                  outerRadius={75}
                  stroke="var(--brand-surface)"
                  strokeWidth={1.5}
                >
                  {data.map((d, i) => (
                    <Cell
                      key={d.chiave}
                      fill={color(d.chiave, i)}
                      stroke="var(--brand-surface)"
                      strokeWidth={1.5}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => {
                    const v = Number(value);
                    return [`${v.toLocaleString('it-IT')} (${total ? Math.round((v / total) * 100) : 0}%)`, String(name)];
                  }}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--brand-text-muted)]">
            {data.map((d, i) => (
              <span key={d.chiave} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color(d.chiave, i) }} />
                {d.chiave} <span className="tabular-nums">{d.n.toLocaleString('it-IT')}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function PerformanceDistribuzioni({ allRows, options, initial }: { allRows: ClientRow[]; options: FilterOptions; initial: PerfFilters }) {
  const [f, setF] = useState<PerfFilters>(initial);
  const rows = useMemo(() => filterRows(allRows, f), [allRows, f]);
  const { perMacro, perCommittente, perTerritorio } = useMemo(() => buildDistribuzioni(rows), [rows]);

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <h2 className="mb-2 text-base font-semibold text-[var(--brand-text-main)]">Distribuzioni</h2>
      <PerfFilterBar value={f} onChange={setF} options={options} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Donut title="Per attività" data={perMacro} colorBy="macro" />
        <Donut title="Per committente" data={perCommittente} colorBy="index" />
        <Donut title="Per territorio" data={perTerritorio} colorBy="index" />
      </div>
    </section>
  );
}
