'use client';

import { useState } from 'react';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { matchVociMatricola, type VoceMatricola } from '@/lib/limitazione/matchVociMatricola';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';

export function CercaMatricolaLimitazione({
  token,
  voci,
  onTrovato,
  onManuale,
  onApriAssegnato,
  onIndietro,
}: {
  token: string;
  voci: VoceMatricola[];
  onTrovato: (m: CensitoMisuratore) => void;
  onManuale: (matricola: string) => void;
  onApriAssegnato: (voceId: string) => void;
  onIndietro: () => void;
}) {
  const [q, setQ] = useState('');
  const [scanner, setScanner] = useState(false);
  const [cercando, setCercando] = useState(false);
  const [suggerimenti, setSuggerimenti] = useState<CensitoMisuratore[]>([]);
  const [suggVoci, setSuggVoci] = useState<Array<VoceMatricola & { matricola: string }>>([]);
  const [altroOperatore, setAltroOperatore] = useState<string | null>(null);
  const [misuratore, setMisuratore] = useState<CensitoMisuratore | null>(null);
  const [cercato, setCercato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const reset = () => {
    setErrore(null); setCercato(false); setSuggerimenti([]); setSuggVoci([]);
    setAltroOperatore(null); setMisuratore(null); setOffline(false);
  };

  // Le voci RIFIUTATE non sono task attivi: vanno rifatte da capo, quindi non devono
  // né riaprirsi in automatico né comparire tra i suggerimenti "già nel tuo rapportino".
  const vociAttive = voci.filter((x) => x.approvazione_stato !== 'rifiutato');

  const cerca = async (valore: string) => {
    const v = valore.trim();
    if (!v) return;
    reset();

    // 1) Già tuo (e non rifiutato) → apri in automatico quella voce
    const own = matchVociMatricola(vociAttive, v);
    if (own) { onApriAssegnato(own.id); return; }

    // Suggerimenti "simili" calcolati in locale (servono anche offline).
    const simili = matricoleSimili(
      v,
      vociAttive.filter((x): x is VoceMatricola & { matricola: string } => x.matricola != null && x.matricola !== ''),
      5,
    );

    // OFFLINE: niente censimento dal server → mostra subito la via "Inserisci a mano".
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSuggVoci(simili);
      setSuggerimenti([]);
      setOffline(true);
      setCercato(true);
      return;
    }

    setCercando(true);
    try {
      const res = await fetch(`/api/r/${token}/cerca-limitazione?q=${encodeURIComponent(v)}`);
      // Online ma server in errore (es. link scaduto/non più modificabile): NON è "offline".
      // Mostra l'errore reale e rivela comunque l'inserimento a mano (niente vicolo cieco).
      if (!res.ok) { setErrore('Ricerca non riuscita.'); setSuggVoci(simili); setCercato(true); return; }
      const j = (await res.json()) as
        | { trovato: true; misuratore: CensitoMisuratore; altroOperatore: string | null }
        | { trovato: false; suggerimenti: CensitoMisuratore[]; altroOperatore: string | null };
      setAltroOperatore(j.altroOperatore);
      setSuggVoci(simili);
      if (j.trovato) {
        setMisuratore(j.misuratore);
        if (!j.altroOperatore) { onTrovato(j.misuratore); return; }
      } else {
        setSuggerimenti(j.suggerimenti);
      }
      setCercato(true);
    } catch {
      // Errore di rete: NON un vicolo cieco → rivela l'inserimento a mano.
      setSuggVoci(simili);
      setOffline(true);
      setCercato(true);
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
          onChange={(e) => { setQ(e.target.value); setCercato(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void cerca(q); }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
        />
        <button type="button" onClick={() => setScanner(true)} className="shrink-0 rounded-lg border border-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[var(--brand-primary)]">📷</button>
        <button type="button" disabled={cercando || !q.trim()} onClick={() => void cerca(q)} className="shrink-0 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50">{cercando ? '…' : 'Cerca'}</button>
      </div>

      {errore && <p className="text-sm font-medium text-[var(--danger)]">{errore}</p>}

      {altroOperatore && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm font-medium text-[var(--danger)]">
          ⚠️ Matricola assegnata a <b>{altroOperatore}</b> — contatta l&apos;ufficio per fartela assegnare.
        </div>
      )}

      {cercato && (
        <div className="space-y-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
          {misuratore && altroOperatore ? (
            <button type="button" onClick={() => onTrovato(misuratore)} className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-main)] hover:border-[var(--brand-primary)]">
              Procedi comunque (compila i dati)
            </button>
          ) : (
            <>
              {suggVoci.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-[var(--brand-text-muted)]">📋 Già nel tuo rapportino:</p>
                  <ul className="space-y-1">
                    {suggVoci.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => onApriAssegnato(s.id)} className="w-full rounded-lg border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-3 py-2 text-left text-sm text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]">
                          <span className="font-semibold">{s.matricola}</span>
                          <span className="ml-2 text-xs text-[var(--brand-text-muted)]">{[s.via, s.comune].filter(Boolean).join(' ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {suggerimenti.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-[var(--brand-text-muted)]">Forse intendevi:</p>
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
              {offline && (
                <p className="rounded-lg border border-[var(--warning-fg,#92400e)] bg-[var(--warning-soft,#fef3c7)] px-3 py-2 text-xs font-semibold text-[var(--warning-fg,#92400e)]">
                  Offline: censimento non disponibile. Inserisci i dati a mano: verranno verificati alla sincronizzazione.
                </p>
              )}
              {suggVoci.length === 0 && suggerimenti.length === 0 && !offline && (
                <p className="text-sm font-medium text-[var(--brand-text-main)]">Matricola non censita.</p>
              )}
              <button type="button" onClick={() => onManuale(q.trim())} className="w-full rounded-lg border border-dashed border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
                Inserisci a mano questa matricola
              </button>
            </>
          )}
        </div>
      )}

      <button type="button" onClick={onIndietro} className="rounded-xl border border-[var(--brand-border-strong)] bg-[var(--brand-surface)] px-4 py-3 font-bold text-[var(--brand-text-main)]">Indietro</button>

      {scanner && (
        <ScannerMisuratore onCodice={(codice) => { setScanner(false); setQ(codice); void cerca(codice); }} onChiudi={() => setScanner(false)} />
      )}
    </div>
  );
}
