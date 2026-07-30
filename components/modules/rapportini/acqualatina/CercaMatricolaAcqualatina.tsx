/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useState } from 'react';
import { AlertTriangle, Ban, ClipboardList, ScanLine } from 'lucide-react';
import Button from '@/components/Button';
import { ScannerMisuratore } from '@/components/modules/rapportini/risanamento/ScannerMisuratore';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { matchVociMatricola, type VoceMatricola } from '@/lib/limitazione/matchVociMatricola';
import { lookupMaster, type RigaMaster } from '@/lib/acqualatina/lookupMaster';
import { leggiCensimentoMasterLocale } from '@/lib/offline/censimentoMaster';

/**
 * Passo «cerca matricola» della commessa AcquaLatina.
 *
 * Componente NUOVO e non un ramo di `CercaMatricolaLimitazione`: quello serve ACEA e ha la
 * semantica OPPOSTA a valle — là il non censito è un avviso morbido con «inserisci a mano»,
 * qui è un blocco. Condividerlo avrebbe significato due comportamenti dietro un flag, sullo
 * stesso codice che gira in produzione per un altro committente.
 *
 * Il verdetto lo calcola sempre `lookupMaster`: online lo fa il server su `/cerca-master`,
 * offline lo fa qui sulla cache locale. Stessa funzione, così «non censito» significa la
 * stessa cosa con e senza rete.
 */

/** RigaMaster (cache locale) → forma dell'autofill, la stessa che risponde il server. */
const daRiga = (r: RigaMaster): CensitoMisuratore => ({
  matricola: r.matricola, odl: r.odl, indirizzo: r.indirizzo, comune: r.comune, cap: r.cap,
});

type Blocco =
  | { motivo: 'assente'; letta: string }
  | { motivo: 'masterVuoto' }
  | { motivo: 'ambiguo'; odl: string[] }
  /** L'operatore ha detto che la matricola proposta non è quella sul contatore. */
  | { motivo: 'rifiutata'; letta: string; proposta: string; indirizzo: string };

type Vista =
  | { v: 'ricerca' }
  | { v: 'scelta'; candidati: CensitoMisuratore[] }
  | { v: 'conferma'; candidato: CensitoMisuratore }
  | { v: 'blocco'; blocco: Blocco }
  /** Offline SENZA censimento in cache: non si sa, quindi non si blocca (decisione 5).
   *  Si procede con riserva e il verdetto duro arriva dal server all'invio. */
  | { v: 'senzaCensimento'; letta: string };

