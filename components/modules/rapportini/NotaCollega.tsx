'use client';

import Dialog from '@/components/ui/Dialog';
import type { NotaPrecedente } from '@/lib/interventi/notePrecedenti';

/** Riga metadati di una nota: "20/06/2026 · Limitazione flusso · Mario Rossi" (parti vuote omesse). */
function metaNota(n: NotaPrecedente): string {
  return [n.dataLabel, n.attivita, n.operatore].filter(Boolean).join(' · ');
}

/** Singola nota tramandata: testo + metadati. Condivisa da banner e modale. */
function NotaCollegaItem({ nota }: { nota: NotaPrecedente }) {
  const meta = metaNota(nota);
  return (
    <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--brand-surface)]/60 px-3 py-2">
      <p className="whitespace-pre-wrap break-words text-[14px] text-[var(--brand-text-main)]">{nota.testo}</p>
      {meta && <p className="mt-1 text-[11px] font-medium text-[var(--brand-text-muted)]">{meta}</p>}
    </div>
  );
}

/**
 * Banner giallo SEMPRE presente nella card dell'intervento: mostra le note tramandate dai
 * precedenti interventi positivi sullo stesso impianto (matricola/PDR, stesso committente).
 * Consultabile tutte le volte che si riapre la card. Distinto dal banner "Nota dall'ufficio".
 */
export function BannerNotaCollega({ note }: { note: NotaPrecedente[] }) {
  if (note.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base leading-none">🕒</span>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">
          {note.length === 1 ? 'Nota da un collega' : `Note da un collega (${note.length})`}
          <span className="ml-1 font-semibold normal-case tracking-normal">· intervento precedente sullo stesso impianto</span>
        </p>
      </div>
      <div className="mt-2 space-y-2">
        {note.map((n) => (
          <NotaCollegaItem key={n.interventoId} nota={n} />
        ))}
      </div>
    </div>
  );
}

/**
 * Avviso a comparsa (modale interno all'app — NON un pop-up del browser, quindi non richiede
 * alcun permesso sul dispositivo) mostrato alla prima apertura di una card con note tramandate.
 * Attira l'attenzione dell'operatore; la nota resta poi sempre leggibile dal banner nella card.
 */
export function ModaleNotaCollega({ note, onChiudi }: { note: NotaPrecedente[]; onChiudi: () => void }) {
  return (
    <Dialog
      open
      onClose={onChiudi}
      variant="sheet"
      title="🕒 C'è una nota da un collega"
      footer={
        <button
          type="button"
          onClick={onChiudi}
          className="w-full rounded-[var(--radius-lg)] bg-[var(--brand-primary)] px-4 py-3 font-semibold text-[var(--on-primary)]"
        >
          Ho capito
        </button>
      }
    >
      <p className="text-sm text-[var(--brand-text-muted)]">
        Un intervento precedente sullo stesso impianto ha lasciato {note.length === 1 ? 'questa nota' : 'queste note'}. La
        ritrovi sempre nel banner giallo qui nella scheda.
      </p>
      <div className="mt-3 space-y-2">
        {note.map((n) => (
          <NotaCollegaItem key={n.interventoId} nota={n} />
        ))}
      </div>
    </Dialog>
  );
}
