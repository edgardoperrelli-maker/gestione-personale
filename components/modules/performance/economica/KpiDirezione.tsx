'use client';
import StatTile from '@/components/ui/StatTile';
import { eur, num, type DatiProduzione } from './tipi';

// Adapter dai nomi di dominio (titolo/valore/nota/accent) al primitivo StatTile.
function Card({ titolo, valore, nota, accent }: { titolo: string; valore: string; nota?: string; accent?: 'pos' | 'neg' | 'warn' }) {
  const tone = accent === 'pos' ? 'ok' : accent === 'neg' ? 'danger' : accent === 'warn' ? 'warn' : 'neutral';
  return <StatTile label={titolo} value={valore} note={nota} tone={tone} />;
}

const GRIGLIA = 'grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6';

/*
  Fila di KPI per la dirigenza: economia + personale.

  Le card «Voci non risolte» e «Discrepanze audit» sono state tolte (richiesta utente 2026-08-06):
  erano conteggi di igiene dei dati in mezzo a numeri di denaro, e il loro posto è l'elenco
  dell'audit più in basso nella pagina, dove si possono anche aprire. Al loro posto il pre-SAL
  affiancato — nostro, di ACEA e il delta — che è la domanda vera di fine mese.
*/
export default function KpiDirezione({ dati }: { dati: DatiProduzione }) {
  const prod = dati.produzione.totale.valore;
  const ultimoSal = dati.salStorico.length > 0 ? dati.salStorico[dati.salStorico.length - 1] : null;
  /*
    Due misure diverse, che la card confondeva (correzione utente 2026-08-06):
    - `giornate` = GIORNATE-UOMO (somma delle frazioni: 4 operatori per 5 giorni ≈ 19);
    - `giorniLavorati` = GIORNI di calendario in cui si è davvero lavorato (6, se il primo
      intervento è del 29/07), che non dipende dall'ampiezza del periodo a schermo.
    «4 op × 19 gg» moltiplicava le due cose (76 uomo-giorno) e la media giornaliera divideva la
    produzione per le giornate-uomo: usciva la resa per uomo, non quella del giorno.
  */
  const giornate = dati.personale.totaleGiornate;
  const giorniLavorati = dati.personale.giorniLavorati;
  const mediaGiornaliera = giorniLavorati > 0 ? dati.personale.valoreFeriale / giorniLavorati : null;
  const resaUomo = giornate > 0 ? dati.personale.valoreFeriale / giornate : null;

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
          valore={`${num(dati.personale.operatoriAttivi)} op × ${num(giorniLavorati)} gg`}
          nota={`giorni feriali con lavoro in commessa · ${num(giornate)} giornate-uomo`}
        />
        <Card
          titolo="Produzione media giornaliera"
          valore={mediaGiornaliera == null ? '—' : eur(mediaGiornaliera)}
          nota={resaUomo == null
            ? 'produzione feriale / giorni lavorati'
            : `produzione feriale / giorni lavorati · ${eur(resaUomo)} per uomo-giorno`}
        />
        {conSal && !separate && <CardsConsuntivo dati={dati} ultimoSal={ultimoSal} />}
      </div>

      {separate && (
        <div className="mb-4">
          <p className="mb-1 text-[11px] text-[var(--brand-text-subtle)]">
            Contabilizzazione ACEA — AcquaLatina non ha un portale di consuntivazione: questi conti
            riguardano la sola quota ACEA della produzione qui sopra.
          </p>
          <div className={GRIGLIA}>
            <CardsConsuntivo dati={dati} ultimoSal={ultimoSal} />
          </div>
        </div>
      )}
    </>
  );
}

/** Le card che dipendono dal portale ACEA. Estratte perché vivono in due punti diversi della griglia. */
function CardsConsuntivo({
  dati,
  ultimoSal,
}: {
  dati: DatiProduzione;
  ultimoSal: DatiProduzione['salStorico'][number] | null;
}) {
  /*
    Il delta è NOSTRO − ACEA, come lo scarto Produzione−SAL: positivo = contiamo più di quanto il
    committente si prepari a pagare (di solito lavoro a nostro carico o tariffe diverse), negativo
    = ACEA pagherà ordini che da noi non hanno un riscontro, ed è il verso da guardare per primo.
  */
  const delta = dati.preSal.totale.valore - dati.preSal.acea.valore;
  const scostaSensibile = Math.abs(delta) > 0.01;
  return (
    <>
      <Card
        titolo={ultimoSal ? `SAL ${num(ultimoSal.n)} (pagato)` : 'SAL (pagato)'}
        valore={ultimoSal ? eur(ultimoSal.valoreAps) : '—'}
        nota={ultimoSal ? `${num(ultimoSal.ordini)} ODL · ${ultimoSal.mese || '—'} · non dipende dal periodo` : 'Nessun SAL caricato'}
      />
      {/*
        I tre numeri del pre-SAL, nell'ordine in cui si leggono: quanto ACEA si prepara a
        emettere, quanto contiamo noi, e la differenza. Tutti e tre sulla finestra scelta e
        sull'asse del committente (la sua data di completamento), altrimenti non sarebbero
        confrontabili.
      */}
      <Card
        titolo={`Pre-SAL ${num(dati.preSal.n)} · ACEA`}
        valore={eur(dati.preSal.acea.valore)}
        nota={`${num(dati.preSal.acea.conteggio)} ordini consuntivati e pagabili, non ancora in un SAL · Valore Netto ACEA`}
      />
      <Card
        titolo={`Pre-SAL ${num(dati.preSal.n)} · nostro`}
        valore={eur(dati.preSal.totale.valore)}
        nota={`${num(dati.preSal.totale.conteggio)} ODL con riscontro nostro, a listino · ${eur(dati.preSal.totaleVivo.valore)} in tutto a oggi`}
        accent={dati.preSal.totale.valore > 0 ? 'warn' : undefined}
      />
      <Card
        titolo="Δ pre-SAL (nostro − ACEA)"
        valore={eur(delta)}
        nota={dati.preSal.nonRemunerato > 0
          ? `di cui ${eur(dati.preSal.nonRemunerato)} a nostro carico (causale non-E)`
          : 'stesso periodo, stesse date: differenza di riscontri e tariffe'}
        accent={!scostaSensibile ? 'pos' : delta < 0 ? 'neg' : 'warn'}
      />
      {/* UN numero solo, mai scomposto con/senza ordine (correzione utente 2026-08-05). */}
      <Card
        titolo="Fuori SAL"
        valore={eur(dati.fuoriSal.valore)}
        nota={`${num(dati.fuoriSal.conteggio)} interventi da esitare · nel periodo`}
        accent={dati.fuoriSal.valore > 0 ? 'warn' : undefined}
      />
    </>
  );
}