export function CercaMatricolaAcqualatina({
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
  /** Usato SOLO nel caso offline-senza-cache: è l'unica via per procedere senza master. */
  onManuale: (matricola: string) => void;
  onApriAssegnato: (voceId: string) => void;
  onIndietro: () => void;
}) {
  const [q, setQ] = useState('');
  const [scanner, setScanner] = useState(false);
  const [cercando, setCercando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>({ v: 'ricerca' });

  // Le voci RIFIUTATE non sono task attivi: vanno rifatte da capo, quindi non riaprono
  // in automatico né compaiono fra i suggerimenti «già nel tuo rapportino».
  const vociAttive = voci.filter((x) => x.approvazione_stato !== 'rifiutato');

  /** Verdetto dalla cache locale. `undefined` = cache mai scaricata: non è «non censito»,
   *  è «non lo so», e la differenza è tutto il senso della decisione 5. */
  const cercaOffline = async (v: string): Promise<Vista> => {
    const locale = await leggiCensimentoMasterLocale();
    if (!locale) return { v: 'senzaCensimento', letta: v };
    const verdetto = lookupMaster(v, locale.righe);
    if (verdetto.esito === 'letterale') { onTrovato(daRiga(verdetto.riga)); return { v: 'ricerca' }; }
    if (verdetto.esito === 'conferma') {
      const c = verdetto.candidati.map(daRiga);
      return c.length === 1 ? { v: 'conferma', candidato: c[0] } : { v: 'scelta', candidati: c };
    }
    if (verdetto.esito === 'ambiguo') return { v: 'blocco', blocco: { motivo: 'ambiguo', odl: verdetto.odl } };
    return { v: 'blocco', blocco: { motivo: 'assente', letta: v } };
  };

  const cerca = async (valore: string) => {
    const v = valore.trim();
    if (!v) return;
    setErrore(null);
    setVista({ v: 'ricerca' });

    // 1) Già un tuo task (e non rifiutato) → apri quella voce, non se ne crea un'altra.
    const own = matchVociMatricola(vociAttive, v);
    if (own) { onApriAssegnato(own.id); return; }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setVista(await cercaOffline(v));
      return;
    }

    setCercando(true);
    try {
      const res = await fetch(`/api/r/${token}/cerca-master?q=${encodeURIComponent(v)}`);
      if (!res.ok) {
        // Online ma server in errore (link scaduto, 500…): NON è «non censito». Si prova la
        // cache locale, che è dato buono quanto quello del server, e solo se manca anche
        // quella si dice all'operatore che non si è potuto verificare.
        const fallback = await cercaOffline(v);
        setVista(fallback);
        if (fallback.v === 'senzaCensimento') setErrore('Verifica non riuscita: riprova.');
        return;
      }
      const j = (await res.json()) as
        | { esito: 'letterale'; misuratore: CensitoMisuratore }
        | { esito: 'conferma'; candidati: CensitoMisuratore[] }
        | { esito: 'ambiguo'; odl: string[] }
        | { esito: 'assente'; masterVuoto?: boolean };

      if (j.esito === 'letterale') { onTrovato(j.misuratore); return; }
      if (j.esito === 'conferma') {
        setVista(j.candidati.length === 1
          ? { v: 'conferma', candidato: j.candidati[0] }
          : { v: 'scelta', candidati: j.candidati });
        return;
      }
      if (j.esito === 'ambiguo') { setVista({ v: 'blocco', blocco: { motivo: 'ambiguo', odl: j.odl } }); return; }
      setVista({ v: 'blocco', blocco: j.masterVuoto ? { motivo: 'masterVuoto' } : { motivo: 'assente', letta: v } });
    } catch {
      const fallback = await cercaOffline(v);
      setVista(fallback);
      if (fallback.v === 'senzaCensimento') setErrore('Nessuna rete: verifica non riuscita.');
    } finally {
      setCercando(false);
    }
  };

  const indirizzoDi = (m: CensitoMisuratore) =>
    [m.indirizzo, m.comune, m.cap].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ');

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-[var(--brand-text-muted)]">Cerca matricola</p>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="text"
          placeholder="Matricola"
          aria-label="Matricola"
          value={q}
          onChange={(e) => { setQ(e.target.value); setVista({ v: 'ricerca' }); setErrore(null); }}
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

      {/* ── Scelta fra più ordini sulla stessa matricola ─────────────────────────
          L'indirizzo è il discriminante: l'operatore è sul posto e lo vede, l'ufficio no. */}
      {vista.v === 'scelta' && (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-text-muted)]">
            <ClipboardList className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            Più ordini su questa matricola: scegli l&apos;indirizzo dove ti trovi
          </p>
          <ul className="space-y-1">
            {vista.candidati.map((c) => (
              <li key={`${c.odl}|${c.matricola}`}>
                <button
                  type="button"
                  onClick={() => setVista({ v: 'conferma', candidato: c })}
                  className="flex min-h-[48px] w-full flex-col items-start justify-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] active:border-[var(--brand-primary)]"
                >
                  <span className="text-sm font-semibold text-[var(--brand-text-main)]">{indirizzoDi(c)}</span>
                  <span className="text-xs text-[var(--brand-text-muted)]">
                    ODL <span className="font-mono tabular-nums">{c.odl}</span> · matr.{' '}
                    <span className="font-mono tabular-nums">{c.matricola}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Doppia conferma (decisione 4) ────────────────────────────────────────
          La domanda è sulla MATRICOLA, perché è quella che l'operatore legge sul
          contatore. Indirizzo e ODL stanno lì come contesto, non come oggetto della
          conferma: costano niente e aiutano a capire di cosa si sta parlando. */}
      {vista.v === 'conferma' && (
        <div className="space-y-3 rounded-[var(--radius-lg)] border-2 border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3">
          <p className="text-sm text-[var(--brand-text-main)]">
            Sul contatore c&apos;è scritto <b className="font-mono tabular-nums">{vista.candidato.matricola}</b>?
          </p>
          <div className="rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2.5 text-xs text-[var(--brand-text-muted)]">
            <p className="text-sm font-semibold text-[var(--brand-text-main)]">{indirizzoDi(vista.candidato)}</p>
            <p className="mt-0.5">ODL <span className="font-mono tabular-nums">{vista.candidato.odl}</span></p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="touch"
              className="shrink-0"
              onClick={() => setVista({
                v: 'blocco',
                blocco: {
                  motivo: 'rifiutata',
                  letta: q.trim(),
                  proposta: vista.candidato.matricola,
                  indirizzo: indirizzoDi(vista.candidato),
                },
              })}
            >
              No
            </Button>
            <Button variant="primary" size="touch" className="flex-1" onClick={() => onTrovato(vista.candidato)}>
              Sì, è questa
            </Button>
          </div>
        </div>
      )}

      {/* ── Blocco: nessun bottone per procedere, solo «Indietro» ────────────────
          È la decisione 1. Il «Procedi comunque» è esattamente ciò che produce gli
          interventi senza ODL assegnabile, quindi qui non esiste. */}
      {vista.v === 'blocco' && (
        <div className="space-y-2 rounded-[var(--radius-lg)] border-2 border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">
          <p className="flex items-start gap-2 font-semibold">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span>
              {vista.blocco.motivo === 'ambiguo'
                ? 'Più ordini indistinguibili su questa matricola.'
                : vista.blocco.motivo === 'masterVuoto'
                  ? 'Nessun elenco misuratori attivo per questa commessa.'
                  : vista.blocco.motivo === 'rifiutata'
                    ? 'La matricola non corrisponde.'
                    : 'Misuratore non censito.'}
            </span>
          </p>

          {/* Il referto: quello che serve all'ufficio per capire in trenta secondi. */}
          {vista.blocco.motivo === 'ambiguo' && (
            <p className="text-xs">ODL coinvolti: <span className="font-mono tabular-nums">{vista.blocco.odl.join(', ')}</span></p>
          )}
          {vista.blocco.motivo === 'assente' && (
            <p className="text-xs">Matricola letta: <span className="font-mono tabular-nums">{vista.blocco.letta}</span></p>
          )}
          {vista.blocco.motivo === 'rifiutata' && (
            <p className="text-xs">
              Letta <span className="font-mono tabular-nums">{vista.blocco.letta}</span>, in elenco risulta{' '}
              <span className="font-mono tabular-nums">{vista.blocco.proposta}</span> in {vista.blocco.indirizzo}.
            </p>
          )}

          <p className="font-semibold">Non eseguire l&apos;intervento: contatta l&apos;ufficio.</p>
        </div>
      )}

      {/* ── Offline senza censimento: non si sa, quindi non si blocca ────────────
          Unica porta per procedere senza master (decisione 5). Il verdetto duro lo dà il
          server all'invio: se non censito, la pratica viene respinta e resta in coda con
          il motivo scritto. */}
      {vista.v === 'senzaCensimento' && (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-[var(--brand-text-main)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" strokeWidth={2} aria-hidden />
            <span>Elenco misuratori non disponibile su questo telefono.</span>
          </p>
          <p className="text-xs text-[var(--brand-text-muted)]">
            Puoi proseguire: la matricola verrà verificata dall&apos;ufficio alla sincronizzazione. Se non
            risulta a catalogo, la pratica ti tornerà indietro.
          </p>
          <Button variant="outline" size="touch" onClick={() => onManuale(vista.letta)} className="w-full border-dashed">
            Prosegui con <span className="ml-1 font-mono tabular-nums">{vista.letta}</span>
          </Button>
        </div>
      )}

      <Button variant="outline" size="touch" onClick={onIndietro}>Indietro</Button>

      {scanner && (
        <ScannerMisuratore onCodice={(codice) => { setScanner(false); setQ(codice); void cerca(codice); }} onChiudi={() => setScanner(false)} />
      )}
    </div>
  );
}
