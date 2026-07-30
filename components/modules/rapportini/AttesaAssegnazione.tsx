/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import Button from '@/components/Button';
import { haNovita, idDecisi, novitaAssegnazione, type VoceStato } from '@/lib/rapportini/attesaAssegnazione';

const INTERVALLO_MS = 10_000;

/**
 * L'operatore ha chiesto una o più assegnazioni ed è FERMO sul posto.
 *
 * Può mandarne quante ne vuole di fila — tre contatori dello stesso stabile si chiedono
 * insieme, e in ufficio arrivano in blocco. Finché le voci sono sospese non può lavorarci, e
 * il rapportino non si aggiorna da solo: qui si chiede al server ogni 10 secondi, **solo**
 * mentre c'è qualcosa in sospeso, solo con la pagina in primo piano e solo online.
 *
 * Appena l'ufficio assegna, le voci diventano editabili DA SOLE: `onAssegnate` le sblocca
 * nello stato del rapportino, senza ricaricare la pagina e senza che l'operatore tocchi
 * niente. Il reload resta solo per il caso in cui la voce assegnata non sia ancora a schermo
 * — una richiesta mandata dopo il caricamento — perché lì non c'è niente da sbloccare.
 */
export function AttesaAssegnazione({
  token,
  voci,
  onAssegnate,
  onRifiutate,
}: {
  token: string;
  voci: VoceStato[];
  /** Sblocca le voci indicate nello stato del rapportino. Torna quante ne ha trovate. */
  onAssegnate: (ids: string[]) => number;
  onRifiutate: (ids: string[]) => number;
}) {
  const [inAttesaOra, setInAttesaOra] = useState(() => voci.filter((v) => v.approvazione_stato === 'in_attesa').length);
  const [esito, setEsito] = useState<null | { tipo: 'assegnate' | 'rifiutate'; quante: number; daRicaricare: boolean }>(null);
  // Voci già decise e già annunciate: il confronto è contro questo, non contro lo stato
  // iniziale della pagina, così le richieste create DOPO il caricamento emergono comunque.
  const notiRef = useRef<Set<string>>(idDecisi(voci));
  // Il polling parte anche a zero voci sospese: una richiesta appena mandata non è ancora a
  // schermo, e senza questo nessuno la aspetterebbe.
  const attivoRef = useRef(true);

  useEffect(() => {
    let vivo = true;

    const chiedi = async () => {
      if (!vivo || !attivoRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const res = await fetch(`/api/r/${token}/stato-voci`, { cache: 'no-store' });
        if (!res.ok || !vivo) return;
        const j = (await res.json()) as { voci?: VoceStato[] };
        const n = novitaAssegnazione(notiRef.current, j.voci ?? []);
        if (!vivo) return;
        setInAttesaOra(n.ancoraInAttesa);
        if (!haNovita(n)) return;
        // Segna come annunciate PRIMA di mostrare: un secondo giro non deve ripeterle.
        for (const id of [...n.assegnate, ...n.rifiutate]) notiRef.current.add(id);
        if (n.assegnate.length > 0) {
          const sbloccate = onAssegnate(n.assegnate);
          setEsito({ tipo: 'assegnate', quante: n.assegnate.length, daRicaricare: sbloccate < n.assegnate.length });
        } else {
          const viste = onRifiutate(n.rifiutate);
          setEsito({ tipo: 'rifiutate', quante: n.rifiutate.length, daRicaricare: viste < n.rifiutate.length });
        }
      } catch {
        /* best-effort: al prossimo giro */
      }
    };

    const id = setInterval(() => void chiedi(), INTERVALLO_MS);
    // Un giro anche al rientro in primo piano: chi riprende in mano il telefono dopo due
    // minuti non deve aspettarne altri dieci.
    const onVisibile = () => { if (document.visibilityState === 'visible') void chiedi(); };
    document.addEventListener('visibilitychange', onVisibile);
    return () => { vivo = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisibile); };
  }, [token, onAssegnate, onRifiutate]);

  // Niente in sospeso e niente da annunciare: il componente sparisce e smette di chiedere.
  useEffect(() => { attivoRef.current = inAttesaOra > 0 || esito == null; }, [inAttesaOra, esito]);

  if (esito) {
    const assegnate = esito.tipo === 'assegnate';
    return (
      <div className={`mt-3 rounded-[var(--radius-lg)] border-2 p-3 ${assegnate ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-[var(--danger)] bg-[var(--danger-soft)]'}`} aria-live="polite">
        <p className={`flex items-start gap-2 text-sm font-semibold ${assegnate ? 'text-[var(--brand-text-main)]' : 'text-[var(--danger)]'}`}>
          {assegnate
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-primary)]" strokeWidth={2} aria-hidden />
            : <XCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />}
          <span>
            {assegnate
              ? esito.quante === 1
                ? 'Misuratore assegnato: puoi eseguire l’intervento.'
                : `${esito.quante} misuratori assegnati: puoi eseguire gli interventi.`
              : esito.quante === 1
                ? 'Richiesta non accolta. Non eseguire l’intervento: contatta l’ufficio.'
                : `${esito.quante} richieste non accolte. Contatta l’ufficio.`}
          </span>
        </p>
        {/* Il bottone compare SOLO se qualcosa non era a schermo (richiesta mandata dopo il
            caricamento): le voci già presenti si sono sbloccate da sole, senza reload. */}
        {esito.daRicaricare ? (
          <Button variant={assegnate ? 'primary' : 'outline'} size="touch" className="mt-3 w-full" onClick={() => window.location.reload()}>
            {assegnate ? 'Apri gli interventi' : 'Aggiorna'}
          </Button>
        ) : (
          <Button variant="outline" size="touch" className="mt-3 w-full" onClick={() => setEsito(null)}>
            Ho capito
          </Button>
        )}
      </div>
    );
  }

  if (inAttesaOra === 0) return null;

  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3"
      aria-live="polite"
    >
      <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--brand-text-main)]">
          {inAttesaOra === 1
            ? 'In attesa che l’ufficio assegni il misuratore.'
            : `In attesa di ${inAttesaOra} assegnazioni.`}
        </p>
        <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
          Puoi intanto chiederne altre col <b>+</b>. Appena sono assegnate diventano compilabili qui,
          senza ricaricare.
        </p>
      </div>
    </div>
  );
}
