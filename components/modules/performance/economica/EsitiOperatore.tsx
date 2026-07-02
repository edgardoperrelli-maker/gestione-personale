'use client';
import { Bar, BarChart, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EsitoOperatore } from '@/lib/produzione/aggregaEsiti';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, type DatiProduzione } from './tipi';

const MAX_OPERATORI = 12;

/** Esiti sull'ASSEGNATO per operatore: barre impilate al 100% (positivi/negativi/non lavorati)
 *  con la produzione € del periodo come etichetta. Base = ogni intervento ACEA assegnato. */
export default function EsitiOperatore({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();
  const righe = dati.esiti.slice(0, MAX_OPERATORI);

  const pct = (v: number, tot: number) => (tot > 0 ? `${Math.round((v / tot) * 100)}%` : '0%');

  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Esiti sull&apos;assegnato per operatore</h3>
      {righe.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
      ) : (
        <div style={{ width: '100%', height: Math.max(200, righe.length * 34) }}>
          <ResponsiveContainer>
            <BarChart data={righe} layout="vertical" stackOffset="expand" margin={{ top: 4, right: 96, bottom: 4, left: 8 }}>
              <XAxis type="number" tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={130} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v, name, p) => {
                  const e = p?.payload as EsitoOperatore | undefined;
                  const n = Number(v);
                  return [`${num(n)} (${pct(n, e?.assegnati ?? 0)})`, String(name)];
                }}
                labelFormatter={(l, payload) => {
                  const e = payload?.[0]?.payload as EsitoOperatore | undefined;
                  return e ? `${l} — ${num(e.assegnati)} assegnati · ${eur(e.valore)}` : String(l);
                }}
                contentStyle={chartTooltipContent}
                itemStyle={chartItemStyle}
                labelStyle={chartLabelStyle}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="positivi" stackId="e" name="Positivi" fill={cc.success} />
              <Bar dataKey="negativi" stackId="e" name="Negativi" fill={cc.danger} />
              <Bar dataKey="nonLavorati" stackId="e" name="Non lavorati" fill={cc.brandTextMuted} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="valore" position="right" formatter={(v: unknown) => eur(Number(v))} style={{ fill: cc.brandTextMuted, fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
        Base = interventi ACEA assegnati nel periodo (positivi + negativi + mai lavorati). € = produzione del periodo.
      </p>
    </div>
  );
}
