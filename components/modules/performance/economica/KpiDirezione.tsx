'use client';
import { eur, num, type DatiProduzione } from './tipi';

function Card({ titolo, valore, nota, accent }: { titolo: string; valore: string; nota?: string; accent?: 'pos' | 'neg' | 'warn' }) {
  const color =
    accent === 'pos' ? 'text-[var(--success)]' : accent === 'neg' ? 'text-[var(--danger)]' : accent === 'warn' ? 'text-[var(--warning)]' : 'text-[var(--brand-text-main)]';
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
      <div className="text-[11px] text-[var(--brand-text-muted)]">{titolo}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{valore}</div>
      {nota && <div className="text-[10px] text-[var(--brand-text-subtle)]">{nota}</div>}
    </div>
  );
}

/** Fila di KPI per la dirigenza: economia + personale. Con `operative` aggiunge le 2 card di controllo. */
export default function KpiDirezione({ dati, operative }: { dati: DatiProduzione; operative?: boolean }) {
  const prod = dati.produzione.totale.valore;
  const sal = dati.sal.totale.valore;
  const perc = prod > 0 ? Math.round((sal / prod) * 100) : null;
  const giornate = dati.personale.totaleGiornate;
  const resa = giornate > 0 ? prod / giornate : null;

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <Card titolo="Produzione" valore={eur(prod)} nota={`${num(dati.produzione.totale.conteggio)} ordini`} accent="pos" />
      <Card titolo="SAL (pagato)" valore={eur(sal)} nota={`${num(dati.sal.totale.conteggio)} ODL · causale E%`} />
      <Card titolo="Da richiedere ad ACEA" valore={eur(dati.scarto.valore)} nota="Produzione − SAL" accent={dati.scarto.valore > 0 ? 'warn' : undefined} />
      <Card titolo="% consuntivato" valore={perc == null ? '—' : `${num(perc)}%`} nota="SAL / Produzione" />
      <Card titolo="Giornate-uomo" valore={num(giornate)} nota={`${num(dati.personale.operatoriAttivi)} operatori`} />
      <Card titolo="Resa €/giornata" valore={resa == null ? '—' : eur(resa)} nota="Produzione / giornate" />
      {operative && (
        <>
          <Card titolo="Voci non risolte" valore={num(dati.produzione.nonRisolte)} nota="da classificare" accent={dati.produzione.nonRisolte > 0 ? 'warn' : undefined} />
          <Card titolo="Discrepanze audit" valore={num(dati.auditTotale)} nota="3 vie: DB · master · portale" accent={dati.auditTotale > 0 ? 'warn' : undefined} />
        </>
      )}
    </div>
  );
}
