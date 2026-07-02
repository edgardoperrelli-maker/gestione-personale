'use client';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PersonaleOperatore } from '@/lib/produzione/aggregaPersonale';
import { useChartColors, chartTooltipContent, chartItemStyle, chartLabelStyle } from '../palette';
import { eur, num, giornoIT, type DatiProduzione } from './tipi';

const MAX_OPERATORI = 12;
const SOGLIA_SETTIMANE = 45;

/** Personale impegnato sulla commessa: € per operatore (con giornate/resa) + impegno nel tempo. */
export default function PersonaleImpegno({ dati }: { dati: DatiProduzione }) {
  const cc = useChartColors();
  const operatori = dati.personale.perOperatore.slice(0, MAX_OPERATORI);

  // Impegno nel tempo: se il periodo è lungo, somma le giornate per settimana.
  const impegno = useMemo(() => {
    const g = dati.personale.perGiorno;
    if (g.length <= SOGLIA_SETTIMANE) return g.map((x) => ({ chiave: x.data, dedicate: x.dedicate, saturazione: x.saturazione }));
    const m = new Map<string, { chiave: string; dedicate: number; saturazione: number }>();
    for (const x of g) {
      const d = new Date(`${x.data}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const k = d.toISOString().slice(0, 10);
      const acc = m.get(k) ?? { chiave: k, dedicate: 0, saturazione: 0 };
      acc.dedicate += x.dedicate;
      acc.saturazione += x.saturazione;
      m.set(k, acc);
    }
    return [...m.values()]
      .map((x) => ({ ...x, dedicate: Math.round(x.dedicate * 100) / 100, saturazione: Math.round(x.saturazione * 100) / 100 }))
      .sort((a, b) => (a.chiave < b.chiave ? -1 : 1));
  }, [dati]);
  const settimanale = dati.personale.perGiorno.length > SOGLIA_SETTIMANE;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Produzione per operatore</h3>
        {operatori.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(180, operatori.length * 30) }}>
            <ResponsiveContainer>
              <BarChart data={operatori} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => (Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))} />
                <YAxis type="category" dataKey="label" width={130} tick={{ fill: cc.brandTextMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v, _n, p) => {
                    const o = p?.payload as PersonaleOperatore | undefined;
                    const dettagli = o ? ` · ${num(o.giornate)} gg · resa ${o.resa == null ? '—' : eur(o.resa)}` : '';
                    return [`${eur(Number(v))}${dettagli}`, 'Produzione'];
                  }}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                />
                <Bar dataKey="valore" fill={cc.brandPrimary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
          Giornate = quota di interventi ACEA lavorati sul totale lavorato nel giorno, nei soli giorni feriali lun–ven
          (gli assegnati non eseguiti non contano).
        </p>
      </div>

      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">
          Impegno nel tempo {settimanale ? '(giornate/settimana)' : '(giornate/giorno)'}
        </h3>
        {impegno.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato nel periodo.</p>
        ) : (
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={impegno} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={cc.brandBorder} vertical={false} />
                <XAxis dataKey="chiave" tickFormatter={giornoIT} tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={{ stroke: cc.brandBorder }} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fill: cc.brandTextMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  labelFormatter={(l) => (settimanale ? `Settimana del ${giornoIT(String(l))}` : giornoIT(String(l)))}
                  formatter={(v, name) => [`${num(Number(v))} gg`, String(name)]}
                  contentStyle={chartTooltipContent}
                  itemStyle={chartItemStyle}
                  labelStyle={chartLabelStyle}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="dedicate" stackId="gg" name="Dedicati (≥ 80%)" fill={cc.success} />
                <Bar dataKey="saturazione" stackId="gg" name="A saturazione" fill={cc.warning} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {(dati.personale.sabato.giornate > 0 || dati.personale.sabato.valore > 0) && (
          <p className="mt-1 text-[10px] text-[var(--brand-text-subtle)]">
            Sabati (attivazioni): {num(dati.personale.sabato.giornate)} gg · {eur(dati.personale.sabato.valore)} — esclusi da giornate e resa.
          </p>
        )}
      </div>
    </div>
  );
}
