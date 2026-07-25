'use client';

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md
 * designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Consuntivazione: il back office carica ed esita interventi come se fossero chiusi
 * dal rapportino di un operatore. Allineamento al sistema Cockpit (07-24): glifi
 * Unicode (icone foglietta disegnate a mano, ← → × ✕ ✨) → icone lucide; l'annuncio
 * Novità dall'overlay createPortal fatto a mano → primitivo Dialog; l'esito calcolato
 * → Badge di stato; pannelli-filtro senza doppio bordo (un solo livello di card).
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, FileSearch } from 'lucide-react';
import NuovoOrdineForm from './NuovoOrdineForm';
import OrdinePresenteForm from './OrdinePresenteForm';
import AnnuncioConsuntivazione, { ANNUNCIO_CONSUNTIVAZIONE_KEY } from './AnnuncioConsuntivazione';
import ObjectHeader from '@/components/ui/ObjectHeader';
import Skeleton from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { Operatore } from './SquadraPicker';

export type Bootstrap = {
  operatori: Operatore[];
  committenti: { value: string; label: string }[];
  territori: { value: string; label: string }[];
  attivita: { committente: string; descrizione: string; gruppo: string }[];
  flussi: { id: string; nome: string | null; campi: TemplateCampo[]; solo_manuale: boolean; gruppo_committente: string | null; gruppi_attivita: string[] | null }[];
  fallbackCampi: TemplateCampo[];
};

type Vista = 'home' | 'nuovo' | 'presente';

const FOGLIETTE: { id: Exclude<Vista, 'home'>; titolo: string; desc: string; icona: React.ReactNode }[] = [
  {
    id: 'nuovo',
    titolo: 'Nuovo ordine',
    desc: 'Crea un ordine da zero e chiudilo come da rapportino: anagrafica, azioni, foto ed esito.',
    icona: <ClipboardList strokeWidth={1.6} aria-hidden />,
  },
  {
    id: 'presente',
    titolo: 'Ordine presente',
    desc: 'Esita un intervento rimasto aperto dai rapportini: compila le sue azioni e chiudilo.',
    icona: <FileSearch strokeWidth={1.6} aria-hidden />,
  },
];

export default function ConsuntivazioneClient() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [erroreBoot, setErroreBoot] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('home');
  const [annuncioOpen, setAnnuncioOpen] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch('/api/admin/consuntivazione')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bootstrap'))))
      .then((j) => { if (vivo) setBoot(j as Bootstrap); })
      .catch(() => { if (vivo) setErroreBoot('Impossibile caricare i dati del modulo.'); });
    return () => { vivo = false; };
  }, []);

  // Avviso "novità" (once-per-utente via DB): al primo accesso al modulo mostra la stessa
  // modale delle Novità, così chi ha saltato la notifica ne legge comunque la spiegazione.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/annunci?key=${ANNUNCIO_CONSUNTIVAZIONE_KEY}`, { cache: 'no-store' });
        if (!res.ok || !vivo) return;
        const j = await res.json();
        if (vivo && !j.seen) setAnnuncioOpen(true);
      } catch {
        // best-effort: se non riesco a verificare, non mostro l'avviso
      }
    })();
    return () => { vivo = false; };
  }, []);

  const chiudiAnnuncio = () => {
    setAnnuncioOpen(false);
    fetch('/api/annunci', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: ANNUNCIO_CONSUNTIVAZIONE_KEY }),
    }).catch(() => {});
  };

  const onDone = (msg: string) => { toast.success(msg); setVista('home'); };

  const titoloCorrente = vista === 'nuovo' ? 'Nuovo ordine' : vista === 'presente' ? 'Ordine presente' : null;

  return (
    <div>
      <header className="mb-6">
        <ObjectHeader
          title="Consuntivazione"
          sub="Carica ed esita interventi dal back office, come se fossero chiusi dal rapportino di un operatore, e assegna l'esecuzione a uno o più operatori."
        />
      </header>

      {erroreBoot ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--status-ko)]/40 bg-[var(--status-ko-soft)] p-4 text-sm text-[var(--status-ko)]">{erroreBoot}</p>
      ) : !boot ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-56 rounded-[var(--radius-xl)]" />)}
        </div>
      ) : vista === 'home' ? (
        <div className="grid gap-5 md:grid-cols-2">
          {FOGLIETTE.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setVista(f.id)}
              className="group flex min-h-56 flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-7 text-left shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-[var(--shadow-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] motion-reduce:hover:translate-y-0 sm:p-8"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)] [&>svg]:h-7 [&>svg]:w-7">
                {f.icona}
              </span>
              <span className="text-lg font-semibold text-[var(--brand-text-main)]">{f.titolo}</span>
              <span className="max-w-[52ch] text-sm leading-relaxed text-[var(--brand-text-muted)]">{f.desc}</span>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary-text)]">
                Apri
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" aria-hidden />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <section className="rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
          <div className="mb-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVista('home')}
              aria-label="Torna alla scelta della vista"
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--brand-text-muted)] transition-colors hover:bg-[var(--brand-surface-muted)] hover:text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <h2 className="text-lg font-semibold text-[var(--brand-text-main)]">{titoloCorrente}</h2>
          </div>
          {vista === 'nuovo'
            ? <NuovoOrdineForm boot={boot} onDone={onDone} />
            : <OrdinePresenteForm boot={boot} onDone={onDone} />}
        </section>
      )}

      <AnnuncioConsuntivazione open={annuncioOpen} onClose={chiudiAnnuncio} />
    </div>
  );
}
