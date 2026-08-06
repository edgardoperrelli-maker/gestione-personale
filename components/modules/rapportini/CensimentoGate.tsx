/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudOff, Download } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import type { CommittenteCensimento } from '@/lib/rapportini/perimetroCensimento';
import {
  etichettaCensimento,
  leggiCensimentoLocalePer,
  metaCensimento,
  scaricaCensimento,
} from '@/lib/offline/censimentoCache';
import { numeroIt } from '@/utils/numero-it';

/**
 * Scaricamento del censimento all'APERTURA DEL LINK.
 *
 * Il controllo di versione è SEMPRE e SILENZIOSO (due query, ~40 byte): la modale compare
 * solo quando c'è davvero qualcosa da scaricare. Chiedere il permesso per non fare niente,
 * nove aperture su dieci, insegna a premere «Scarica» senza leggere — e la decima volta,
 * quella che conta, il messaggio arriva già svalutato.
 *
 * Corollario: la barra ha sempre del lavoro da mostrare, quindi è un progresso vero.
 */
type Stato =
  | { fase: 'controllo' }
  | { fase: 'inerte'; scaricatoIl?: number }        // niente da fare: cache allineata
  | { fase: 'offerta'; versione: string; totale: number }
  | { fase: 'scarico'; versione: string; totale: number; fatte: number }
  | { fase: 'errore'; versione: string; totale: number; scaricate: number; motivo: 'rete' | 'versione_cambiata' }
  | { fase: 'senzaRete'; scaricatoIl?: number };

// Stessa grafia del resto dell'app: il punto delle migliaia c'è anche a quattro cifre.
const nf = { format: (n: number) => numeroIt(n) };

