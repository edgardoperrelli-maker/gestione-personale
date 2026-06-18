'use client';
import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { buildGiornaliera, filterRows, totali, type ClientRow, type PerfFilters } from '@/lib/performance/shape';
import PerfFilterBar, { type FilterOptions } from './PerfFilterBar';
import { colorForMacro } from './palette';

export default function PerformanceGiornaliera({ allRows, options, initial }: { allRows: ClientRow[]; options: FilterOptions; initial: PerfFilters }) {
  const [f, setF] = useState<PerfFilters>(initial);
  const rows = useMemo(() => filterRows(allRows, f), [allRows, f]);
  const { data, macros } = useMemo(() => buildGiornaliera(rows), [rows]);
  const t = totali(rows);

  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Produzione giornaliera</h2>
        <span className="text-[12px] text-[var(--brand-text-muted)]">
          {t.totale.toLocaleString('it-IT')} interventi{t.valvole > 0 && <> · {t.valvole} con saracinesca</>}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-[var(--brand-text-muted)]">Interventi completati per giorno, colonne divise per attività</p>
      <PerfFilterBar value={f} onChange={setF} options={options} />
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento per i filtri selezionati.</p>
      ) : (
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={12} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, name) => [Number(value).toLocaleString('it-IT'), String(name)]}
                labelFormatter={(l) => `Giorno ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {macros.map((m) => (
                <Bar key={m} dataKey={m} name={m} stackId="g" fill={colorForMacro(m)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
