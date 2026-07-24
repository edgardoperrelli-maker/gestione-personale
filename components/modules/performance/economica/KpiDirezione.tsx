'use client';
import StatTile from '@/components/ui/StatTile';
import { eur, num, type DatiProduzione } from './tipi';

// Adapter dai nomi di dominio (titolo/valore/nota/accent) al primitivo StatTile.
function Card({ titolo, valore, nota, accent }: { titolo: string; valore: string; nota?: string; accent?: 'pos' | 'neg' | 'warn' }) {
  const tone = accent === 'pos' ? 'ok' : accent === 'neg' ? 'danger' : accent === 'warn' ? 'warn' : 'neutral';
  return <StatTile label={titolo} value={valore} note={nota} tone={tone} />;
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
