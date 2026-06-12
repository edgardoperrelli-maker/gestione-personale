'use client';

import { useState } from 'react';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

export function CercaMatricolaLimitazione({
  token,
  onTrovato,
  onManuale,
  onIndietro,
}: {
  token: string;
  onTrovato: (m: CensitoMisuratore) => void;
  onManuale: (matricola: string) => void;
  onIndietro: () => void;
}) {
  const [q, setQ] = useState('');
  const [scanner, setScanner] = useState(false);
  const [cercando, setCercando] = useState(false);
  const [suggerimenti, setSuggerimenti] = useState<CensitoMisuratore[] | null>(null);
  const [nonTrovato, setNonTrovato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const cerca = async (valore: string) => {
    const v = valore.trim();
    if (!v) return;
    setCercando(true); setErrore(null); setNonTrovato(false); setSuggerimenti(null);
    try {
      const res = await fetch(`/api/r/${token}/cerca-limitazione?q=${encodeURIComponent(v)}`);
      if (!res.ok) { setErrore('Ricerca non riuscita.'); return; }
      const j = (await res.json()) as
        | { trovato: true; misuratore: CensitoMisuratore }
        | { trovato: false; suggerimenti: CensitoMisuratore[] };
      if (j.trovato) { onTrovato(j.misuratore); return; }
      setSuggerimenti(j.suggerimenti);
      setNonTrovato(true);
    } catch {
      setErrore('Errore di rete.');
    } finally {
      setCercando(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-[var(--brand-text-muted)]">Cerca matricola</p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="text"
          placeholder="Matricola misuratore"
          aria-label="Matricola"
          value={q}
          onChange={(e) => { setQ(e.target.value); setNonTrovato(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void cerca(q); }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
        />
        <button type="button" onClick={() => setScanner(true)} className="shrink-0 rounded-lg border border-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[var(--brand-primary)]">📷</button>
        <button type="button" disabled={cercando || !q.trim()} onClick={() => void cerca(q)} className="shrink-0 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">{cercando ? '…' : 'Cerca'}</button>
      </div>

      {errore && <p className="text-sm font-medium text-[var(--danger)]">{errore}</p>}

      {nonTrovato && (
        <div className="space-y-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
          <p className="text-sm font-medium text-[var(--brand-text-main)]">Matricola non censita.</p>
          {suggerimenti && suggerimenti.length > 0 && (
            <>
              <p className="text-xs text-[var(--brand-text-muted)]">Forse intendevi:</p>
              <ul className="space-y-1">
                {suggerimenti.map((s) => (
                  <li key={s.matricola}>
                    <button type="button" onClick={() => onTrovato(s)} className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-left text-sm text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]">
                      <span className="font-semibold">{s.matricola}</span>
                      <span className="ml-2 text-xs text-[var(--brand-text-muted)]">{[s.indirizzo, s.civico, s.comune].filter(Boolean).join(' ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => onManuale(q.trim())} className="w-full rounded-lg border border-dashed border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
            Inserisci a mano questa matricola
          </button>
        </div>
      )}

      <button type="button" onClick={onIndietro} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">Indietro</button>

      {scanner && (
        <ScannerMisuratore onCodice={(codice) => { setScanner(false); setQ(codice); void cerca(codice); }} onChiudi={() => setScanner(false)} />
      )}
    </div>
  );
}
