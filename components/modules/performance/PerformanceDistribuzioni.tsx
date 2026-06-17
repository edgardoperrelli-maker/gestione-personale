'use client';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { DistribuzioneSlice } from '@/lib/performance/shape';
import { colorForMacro, PALETTE } from './palette';

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
                <Pie data={data} dataKey="n" nameKey="chiave" innerRadius={45} outerRadius={75}>
                  {data.map((d, i) => <Cell key={d.chiave} fill={color(d.chiave, i)} />)}
                </Pie>
                <Tooltip formatter={(value, name) => {
                  const v = Number(value);
                  return [`${v.toLocaleString('it-IT')} (${total ? Math.round((v / total) * 100) : 0}%)`, String(name)];
                }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--brand-text-muted)]">
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

export default function PerformanceDistribuzioni({
  perMacro, perCommittente, perTerritorio,
}: {
  perMacro: DistribuzioneSlice[];
  perCommittente: DistribuzioneSlice[];
  perTerritorio: DistribuzioneSlice[];
}) {
  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-[var(--brand-text-main)]">Distribuzioni</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Donut title="Per attività" data={perMacro} colorBy="macro" />
        <Donut title="Per committente" data={perCommittente} colorBy="index" />
        <Donut title="Per territorio" data={perTerritorio} colorBy="index" />
      </div>
    </section>
  );
}
