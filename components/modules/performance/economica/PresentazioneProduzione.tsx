'use client';
import { useEffect, useState } from 'react';
import KpiDirezione from './KpiDirezione';
import TrendProduzioneSal from './TrendProduzioneSal';
import SalStorico from './SalStorico';
import ComposizioneProduzione from './ComposizioneProduzione';
import PersonaleImpegno from './PersonaleImpegno';
import EsitiOperatore from './EsitiOperatore';
import CandeleSettimanali from './CandeleSettimanali';
import type { DatiProduzione } from './tipi';

/** Vista presentazione per la dirigenza: schermo intero, TEMA CHIARO FORZATO, solo KPI + grafici.
 *  Il tema si forza aggiungendo la classe `light` su <html> (meccanismo di app/layout.tsx);
 *  all'uscita si ripristina lo stato precedente. */
export default function PresentazioneProduzione({ from, to }: { from: string; to: string }) {
  const [dati, setDati] = useState<DatiProduzione | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    const aveva = document.documentElement.classList.contains('light');
    document.documentElement.classList.add('light');
    return () => {
      if (!aveva) document.documentElement.classList.remove('light');
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/acea/produzione?from=${from}&to=${to}`, { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        if (vivo) setDati((await res.json()) as DatiProduzione);
      } catch (e) {
        if (vivo) setErrore(e instanceof Error ? e.message : 'Errore caricamento.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [from, to]);

  const dataIT = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--brand-text-main)]">
      <div className="mx-auto max-w-[1400px] p-6 lg:p-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Commessa ACEA — Produzione economica</h1>
            <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
              Periodo {dataIT(from)} → {dataIT(to)} · Produzione = lavorato valorizzato · SAL = ordini pagati (file ufficiale ACEA)
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <a href="/hub/performance/economica" className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--brand-border)] px-3 text-xs text-[var(--brand-text-muted)]">
              ← Torna al modulo
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3 text-xs font-medium text-white"
            >
              Stampa / PDF
            </button>
          </div>
        </div>

        {errore && <p className="text-sm text-[var(--danger)]">{errore}</p>}
        {!dati && !errore && <p className="py-16 text-center text-sm text-[var(--brand-text-muted)]">Carico i dati…</p>}

        {dati && (
          <div className="space-y-6">
            <section className="break-inside-avoid">
              <KpiDirezione dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <TrendProduzioneSal dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <SalStorico dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <ComposizioneProduzione dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <PersonaleImpegno dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <EsitiOperatore dati={dati} />
            </section>
            <section className="break-inside-avoid">
              <CandeleSettimanali />
            </section>
            <p className="text-[10px] text-[var(--brand-text-subtle)]">
              Fonte: gestionale (interventi + snapshot master/portale/SAL ACEA). SAL = ordini pagati dal file
              ufficiale ACEA; Pre-SAL = ordini esitati (COMPLETATO, causale E%) non ancora in un SAL. Giornate-uomo =
              quota di interventi ACEA lavorati sul totale lavorato, nei soli giorni feriali lun–ven (sabato =
              attivazioni, mostrato a parte; domenica esclusa).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
