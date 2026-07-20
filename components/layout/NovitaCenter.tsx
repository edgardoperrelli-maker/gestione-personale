'use client';

import { useEffect, useState } from 'react';
import AnnuncioSquadre, { ANNUNCIO_SQUADRE_KEY } from '@/components/modules/cronoprogramma-personale/AnnuncioSquadre';
import AnnuncioSegnalazione, { ANNUNCIO_SEGNALAZIONE_KEY } from '@/components/segnalazione/AnnuncioSegnalazione';
import AnnuncioOdlPositivi, { ANNUNCIO_ODL_POSITIVI_KEY } from '@/components/modules/interventi/AnnuncioOdlPositivi';
import AnnuncioConfrontoEsiti, { ANNUNCIO_CONFRONTO_ESITI_KEY } from '@/components/modules/assegnazione-ai/AnnuncioConfrontoEsiti';

/** Registro delle "novità" del progetto: un annuncio = una voce (chiave versionata + testo), le più recenti in cima. */
type Annuncio = { key: string; title: string; subtitle: string };
const ANNUNCI: Annuncio[] = [
  {
    key: ANNUNCIO_ODL_POSITIVI_KEY,
    title: 'Stop ai doppi esiti: un ODL positivo si chiude per sempre',
    subtitle: 'Un ordine eseguito positivo non può più essere riassegnato né esitato due volte; la pianificazione ti avvisa.',
  },
  {
    key: ANNUNCIO_CONFRONTO_ESITI_KEY,
    title: 'Controllo esiti DB ↔ ACEA',
    subtitle: 'In Aggiorna stato ODL: doppia conferma dei positivi tra il nostro DB e il portale, con export Excel.',
  },
  {
    key: ANNUNCIO_SEGNALAZIONE_KEY,
    title: 'Segnala bug e idee, in un tocco',
    subtitle: 'Il pulsante megafono in basso a destra manda bug e idee dritte ad ATLAS.',
  },
  {
    key: ANNUNCIO_SQUADRE_KEY,
    title: 'Squadre nel Cronoprogramma',
    subtitle: 'Lega più operatori che lavorano insieme come squadra (da 2 a 4 e oltre).',
  },
];

/**
 * Hub globale delle novità, accanto alla campanella nel TopBar. Raccoglie tutte le novità del
 * progetto: un pallino segnala quelle non ancora viste; il pannello le elenca e ognuna apre il suo
 * tutorial. Il "visto" è per-utente (via /api/annunci) e coerente con l'avviso automatico dei moduli.
 */
export default function NovitaCenter() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        ANNUNCI.map(async (a) => {
          try {
            const res = await fetch(`/api/annunci?key=${a.key}`, { cache: 'no-store' });
            if (!res.ok) return [a.key, true] as const; // in dubbio non segnalo come nuovo
            const j = await res.json();
            return [a.key, !!j.seen] as const;
          } catch {
            return [a.key, true] as const;
          }
        }),
      );
      if (alive) setSeen(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const nuovi = ANNUNCI.filter((a) => seen[a.key] === false).length;

  const apri = (key: string) => {
    setPanelOpen(false);
    setOpenKey(key);
  };

  const chiudiModal = () => {
    const key = openKey;
    setOpenKey(null);
    if (key) {
      setSeen((s) => ({ ...s, [key]: true }));
      fetch('/api/annunci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }).catch(() => {});
    }
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          aria-label="Novità"
          title="Novità"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.8 4.6L18.4 9.4l-4.6 1.8L12 16l-1.8-4.8L5.6 9.4l4.6-1.8z" />
            <path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z" />
          </svg>
          {nuovi > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
              style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--on-primary)' }}
            >
              {nuovi}
            </span>
          )}
        </button>

        {panelOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />
            <div
              className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border shadow-xl"
              style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
            >
              <div className="border-b px-4 py-2.5 text-sm font-semibold" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                Novità
              </div>
              <div className="max-h-[60vh] overflow-y-auto py-1">
                {ANNUNCI.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => apri(a.key)}
                    className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-[var(--brand-surface-muted)]"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
                      {a.title}
                      {seen[a.key] === false && (
                        <span
                          className="rounded-full px-1.5 py-px text-[9px] font-bold uppercase"
                          style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
                        >
                          Nuovo
                        </span>
                      )}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                      {a.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <AnnuncioOdlPositivi open={openKey === ANNUNCIO_ODL_POSITIVI_KEY} onClose={chiudiModal} />
      <AnnuncioConfrontoEsiti open={openKey === ANNUNCIO_CONFRONTO_ESITI_KEY} onClose={chiudiModal} />
      <AnnuncioSegnalazione open={openKey === ANNUNCIO_SEGNALAZIONE_KEY} onClose={chiudiModal} />
      <AnnuncioSquadre open={openKey === ANNUNCIO_SQUADRE_KEY} onClose={chiudiModal} />
    </>
  );
}
