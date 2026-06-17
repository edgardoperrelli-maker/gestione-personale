'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { AndamentoPoint, Granularity } from '@/lib/performance/shape';

export default function PerformanceAndamento({ points, granularity }: { points: AndamentoPoint[]; granularity: Granularity }) {
  const granLabel = granularity === 'day' ? 'giorno' : granularity === 'week' ? 'settimana' : 'mese';
  return (
    <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm">
      <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Andamento nel tempo</h2>
      <p className="mb-3 text-[11px] text-[var(--brand-text-muted)]">Interventi completati per {granLabel}</p>
      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun intervento per i filtri selezionati.</p>
      ) : (
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={points}>
              <CartesianGrid strokeOpacity={0.15} vertical={false} />
              <XAxis dataKey="periodoLabel" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [Number(value).toLocaleString('it-IT'), 'Interventi']} />
              <Line type="monotone" dataKey="n" name="Interventi" stroke="#06b6d4" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
