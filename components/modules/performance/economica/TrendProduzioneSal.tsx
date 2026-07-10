'use client';
import { useMemo } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { serieTrend, raggruppaPerSettimana } from '@/lib/produzione/serieTrend';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, giornoIT, type DatiProduzione } from './tipi';

const SOGLIA_SETTIMANE = 45; // oltre ~45 giorni le barre passano a granularità settimanale

/** Trend cumulato Produzione vs SAL: l'area gialla tra le curve è il "da richiedere ad ACEA". */
export default function TrendProduzioneSal({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();

  const serie = useMemo(
    () => serieTrend(dati.produzione.perGiorno, dati.sal.perGiorno, dati.from, dati.to),
    [dati],
  );
  const ritmo = useMemo(() => {
    const giorni = dati.produzione.perGiorno;
    return giorni.length > SOGLIA_SETTIMANE ? raggruppaPerSettimana(giorni) : giorni;
  }, [dati]);
  const settimanale = dati.produzione.perGiorno.length > SOGLIA_SETTIMANE;

  if (serie.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione vs Esitato ACEA nel tempo</h3>
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
      </div>
    );
  }

  const kEuro = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione vs Esitato ACEA nel tempo (cumulato)</h3>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={cc.brandBorder} vertical={false} />
            <XAxis dataKey="data" tickFormatter={giornoIT} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={{ stroke: cc.brandBorder }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={kEuro} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              labelFormatter={(l) => `Al ${giornoIT(String(l))}`}
              formatter={(v, name) => [eur(Number(v)), String(name)]}
              contentStyle={chartTooltipContent}
              itemStyle={chartItemStyle}
              labelStyle={chartLabelStyle}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="salCum" stackId="cum" name="Esitato ACEA" stroke={cc.brandPrimary} fill={cc.brandPrimary} fillOpacity={0.55} />
            <Area type="monotone" dataKey="scartoCum" stackId="cum" name="Da richiedere ad ACEA" stroke={cc.warning} fill={cc.warning} fillOpacity={0.35} />
            <Line type="monotone" dataKey="prodCum" name="Produzione" stroke={cc.success} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <h4 className="mb-1 mt-3 text-[12px] font-medium text-[var(--brand-text-muted)]">
        Ritmo di produzione {settimanale ? '(per settimana)' : '(per giorno)'}
      </h4>
      <div style={{ width: '100%', height: 110 }}>
        <ResponsiveContainer>
          <BarChart data={ritmo} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="chiave" tickFormatter={giornoIT} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={{ stroke: cc.brandBorder }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={kEuro} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              labelFormatter={(l) => (settimanale ? `Settimana del ${giornoIT(String(l))}` : giornoIT(String(l)))}
              formatter={(v) => [eur(Number(v)), 'Produzione']}
              contentStyle={chartTooltipContent}
              itemStyle={chartItemStyle}
              labelStyle={chartLabelStyle}
            />
            <Bar dataKey="valore" fill={cc.brandPrimary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
