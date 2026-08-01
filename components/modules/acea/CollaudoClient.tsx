'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleDot, Link2, RefreshCw } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import StatTile from '@/components/ui/StatTile';
import { toast } from '@/components/ui/Toast';
import { chiediConferma } from '@/components/ui/chiediConferma';
import type { Confronto } from '@/lib/acea/collaudo';

type Semaforo = 'verde' | 'giallo' | 'rosso';

type Rapporto = {
  registro: {
    ordini: number; aperti: number; dunning: number; massive: number;
    dal: string | null; al: string | null;
  };
  ultimoImport: {
    nome_file: string | null; righe_totali: number;
    finestra_dal: string | null; finestra_al: string | null; caricato_il: string;
  } | null;
  backfill: { interventiAcea: number; agganciati: number };
  portale: Confronto & { semaforo: Semaforo; raccoltoIl: string | null };
  master: Confronto & { semaforo: Semaforo };
  error?: string;
};

/** I must-have concordati: senza questi il master non si spegne. Si spuntano provandoli. */
const CANCELLI = [
  'Filtri per colonna (comune, attività, stato, operatore)',
  'Ordinamento cliccando l’intestazione',
  'Selezione multipla con shift-click',
  'Assegnazione in blocco a un operatore e a un giorno',
  'Ricerca libera',
  'Scelta delle colonne visibili',
  'Conteggio delle righe filtrate',
  'Evidenziazione degli ordini scaduti',
  'Export xlsx della vista',
  'Annullamento dell’ultima azione in blocco',
  'Editing di cella con copia/incolla da Excel',
  'Rapportini del giorno generati e visibili all’operatore',
  'Export del pianificato leggibile per l’assegnazione sul Cruscotto',
] as const;

const CHIAVE_LOCALE = 'acea-collaudo-cancelli';

// Indicatori di stato: token `--status-*` (DESIGN.md §«Semantici e stato»). I tre glifi sono
// DIVERSI di proposito — spunta, punto, punto esclamativo — così il semaforo non vive nel colore.
const ICONA: Record<Semaforo, React.ReactNode> = {
  verde: <CircleCheck size={16} className="text-[var(--status-ok)]" aria-hidden="true" />,
  giallo: <CircleDot size={16} className="text-[var(--status-warn)]" aria-hidden="true" />,
  rosso: <CircleAlert size={16} className="text-[var(--status-ko)]" aria-hidden="true" />,
};

const dataOra = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