export function CensimentoGate({
  token,
  committente,
}: {
  token: string;
  /** null = il flusso del rapportino non ha un censimento: il componente non fa nulla. */
  committente: CommittenteCensimento | null;
}) {
  const [stato, setStato] = useState<Stato>({ fase: 'controllo' });

  // Controllo all'apertura. `metaCensimento` è no-op offline e non lancia mai.
  useEffect(() => {
    if (!committente) return;
    let vivo = true;
    void (async () => {
      const meta = await metaCensimento(token, committente);
      if (!vivo) return;
      const locale = await leggiCensimentoLocalePer(committente);
      if (!vivo) return;
      // meta null = offline o server irraggiungibile: non si sa, quindi non si chiede niente.
      if (!meta) { setStato({ fase: 'senzaRete', scaricatoIl: locale?.scaricatoIl }); return; }
      if (meta.unchanged) { setStato({ fase: 'inerte', scaricatoIl: locale?.scaricatoIl }); return; }
      setStato({ fase: 'offerta', versione: meta.versione, totale: meta.totale });
    })();
    return () => { vivo = false; };
  }, [token, committente]);

  const avvia = useCallback(async (versione: string, totale: number) => {
    setStato({ fase: 'scarico', versione, totale, fatte: 0 });
    const esito = await scaricaCensimento(token, committente!, versione, totale, (fatte) => {
      setStato({ fase: 'scarico', versione, totale, fatte });
    });
    if (esito.ok) setStato({ fase: 'inerte', scaricatoIl: Date.now() });
    else setStato({ fase: 'errore', versione, totale, scaricate: esito.scaricate, motivo: esito.motivo });
  }, [token, committente]);

  if (!committente) return null;

  const nome = etichettaCensimento(committente);
  const apertaSuOfferta = stato.fase === 'offerta' || stato.fase === 'scarico' || stato.fase === 'errore';

  return (
    <>
      {/* Riga discreta: dice se il campo può contare sulla ricerca offline. Non è un avviso,
          è uno stato — quindi vive in fondo alla pagina, non sopra il lavoro. */}
      {(stato.fase === 'inerte' || stato.fase === 'senzaRete') && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--brand-text-muted)]">
          {stato.fase === 'inerte' ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
              <span>
                Censimento {nome} aggiornato
                {stato.scaricatoIl ? <> · <span className="font-mono tabular-nums">{new Date(stato.scaricatoIl).toLocaleDateString('it-IT')}</span></> : null}
              </span>
            </>
          ) : (
            <>
              <CloudOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
              <span>
                {stato.scaricatoIl
                  ? <>Senza rete: si usa il censimento {nome} scaricato il <span className="font-mono tabular-nums">{new Date(stato.scaricatoIl).toLocaleDateString('it-IT')}</span></>
                  : <>Censimento {nome} non disponibile: la ricerca per matricola funziona solo online</>}
              </span>
            </>
          )}
        </p>
      )}

      <Dialog
        open={apertaSuOfferta}
        // Durante lo scaricamento la modale non si chiude per sbaglio: `busy` disattiva
        // Escape e clic sull'overlay (primitivo Dialog).
        busy={stato.fase === 'scarico'}
        onClose={() => setStato({ fase: 'inerte' })}
        variant="sheet"
        title={`Dati di campo — ${nome}`}
        className="pb-[env(safe-area-inset-bottom)] sm:max-w-[420px] sm:pb-0"
        footer={
          stato.fase === 'offerta' ? (
            <>
              <Button size="touch" variant="outline" className="shrink-0" onClick={() => setStato({ fase: 'inerte' })}>
                Non ora
              </Button>
              <Button size="touch" variant="primary" className="flex-1" onClick={() => void avvia(stato.versione, stato.totale)}>
                <Download className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                Scarica
              </Button>
            </>
          ) : stato.fase === 'errore' ? (
            <>
              <Button size="touch" variant="outline" className="shrink-0" onClick={() => setStato({ fase: 'inerte' })}>
                Chiudi
              </Button>
              <Button size="touch" variant="primary" className="flex-1" onClick={() => void avvia(stato.versione, stato.totale)}>
                Riprova
              </Button>
            </>
          ) : null
        }
      >
        {stato.fase === 'offerta' && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--brand-text-main)]">
              Ci sono <b className="font-mono tabular-nums">{nf.format(stato.totale)}</b> misuratori da scaricare.
            </p>
            <p className="text-sm text-[var(--brand-text-muted)]">
              Servono a cercare le matricole <b>anche senza rete</b>. Falla ora, finché hai campo: davanti al
              contatore potresti non averne.
            </p>
          </div>
        )}

        {stato.fase === 'scarico' && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--brand-text-muted)]">Scaricamento in corso. Non chiudere la pagina.</p>
            <Barra fatte={stato.fatte} totale={stato.totale} />
          </div>
        )}

        {stato.fase === 'errore' && (
          <div className="space-y-3">
            <div className="rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-sm text-[var(--brand-text-main)]">
              {stato.motivo === 'versione_cambiata' ? (
                <>L&apos;ufficio ha caricato un master nuovo mentre scaricavi. Riprova: si riparte dal dato aggiornato.</>
              ) : (
                <>Scaricamento interrotto a <span className="font-mono tabular-nums">{nf.format(stato.scaricate)}</span> di{' '}
                  <span className="font-mono tabular-nums">{nf.format(stato.totale)}</span>. Riprova quando hai rete.</>
              )}
            </div>
            {/* Detto esplicitamente: un mezzo censimento in cache farebbe bloccare misuratori
                regolarmente a catalogo, e l'operatore non avrebbe modo di accorgersene. */}
            <p className="text-xs text-[var(--brand-text-muted)]">
              Non è stato salvato niente a metà: la ricerca continua a funzionare online.
            </p>
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Barra di avanzamento a larghezza piena. Stessa matematica e stessi token di
 *  `components/ui/ProgressPill`, che però è pensata per stare in una cella di tabella. */
function Barra({ fatte, totale }: { fatte: number; totale: number }) {
  const pct = totale > 0 ? Math.min(100, Math.round((fatte / totale) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--brand-border)]"
        role="progressbar"
        aria-valuenow={fatte}
        aria-valuemin={0}
        aria-valuemax={totale}
        aria-label="Avanzamento dello scaricamento"
      >
        <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }} />
      </div>
      <p className="text-right font-mono text-xs tabular-nums text-[var(--brand-text-muted)]" aria-live="polite">
        {nf.format(fatte)} / {nf.format(totale)}
      </p>
    </div>
  );
}
