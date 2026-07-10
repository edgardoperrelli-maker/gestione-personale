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
  const ultimoSal = dati.salStorico.length > 0 ? dati.salStorico[dati.salStorico.length - 1] : null;
  const giornate = dati.personale.totaleGiornate;
  const resa = giornate > 0 ? dati.personale.valoreFeriale / giornate : null;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Card titolo="Produzione" valore={eur(prod)} nota={`${num(dati.produzione.totale.conteggio)} ordini · nel periodo`} accent="pos" />
        <Card
          titolo={ultimoSal ? `SAL ${num(ultimoSal.n)} (pagato)` : 'SAL (pagato)'}
          valore={ultimoSal ? eur(ultimoSal.valoreAps) : '—'}
          nota={ultimoSal ? `${num(ultimoSal.ordini)} ODL · ${ultimoSal.mese || '—'} · non dipende dal periodo` : 'Nessun SAL caricato'}
        />
        <Card
          titolo={`Pre-SAL ${num(dati.preSal.n)}`}
          valore={eur(dati.preSal.totale.valore)}
          nota={`${num(dati.preSal.totale.conteggio)} ODL esitati sul portale, non in un SAL · vivo oggi`}
          accent={dati.preSal.totale.valore > 0 ? 'warn' : undefined}
        />
        <Card
          titolo="Fuori SAL"
          valore={eur(dati.fuoriSal.valore)}
          nota={`${num(dati.fuoriSal.conteggio)} interventi da esitare · nel periodo`}
          accent={dati.fuoriSal.valore > 0 ? 'warn' : undefined}
        />
        <Card
          titolo="Personale impiegato"
          valore={`${num(dati.personale.operatoriAttivi)} op × ${num(Math.round(giornate))} gg`}
          nota="giornate feriali lun–ven; giorni misti pro-quota"
        />
        <Card titolo="Resa €/giornata" valore={resa == null ? '—' : eur(resa)} nota="produzione feriale / giornate feriali" />
        {operative && (
          <>
            <Card titolo="Voci non risolte" valore={num(dati.produzione.nonRisolte)} nota="da classificare" accent={dati.produzione.nonRisolte > 0 ? 'warn' : undefined} />
            <Card titolo="Discrepanze audit" valore={num(dati.auditTotale)} nota="3 vie: DB · master · portale" accent={dati.auditTotale > 0 ? 'warn' : undefined} />
          </>
        )}
      </div>
    </>
  );
}