function BloccoConfronto({
  titolo, spiegazione, c, nomeAltra,
}: {
  titolo: string;
  spiegazione: string;
  c: Confronto & { semaforo: Semaforo };
  nomeAltra: string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--brand-border)] p-3">
      <div className="flex items-center gap-2">
        {ICONA[c.semaforo]}
        {/*
          Il glifo distingue il semaforo per chi vede (i tre sono diversi apposta), ma è
          aria-hidden: a chi ascolta serve la parola. Uno span sr-only, non un aria-label sul
          contenitore — il titolo resta un h3 navigabile pulito.
        */}
        <span className="sr-only">stato: {c.semaforo}.</span>
        <h3 className="text-sm font-semibold text-[var(--brand-text-main)]">{titolo}</h3>
      </div>
      <p className="mt-1 text-xs text-[var(--brand-text-muted)]">{spiegazione}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="In entrambi" value={c.inEntrambi} size="sm" />
        <StatTile
          label="Stato concorde"
          value={c.concordi}
          size="sm"
          tone={c.statoDiverso.totale === 0 ? 'ok' : 'warn'}
          note={c.statoDiverso.totale > 0 ? `${c.statoDiverso.totale} discordi` : undefined}
        />
        <StatTile
          label={`Solo in ${nomeAltra}`}
          value={c.soloAltra.totale}
          size="sm"
          tone={c.soloAltra.totale > 0 ? 'danger' : 'ok'}
          note="lavoro che il modulo non vedrebbe"
        />
        <StatTile
          label="Solo nel modulo"
          value={c.soloModulo.totale}
          size="sm"
          note="di solito la finestra più larga"
        />
      </div>

      {/*
        Elenchi, non prosa. Erano due paragrafi da 900 caratteri con gli ODL appiattiti da un
        `join('; ')`: per trovarne uno si leggeva a occhio un muro di testo, ed e` la cosa
        precisa che si viene a fare qui prima del cut-over. Gli ODL vanno in mono tabulare
        (DESIGN.md §4: matricole e dati numerici) cosi` le cifre si incolonnano e la lettura e`
        verticale; l'elenco scorre dentro la sua altezza invece di spingere giu` la pagina.
      */}
      {c.statoDiverso.totale > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[var(--brand-text-main)]">
            Stati discordi{' '}
            <span className="font-normal text-[var(--brand-text-muted)]">({c.statoDiverso.totale})</span>
          </p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-xs text-[var(--brand-text-muted)]">
            {c.statoDiverso.esempi.map((d) => (
              <li key={d.odl}>
                <span className="font-mono tabular-nums text-[var(--brand-text-main)]">{d.odl}</span>
                {' '}— modulo {d.modulo}, {nomeAltra} {d.altra}
              </li>
            ))}
          </ul>
          {c.statoDiverso.totale > c.statoDiverso.esempi.length && (
            <p className="mt-1 text-[11px] text-[var(--brand-text-subtle)]">
              e altri {c.statoDiverso.totale - c.statoDiverso.esempi.length}
            </p>
          )}
        </div>
      )}
      {c.soloAltra.totale > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[var(--brand-text-main)]">
            Assenti dal modulo{' '}
            <span className="font-normal text-[var(--brand-text-muted)]">({c.soloAltra.totale})</span>
          </p>
          {/*
            Il mono va sul solo ODL e non su tutta la riga: qui gli esempi a volte sono il
            numero nudo e a volte il numero piu` una descrizione ("... assegnare"), e la
            descrizione in monospace si legge peggio, non meglio.
          */}
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-xs text-[var(--brand-text-muted)]">
            {c.soloAltra.esempi.map((v) => {
              const [odl, ...resto] = v.split(' ');
              return (
                <li key={v}>
                  <span className="font-mono tabular-nums text-[var(--brand-text-main)]">{odl}</span>
                  {resto.length > 0 && ` ${resto.join(' ')}`}
                </li>
              );
            })}
          </ul>
          {c.soloAltra.totale > c.soloAltra.esempi.length && (
            <p className="mt-1 text-[11px] text-[var(--brand-text-subtle)]">
              e altri {c.soloAltra.totale - c.soloAltra.esempi.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Collaudo e cut-over: la prova che serve prima di spegnere il master.
 *
 * Il confronto col portale è quello che decide — è la stessa fonte da cui arriva l'export, letta
 * in modo indipendente dall'agente. Il confronto col master serve a capire la differenza, non a
 * validarla: quel file ha, nella colonna stato, gli stati ACEA insieme ai nostri, «DA CHIEDERE»,
 * celle vuote e righe con `[object Object]`.
 *
 * I conteggi mostrati arrivano tutti da `/api/acea/collaudo`. Nessun numero è scritto qui dentro:
 * una cifra fissata nel testo resta ferma mentre i dati cambiano, e nessuno che la legge può sapere
 * a quando risale.
 */
export default function CollaudoClient() {
  const [rapporto, setRapporto] = useState<Rapporto | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fatti, setFatti] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const salvato = window.localStorage.getItem(CHIAVE_LOCALE);
      if (salvato) setFatti(new Set(JSON.parse(salvato) as string[]));
    } catch {
      /* spunte perse: si rifanno, non è un dato importante */
    }
  }, []);

  const spunta = useCallback((c: string) => {
    setFatti((prec) => {
      const agg = new Set(prec);
      if (agg.has(c)) agg.delete(c); else agg.add(c);
      try {
        window.localStorage.setItem(CHIAVE_LOCALE, JSON.stringify([...agg]));
      } catch {
        /* niente localStorage: le spunte valgono per questa sessione */
      }
      return agg;
    });
  }, []);

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch('/api/acea/collaudo');
      const body = (await res.json()) as Rapporto;
      if (!res.ok) { setErrore(body.error ?? 'Lettura non riuscita.'); return; }
      setRapporto(body);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Lettura non riuscita.');
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  const backfill = useCallback(async () => {
    const ok = await chiediConferma({
      title: 'Collegare gli interventi ACEA al registro?',
      message:
        'Tocca solo gli interventi ancora senza collegamento, quindi si può rilanciare senza rischi. '
        + 'Va fatto dopo il primo import.',
      confirmLabel: 'Collega',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/acea/backfill-ordini', { method: 'POST' });
      const body = (await res.json()) as {
        collegati: number; esaminati: number; senzaOrdineNelRegistro: number; error?: string;
      };
      if (!res.ok) { toast.error(body.error ?? 'Backfill non riuscito.'); return; }
      toast.success(`${body.collegati} interventi collegati su ${body.esaminati} esaminati`);
      if (body.senzaOrdineNelRegistro > 0) {
        toast.info(
          `${body.senzaOrdineNelRegistro} interventi restano senza ordine: il loro ODL è fuori `
          + 'dalla finestra dell’export o è stato annullato da ACEA.',
        );
      }
      await carica();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backfill non riuscito.');
    } finally {
      setBusy(false);
    }
  }, [carica]);

  const r = rapporto;
  const registroVuoto = (r?.registro.ordini ?? 0) === 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Stato del registro</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void carica()}
            loading={caricando}
            className="ml-auto"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Ricalcola
          </Button>
        </div>

        {errore && <p className="mt-2 text-sm text-[var(--danger)]">{errore}</p>}

        {r && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Ordini nel registro" value={r.registro.ordini} />
              <StatTile label="Aperti" value={r.registro.aperti} tone="primary" />
              <StatTile label="Dunning" value={r.registro.dunning} size="sm" />
              <StatTile label="Limitazioni massive" value={r.registro.massive} size="sm" />
            </div>
            <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
              {r.ultimoImport
                ? `Ultimo import: ${r.ultimoImport.nome_file ?? 'senza nome'} — ${r.ultimoImport.righe_totali} righe, caricato il ${dataOra(r.ultimoImport.caricato_il)}.`
                : 'Nessun import ancora caricato: il collaudo comincia da lì.'}
            </p>
          </>
        )}
      </Card>

      {r && !registroVuoto && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Confronto oggettivo</h2>
          <div className="mt-3 space-y-3">
            <BloccoConfronto
              titolo="Modulo contro Cruscotto"
              spiegazione={
                'È il confronto che decide: la stessa fonte da cui arriva l’export, letta in modo '
                + 'indipendente dall’agente. Se non coincidono, l’import sbaglia.'
                + (r.portale.raccoltoIl ? ` Lettura del ${dataOra(r.portale.raccoltoIl)}.` : '')
              }
              c={r.portale}
              nomeAltra="Cruscotto"
            />
            <BloccoConfronto
              titolo="Modulo contro master"
              spiegazione={
                'Serve a capire la differenza, non a validarla: nella colonna stato del master '
                + 'convivono gli stati ACEA, i nostri, «DA CHIEDERE», celle vuote e righe con '
                + '[object Object]. Qui «aperto» vuol dire riga senza esito.'
              }
              c={r.master}
              nomeAltra="master"
            />
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link2 size={16} className="text-[var(--brand-text-muted)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">
            Collegamento interventi ↔ ordini
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void backfill()}
            loading={busy}
            disabled={registroVuoto}
            className="ml-auto"
          >
            Collega
          </Button>
        </div>
        {r && (
          <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
            {r.backfill.agganciati} interventi ACEA su {r.backfill.interventiAcea} sono collegati al
            registro.{' '}
            {registroVuoto
              ? 'Il registro è vuoto: prima l’import.'
              : 'Si può rilanciare quando si vuole: tocca solo quelli ancora scollegati.'}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">
          Cancelli di collaudo{' '}
          <span className="font-mono tabular-nums text-[var(--brand-text-muted)]">
            {fatti.size}/{CANCELLI.length}
          </span>
        </h2>
        <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
          Sono i must-have concordati: finché non sono tutti provati sui dati veri, il master resta
          acceso. Le spunte restano su questo browser.
        </p>
        <ul className="mt-3 space-y-1.5">
          {CANCELLI.map((c) => (
            <li key={c}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--brand-text-main)]">
                <input
                  type="checkbox"
                  checked={fatti.has(c)}
                  onChange={() => spunta(c)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                />
                <span className={fatti.has(c) ? 'text-[var(--brand-text-muted)] line-through' : ''}>
                  {c}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
