'use client';
import { eur, num, type DatiProduzione } from './tipi';

/** Storico dei SAL ufficiali caricati (file CONTABILITA'): un SAL per riga, Valore APS ufficiale
 *  vs valorizzazione a listino (controllo leggero di taratura prezzi) + ODL sconosciuti ai nostri dati. */
export default function SalStorico({ dati }: { dati: DatiProduzione }) {
  if (dati.salStorico.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--brand-border)] p-3">
        <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Storico SAL</h3>
        <p className="py-6 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun SAL caricato. Usa «Leggi SAL» dal modulo Agente.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Storico SAL</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--brand-text-muted)]">
            <th className="py-1 pr-2">SAL</th>
            <th className="py-1 pr-2">Mese</th>
            <th className="py-1 pr-2 text-right">ODL</th>
            <th className="py-1 pr-2 text-right">€ APS (ufficiale)</th>
            <th className="py-1 pr-2 text-right">€ listino</th>
            <th className="py-1 pr-2 text-right">Δ listino</th>
            <th className="py-1 pr-2 text-right">ODL sconosciuti</th>
          </tr>
        </thead>
        <tbody>
          {dati.salStorico.map((s) => (
            <tr key={s.n} className="border-t border-[var(--brand-border)]">
              <td className="py-1 pr-2 font-medium text-[var(--brand-text-main)]">SAL {s.n}</td>
              <td className="py-1 pr-2 text-[var(--brand-text-muted)]">{s.mese || '—'}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{num(s.ordini)}</td>
              <td className="py-1 pr-2 text-right tabular-nums font-medium">{eur(s.valoreAps)}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-[var(--brand-text-muted)]">{eur(s.valoreListino)}</td>
              <td className={`py-1 pr-2 text-right tabular-nums ${Math.abs(s.deltaListino) > 0.01 ? 'text-[var(--warning)]' : 'text-[var(--brand-text-muted)]'}`}>
                {eur(s.deltaListino)}
              </td>
              <td className={`py-1 pr-2 text-right tabular-nums ${s.odlSconosciuti > 0 ? 'text-[var(--warning)]' : 'text-[var(--brand-text-muted)]'}`}>
                {num(s.odlSconosciuti)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
