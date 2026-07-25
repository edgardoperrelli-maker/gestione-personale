/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, ClipboardList, ScanLine } from 'lucide-react';
import Button from '@/components/Button';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { matchVociMatricola, type VoceMatricola } from '@/lib/limitazione/matchVociMatricola';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';
import { aggiornaCensimento, leggiCensimentoLocale } from '@/lib/offline/censimento';
import { cercaCensimentoLocale } from '@/lib/limitazione/cercaCensimentoLocale';

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
  const [daVerificare, setDaVerificare] = useState(false);
  const [bloccato, setBloccato] = useState<{ odl?: string | null; esecutore?: string | null; fonte?: 'master' | 'db' } | null>(null);

  // All'apertura della ricerca (online) allinea la cache locale del censimento: così
  // l'autofill funziona offline. Best-effort, no-op offline. Riuso cross-giorno (chiave stabile).
  useEffect(() => {
    void aggiornaCensimento(token);
  }, [token]);

  const reset = () => {
    setErrore(null); setCercato(false); setSuggerimenti([]); setSuggVoci([]);
    setAltroOperatore(null); setMisuratore(null); setOffline(false); setDaVerificare(false); setBloccato(null);
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

    // OFFLINE: cerca nella cache locale del censimento (se scaricata). Autofill come online;
    // l'assegnazione "ad altro operatore" è stato del giorno (non nel censimento) → verifica alla sync.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const locale = await leggiCensimentoLocale();
      const esito = locale ? cercaCensimentoLocale(v, locale.righe) : { trovato: false as const, suggerimenti: [] as CensitoMisuratore[] };
      setSuggVoci(simili);
      setOffline(true);
      if (esito.trovato) { setMisuratore(esito.misuratore); setDaVerificare(true); }
      else setSuggerimenti(esito.suggerimenti);
      setCercato(true);
      return;
    }

    setCercando(true);
    try {
      const res = await fetch(`/api/r/${token}/cerca-limitazione?q=${encodeURIComponent(v)}`);
      // Online ma server in errore (es. link scaduto/non più modificabile): NON è "offline".
      // Mostra l'errore reale e rivela comunque l'inserimento a mano (niente vicolo cieco).
      if (!res.ok) { setErrore('Ricerca non riuscita.'); setSuggVoci(simili); setCercato(true); return; }
      type Esecuzione = { bloccato: boolean; fonte?: 'master' | 'db'; odl?: string | null; esecutore?: string | null };
      const j = (await res.json()) as
        | { trovato: true; misuratore: CensitoMisuratore; altroOperatore: string | null; esecuzione?: Esecuzione }
        | { trovato: false; suggerimenti: CensitoMisuratore[]; altroOperatore: string | null; esecuzione?: Esecuzione };
      // BLOCCO anti-duplicato: la matricola risulta già eseguita → stop, niente Procedi/Inserisci.
      if (j.esecuzione?.bloccato) {
        setBloccato({ odl: j.esecuzione.odl, esecutore: j.esecuzione.esecutore, fonte: j.esecuzione.fonte });
        setCercato(true);
        return;
      }
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
      // Errore di rete: prova comunque la cache locale, poi rivela l'inserimento a mano.
      const locale = await leggiCensimentoLocale();
      const esito = locale ? cercaCensimentoLocale(v, locale.righe) : { trovato: false as const, suggerimenti: [] as CensitoMisuratore[] };
      setSuggVoci(simili);
      setOffline(true);
      if (esito.trovato) { setMisuratore(esito.misuratore); setDaVerificare(true); }
      else setSuggerimenti(esito.suggerimenti);
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
          // Placeholder corto: in Geist Mono "Matricola misuratore" non entra nel campo
          // accanto ai due comandi da 48px (veniva troncato).
          placeholder="Matricola"
          aria-label="Matricola"
          value={q}
          onChange={(e) => { setQ(e.target.value); setCercato(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void cerca(q); }}
          className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 font-mono text-base tabular-nums text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
        />
        <Button variant="soft" size="touch" onClick={() => setScanner(true)} aria-label="Scansiona la matricola" title="Scansiona la matricola" className="shrink-0">
          <ScanLine className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </Button>
        <Button variant="primary" size="touch" disabled={cercando || !q.trim()} loading={cercando} onClick={() => void cerca(q)} className="shrink-0">
          Cerca
        </Button>
      </div>

      {errore && <p className="text-sm font-medium text-[var(--danger)]">{errore}</p>}

      {altroOperatore && !bloccato && (
        <div className="flex items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm font-medium text-[var(--danger)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          <span>Matricola assegnata a <b>{altroOperatore}</b> — contatta l&apos;ufficio per fartela assegnare.</span>
        </div>
      )}

      {bloccato && (
        <div className="rounded-[var(--radius-lg)] border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          <p className="flex items-start gap-2 font-semibold">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span>Intervento già eseguito su questo misuratore.</span>
          </p>
          {(bloccato.odl || bloccato.esecutore) && (
            <p className="mt-1 text-xs">
              {bloccato.odl ? <>ODL <b>{bloccato.odl}</b></> : null}
              {bloccato.esecutore ? <> · eseguito da <b>{bloccato.esecutore}</b></> : null}
            </p>
          )}
          <p className="mt-1 font-semibold">Contatta l&apos;ufficio per la verifica.</p>
        </div>
      )}

      {cercato && !bloccato && (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
          {misuratore && (altroOperatore || daVerificare) ? (
            <>
              {daVerificare && (
                <p className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--brand-text-main)]">
                  Offline: dati dal censimento locale. L&apos;assegnazione verrà verificata alla sincronizzazione.
                </p>
              )}
              <Button variant="primary" size="touch" onClick={() => onTrovato(misuratore)} className="w-full">
                Procedi (compila i dati)
              </Button>
            </>
          ) : (
            <>
              {suggVoci.length > 0 && (
                <>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-text-muted)]">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
                    Già nel tuo rapportino:
                  </p>
                  {/* Righe-elenco: restano `<button>` a mano (contenuto su due colonne, allineato a
                      sinistra e a piena larghezza — il primitivo le stringerebbe). */}
                  <ul className="space-y-1">
                    {suggVoci.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => onApriAssegnato(s.id)} className="flex min-h-[48px] w-full items-center rounded-[var(--radius-md)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] px-3 py-2 text-left text-sm text-[var(--brand-text-main)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] active:bg-[var(--brand-primary-soft)]">
                          <span className="font-mono font-semibold tabular-nums">{s.matricola}</span>
                          <span className="ml-2 min-w-0 truncate text-xs text-[var(--brand-text-muted)]">{[s.via, s.comune].filter(Boolean).join(' ')}</span>
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
                        <button type="button" onClick={() => onTrovato(s)} className="flex min-h-[48px] w-full items-center rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-left text-sm text-[var(--brand-text-main)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] active:border-[var(--brand-primary)]">
                          <span className="font-mono font-semibold tabular-nums">{s.matricola}</span>
                          <span className="ml-2 min-w-0 truncate text-xs text-[var(--brand-text-muted)]">{[s.indirizzo, s.civico, s.comune].filter(Boolean).join(' ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {offline && (
                <p className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--brand-text-main)]">
                  Offline: ricerca dal censimento locale. Se non trovi la matricola inseriscila a mano (verrà verificata alla sincronizzazione).
                </p>
              )}
              {suggVoci.length === 0 && suggerimenti.length === 0 && !offline && (
                <p className="text-sm font-medium text-[var(--brand-text-main)]">Matricola non censita.</p>
              )}
              <Button variant="outline" size="touch" onClick={() => onManuale(q.trim())} className="w-full border-dashed">
                Inserisci a mano questa matricola
              </Button>
            </>
          )}
        </div>
      )}

      <Button variant="outline" size="touch" onClick={onIndietro}>Indietro</Button>

      {scanner && (
        <ScannerMisuratore onCodice={(codice) => { setScanner(false); setQ(codice); void cerca(codice); }} onChiudi={() => setScanner(false)} />
      )}
    </div>
  );
}