'use client';

import Button from '@/components/Button';

/** Chiave versionata dell'avviso: per un nuovo annuncio si usa una nuova chiave. */
export const ANNUNCIO_SQUADRE_KEY = 'crono-squadre-v1';

/**
 * Avviso "novità" mostrato al primo accesso al Cronoprogramma (una volta per utente, via DB).
 * Spiega la nuova funzione Squadre con due esempi: squadra da 2 e squadra da 4 (resine).
 */
export default function AnnuncioSquadre({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annuncio-squadre-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
            >
              ✨ Novità
            </span>
            <h2 id="annuncio-squadre-title" className="mt-2 text-lg font-semibold text-[var(--brand-text-main)]">
              Squadre nel Cronoprogramma
            </h2>
            <p className="mt-0.5 text-sm text-[var(--brand-text-muted)]">
              Ora puoi legare più operatori che lavorano insieme, direttamente sulla griglia.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-[var(--brand-bg)] text-[var(--brand-text-muted)]"
            title="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 px-5 pt-4 sm:grid-cols-2">
          <EsempioSquadra2 />
          <EsempioSquadra4 />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4 text-[12px] text-[var(--brand-text-muted)]">
          <Step n={1}>{"Trascini una card sull'occhiello ⛓ di un'altra"}</Step>
          <span className="opacity-40">→</span>
          <Step n={2}>Si agganciano in squadra</Step>
          <span className="opacity-40">→</span>
          <Step n={3}>Aggiungi o togli membri quando vuoi</Step>
        </div>

        <div className="mt-4 flex items-center justify-end border-t border-[var(--brand-border)] px-5 py-4">
          <Button onClick={onClose} size="sm">
            Ho capito
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="grid h-[18px] w-[18px] place-items-center rounded-md text-[10px] font-bold"
        style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
      >
        {n}
      </span>
      {children}
    </span>
  );
}

// Esempio 1 — squadra da 2 (Lazio Est, sky).
function EsempioSquadra2() {
  const c = { bg: 'rgba(56,189,248,0.16)', bd: 'rgba(56,189,248,0.40)', tx: '#7DD3FC', band: '#38BDF8' };
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">Esempio 1</div>
      <div className="mb-2 text-sm font-semibold text-[var(--brand-text-main)]">Squadra da 2</div>
      <div
        className="relative rounded-lg border px-2 pb-1.5 pt-1.5 text-[11px]"
        style={{ backgroundColor: c.bg, borderColor: c.bd, color: c.tx, outline: '1px solid var(--brand-primary-border)' }}
      >
        <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg" style={{ backgroundColor: c.band }} />
        <div
          className="mb-1 inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-bold uppercase"
          style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
        >
          ⛓ Squadra ×2
        </div>
        <div className="relative pl-4">
          <span className="absolute bottom-1 left-1.5 top-1 w-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)' }} />
          <div className="py-0.5 font-semibold uppercase tracking-tight">Marino G.</div>
          <div className="py-0.5 font-semibold uppercase tracking-tight">Costa D.</div>
        </div>
        <div className="mt-1 pl-1.5 text-[10px] opacity-75">Lazio Est | Sopralluogo</div>
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--brand-text-muted)]">
        Trascina una card sopra un collega: si <b>agganciano</b> in coppia.
      </p>
    </div>
  );
}

// Esempio 2 — squadra da 4 (Napoli, fuchsia) per le resine.
function EsempioSquadra4() {
  const c = { bg: 'rgba(232,121,249,0.16)', bd: 'rgba(232,121,249,0.40)', tx: '#F0ABFC', band: '#E879F9' };
  const membri = ['Esposito R.', 'Russo A.', 'Greco M.', 'Gallo V.'];
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--brand-text-muted)]">Esempio 2 · Resine</div>
      <div className="mb-2 text-sm font-semibold text-[var(--brand-text-main)]">Squadra da 4</div>
      <div
        className="relative rounded-lg border px-2 pb-1.5 pt-1.5 text-[11px]"
        style={{ backgroundColor: c.bg, borderColor: c.bd, color: c.tx, outline: '1px solid var(--brand-primary-border)' }}
      >
        <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg" style={{ backgroundColor: c.band }} />
        <div className="mb-1 flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-bold uppercase"
            style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
          >
            ⛓ Squadra ×4
          </span>
          <span className="rounded-full px-1.5 py-px text-[9px] font-semibold" style={{ color: c.tx, border: `1px solid ${c.bd}` }}>
            Resine · 4/4
          </span>
        </div>
        <div className="relative pl-4">
          <span className="absolute bottom-1 left-1.5 top-1 w-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)' }} />
          {membri.map((m, i) => (
            <div key={m} className="flex items-center gap-1 py-0.5">
              {i === 0 && (
                <span
                  className="rounded px-1 text-[8.5px] font-bold"
                  style={{ backgroundColor: 'var(--brand-primary-soft)', border: '1px solid var(--brand-primary-border)', color: 'var(--brand-primary)' }}
                >
                  CAPO
                </span>
              )}
              <span className="font-semibold uppercase tracking-tight">{m}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 pl-1.5 text-[10px] opacity-75">Napoli | Resine</div>
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--brand-text-muted)]">
        Aggancia altri membri: la squadra <b>cresce fino a 4</b>. Le resine ne consigliano 4.
      </p>
    </div>
  );
}
