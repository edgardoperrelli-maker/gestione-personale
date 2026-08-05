'use client';
import StatTile from '@/components/ui/StatTile';
import { eur, num, type DatiProduzione } from './tipi';

// Adapter dai nomi di dominio (titolo/valore/nota/accent) al primitivo StatTile.
function Card({ titolo, valore, nota, accent }: { titolo: string; valore: string; nota?: string; accent?: 'pos' | 'neg' | 'warn' }) {
  const tone = accent === 'pos' ? 'ok' : accent === 'neg' ? 'danger' : accent === 'warn' ? 'warn' : 'neutral';
  return <StatTile label={titolo} value={valore} note={nota} tone={tone} />;
}

const GRIGLIA = 'grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6';

/** Fila di KPI per la dirigenza: economia + personale. Con `operative` aggiunge le 2 card di controllo. */
export default function KpiDirezione({ dati, operative }: { dati: DatiProduzione; operative?: boolean }) {
  const prod = dati.produzione.totale.valore;
  const ultimoSal = dati.salStorico.length > 0 ? dati.salStorico[dati.salStorico.length - 1] : null;
  const giornate = dati.personale.totaleGiornate;
  const resa = giornate > 0 ? dati.personale.valoreFeriale / giornate : null;

  /*
    Le tre card del consuntivo — SAL, pre-SAL, fuori-SAL — e le discrepanze d'audit nascono TUTTE
    dal portale SAP di ACEA e dai file SAL ufficiali. Nella vista AcquaLatina spariscono invece di
    mostrare zeri: uno zero accanto a «SAL (pagato)» si legge «non ci hanno pagato niente», che è
    una notizia grave e falsa — la verità è che lì un portale non c'è.

    Nella vista «Tutti» restano, ma staccate in una fila loro, con l'intestazione che dice di chi
    sono: sopra c'è la produzione di DUE commesse, sotto il consuntivo di UNA. In fila indiana si
    leggerebbero come lo scarto di tutto, e lo scarto risulterebbe enorme.
  */
  const conSal = dati.conContabilizzazione;
  const separate = conSal && dati.vista === 'tutti';

  return (
    <>
      <div className={`${separate ? 'mb-3' : 'mb-4'} ${GRIGLIA}`}>
        <Card titolo="Produzione" valore={eur(prod)} nota={`${num(dati.produzione.totale.conteggio)} ordini · nel periodo`} accent="pos" />
        <Card
          titolo="Personale impiegato"
          valore={`${num(dati.personale.operatoriAttivi)} op × ${num(Math.round(giornate))} gg`}
          nota="giornate feriali lun–ven; giorni misti pro-quota"
        />
        <Card titolo="Resa €/giornata" valore={resa == null ? '—' : eur(resa)} nota="produzione feriale / giornate feriali" />
        {operative && (
          <Card titolo="Voci non risolte" valore={num(dati.produzione.nonRisolte)} nota="da classificare" accent={dati.produzione.nonRisolte > 0 ? 'warn' : undefined} />
        )}
        {conSal && !separate && <CardsConsuntivo dati={dati} operative={operative} ultimoSal={ultimoSal} />}
      </div>

      {separate && (
        <div className="mb-4">
          <p className="mb-1 text-[11px] text-[var(--brand-text-subtle)]">
            Contabilizzazione ACEA — AcquaLatina non ha un portale di consuntivazione: questi conti
            riguardano la sola quota ACEA della produzione qui sopra.
          </p>
          <div className={GRIGLIA}>
            <CardsConsuntivo dati={dati} operative={operative} ultimoSal={ultimoSal} />
          </div>
        </div>
      )}
    </>
  );
}

/** Le card che dipendono dal portale ACEA. Estratte perché vivono in due punti diversi della griglia. */
function CardsConsuntivo({
  dati,
  operative,
  ultimoSal,
}: {
  dati: DatiProduzione;
  operative?: boolean;
  ultimoSal: DatiProduzione['salStorico'][number] | null;
}) {
  return (
    <>
      <Card
        titolo={ultimoSal ? `SAL ${num(ultimoSal.n)} (pagato)` : 'SAL (pagato)'}
        valore={ultimoSal ? eur(ultimoSal.valoreAps) : '—'}
        nota={ultimoSal ? `${num(ultimoSal.ordini)} ODL · ${ultimoSal.mese || '—'} · non dipende dal periodo` : 'Nessun SAL caricato'}
      />
      <Card
        titolo={`Pre-SAL ${num(dati.preSal.n)}`}
        valore={eur(dati.preSal.totale.valore)}
        nota={`${num(dati.preSal.totale.conteggio)} ODL nostri positivi, esitati sul portale, non in un SAL · vivo oggi`}
        accent={dati.preSal.totale.valore > 0 ? 'warn' : undefined}
      />
      {/* UN numero solo, mai scomposto con/senza ordine (correzione utente 2026-08-05). */}
      <Card
        titolo="Fuori SAL"
        valore={eur(dati.fuoriSal.valore)}
        nota={`${num(dati.fuoriSal.conteggio)} interventi da esitare · nel periodo`}
        accent={dati.fuoriSal.valore > 0 ? 'warn' : undefined}
      />
      {operative && (
        <Card titolo="Discrepanze audit" valore={num(dati.auditTotale)} nota="3 vie: DB · registro · portale" accent={dati.auditTotale > 0 ? 'warn' : undefined} />
      )}
    </>
  );
}
