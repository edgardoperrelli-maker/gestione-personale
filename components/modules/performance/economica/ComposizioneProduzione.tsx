'use client';
import { useMemo } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { composizionePerVoce } from '@/lib/produzione/composizioneVoce';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, type DatiProduzione } from './tipi';

const MAX_ATTIVITA = 8;

/** Composizione della produzione: donut per voce + barre orizzontali delle top attività. */
export default function ComposizioneProduzione({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();
  const slices = useMemo(() => composizionePerVoce(dati.produzione), [dati]);
  const attivita = dati.produzione.perAttivita.slice(0, MAX_ATTIVITA);
  const totale = dati.produzione.totale.valore;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione per voce</h3>
        {slices.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={slices} dataKey="valore" nameKey="label" innerRadius={55} outerRadius={88} stroke={cc.brandSurface} strokeWidth={1.5}>
                    {slices.map((s, i) => (
                      <Cell key={s.chiave} fill={cc.palette[i % cc.palette.length]} stroke={cc.brandSurface} strokeWidth={1.5} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => {
                      const val = Number(v);
                      return [`${eur(val)} (${totale ? Math.round((val / totale) * 100) : 0}%)`, String(name)];
                    }}
                    contentStyle={chartTooltipContent}
                    itemStyle={chartItemStyle}
                    labelStyle={chartLabelStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--brand-text-muted)]">
              {slices.map((s, i) => (
                <span key={s.chiave} className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cc.palette[i % cc.palette.length] }} />
                  {s.label} <span className="tabular-nums">{eur(s.valore)}</span> · <span className="tabular-nums">{num(s.conteggio)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Top attività per valore</h3>
        {attivita.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(180, attivita.length * 32) }}>
            <ResponsiveContainer>
              <BarChart data={attivita} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))} />
                <YAxis type="category" dataKey="label" width={170} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, _n, p) => [`${eur(Number(v))} · ${num(Number((p?.payload as { conteggio?: number })?.conteggio ?? 0))} interventi`, 'Produzione']}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                />
                <Bar dataKey="valore" radius={[0, 4, 4, 0]}>
                  {attivita.map((a, i) => (
                    <Cell key={a.chiave} fill={cc.palette[i % cc.palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
