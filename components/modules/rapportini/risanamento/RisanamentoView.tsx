'use client';

import { useState, useEffect, useMemo } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiPerScope } from '@/utils/rapportini/campiScope';
import type { Voce } from '@/components/modules/rapportini/RapportinoForm';
import type { RigaRisanamento } from './types';
import { SlotFoto } from './SlotFoto';
import { GalleriaFoto } from './GalleriaFoto';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import { ScannerMisuratore } from './ScannerMisuratore';
import { righeIncomplete, type DettaglioIncompleto } from '@/utils/rapportini/righeIncomplete';
import { normMatricola } from '@/lib/limitazione/matricoleSimili';
import { maiuscoloDigitando } from '@/lib/testo/maiuscolo';
import { datiPdfRisanamento } from '@/utils/rapportini/datiPdfRisanamento';
import { generaPdfRisanamentoBlob, nomeFilePdfRisanamento } from '@/utils/rapportini/pdfRisanamento';
import { condividiOScarica } from '@/utils/rapportini/condividiFile';

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function formatData(raw: string): string {
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* ── Componente principale ─────────────────────────────────────────────────── */

export function RisanamentoView({
  token,
  rapportino,
  voci,
  righeIniziali,
  campi,
  readOnly,
}: {
  token: string;
  rapportino: { staff_name: string; data: string };
  voci: Voce[];
  righeIniziali: RigaRisanamento[];
  campi: TemplateCampo[];
  readOnly: boolean;
}) {
  const scope = campiPerScope(campi);

  /* ── State ──────────────────────────────────────────────────────────────── */
  const [righe, setRighe] = useState<RigaRisanamento[]>(righeIniziali);
  const [civicoApertoId, setCivicoApertoId] = useState<string | null>(null);
  const [mat, setMat] = useState('');
  const [pdr, setPdr] = useState('');
  const [nom, setNom] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [aggiungendoRiga, setAggiungendoRiga] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [evidenziata, setEvidenziata] = useState<string | null>(null);
  /** Id dei misuratori espansi (lista accordion per non avere una lista infinita). */
  const [espansi, setEspansi] = useState<Set<string>>(new Set<string>());
  /** Eliminazione riga misuratore: target + secondo step (doppia conferma). */
  const [eliminaTarget, setEliminaTarget] = useState<RigaRisanamento | null>(null);
  const [eliminaStep2, setEliminaStep2] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  /** vociRisposte: copia locale delle risposte delle voci, per aggiornamento ottimistico. */
  const [vociRisposte, setVociRisposte] = useState<Record<string, Record<string, unknown>>>(
    () => Object.fromEntries(voci.map((v) => [v.id, { ...(v.risposte ?? {}) }])),
  );

  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(readOnly);
  const [modalePuntiGas, setModalePuntiGas] = useState(false);
  const [incompleti, setIncompleti] = useState<DettaglioIncompleto[]>([]);
  const [pdfBusy, setPdfBusy] = useState(false);

  /* ── Effects ────────────────────────────────────────────────────────────── */

  // Fix 1: reset civicoApertoId se la voce non esiste più (no setState in render)
  useEffect(() => {
    if (civicoApertoId !== null && !voci.find((v) => v.id === civicoApertoId)) setCivicoApertoId(null);
  }, [civicoApertoId, voci]);

  // Fix 4: reset stato lista misuratori al cambio di civico
  useEffect(() => {
    setEspansi(new Set());
  }, [civicoApertoId]);

  // Espande un misuratore (accordion) per caricarne subito le foto.
  const espandiRiga = (id: string) => {
    setEspansi((prev) => new Set(prev).add(id));
  };
  const toggleRiga = (id: string) => {
    setEspansi((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Elimina definitivamente una riga-misuratore (dopo doppia conferma).
  const eliminaRiga = async () => {
    if (!eliminaTarget || eliminando) return;
    setEliminando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/r/${token}/riga`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rigaId: eliminaTarget.id }),
      });
      if (!res.ok) { setErrore('Errore nell\'eliminazione del misuratore'); return; }
      const id = eliminaTarget.id;
      setRighe((prev) => prev.filter((r) => r.id !== id));
      setEspansi((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setEliminaTarget(null);
      setEliminaStep2(false);
    } catch {
      setErrore('Errore di rete nell\'eliminazione del misuratore');
    } finally {
      setEliminando(false);
    }
  };

  // Dal banner "foto mancanti": apre il civico e porta sul misuratore incompleto.
  const vaiAIncompleto = (d: DettaglioIncompleto) => {
    setCivicoApertoId(d.voceId);
    setIncompleti([]);
    setErrore(null);
    if (d.rigaId) setEvidenziata(d.rigaId);
  };

  // Auto-clear highlight riga dopo 4 secondi
  useEffect(() => { if (!evidenziata) return; document.getElementById(`mis-${evidenziata}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); const t = setTimeout(() => setEvidenziata(null), 4000); return () => clearTimeout(t); }, [evidenziata]);

  /* ── Derived (validazione invio) ───────────────────────────────────────── */

  const vociLite = useMemo(
    () => voci.map((v) => ({ id: v.id, via: v.via, risposte: (vociRisposte[v.id] ?? {}) as Record<string, unknown> })),
    [voci, vociRisposte],
  );
  const validazione = useMemo(() => righeIncomplete(vociLite, righe as never, campi), [vociLite, righe, campi]);
  const puntiGas = righe.length;
  const nCivici = new Set(righe.map((r) => r.voce_id)).size;

  /** Etichetta leggibile del civico (indirizzo · comune, o nominativo) per i messaggi di errore. */
  const labelCivico = (voceId: string): string => {
    const v = voci.find((x) => x.id === voceId);
    if (!v) return 'Civico';
    const indirizzo = [v.via, (v as Voce & { civico?: string }).civico].filter(Boolean).join(' ');
    return [indirizzo, v.comune].filter(Boolean).join(' · ') || v.nominativo || 'Civico';
  };

  /* ── Handlers invio ─────────────────────────────────────────────────────── */

  const onInviaClick = () => {
    setErrore(null);
    if (!validazione.ok) { setIncompleti(validazione.dettagli); return; }
    setIncompleti([]); setModalePuntiGas(true);
  };

  const confermaInvio = async () => {
    setModalePuntiGas(false); setInviando(true); setErrore(null);
    try {
      const res = await fetch(`/api/r/${token}/invia`, { method: 'POST' });
      if (res.status === 409) {
        const body = await res.json() as { error?: string; dettagli?: DettaglioIncompleto[] };
        if (body.error === 'foto_mancanti') { setIncompleti(body.dettagli ?? []); return; }
        setErrore('Invio non possibile.'); return;
      }
      if (!res.ok) { setErrore('Invio fallito.'); return; }
      setInviato(true);
    } catch { setErrore('Errore di rete.'); } finally { setInviando(false); }
  };

  const condividiPdf = async () => {
    setPdfBusy(true);
    try {
      const dati = datiPdfRisanamento(voci as never, righe as never);
      const blob = await generaPdfRisanamentoBlob(dati, { staffName: rapportino.staff_name, dataLabel: formatData(rapportino.data) });
      await condividiOScarica({
        blob,
        filename: nomeFilePdfRisanamento(rapportino.staff_name, rapportino.data),
        title: 'Rapportino risanamento',
        text: `Rapportino risanamento ${rapportino.staff_name} ${formatData(rapportino.data)}`,
      });
    } catch { setErrore('Generazione PDF fallita.'); } finally { setPdfBusy(false); }
  };

  /* ── Helpers async ──────────────────────────────────────────────────────── */

  const salvaFotoRiga = async (rigaId: string, chiave: string, path: string | null) => {
    if (!path) { setErrore('Upload foto fallito'); return; }
    setErrore(null);
    try {
      const res = await fetch(`/api/r/${token}/riga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rigaId, risposte: { [chiave]: path } }),
      });
      if (!res.ok) { setErrore('Errore nel salvataggio della foto'); return; }
      const json = (await res.json()) as { riga?: RigaRisanamento };
      if (json.riga) {
        setRighe((prev) => prev.map((r) => (r.id === rigaId ? json.riga! : r)));
      }
    } catch {
      setErrore('Errore di rete nel salvataggio della foto');
    }
  };

  // Foto-voce multiple (Fasi/Accessorie): aggiunge/rimuove un path alla lista del campo.
  const aggiungiFotoVoce = async (chiave: string, path: string) => {
    if (!civicoApertoId) return;
    setErrore(null);
    const nuovo = [...comeArrayFoto((vociRisposte[civicoApertoId] ?? {})[chiave]), path];
    try {
      const res = await fetch(`/api/r/${token}/voce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, risposte: { [chiave]: nuovo } }),
      });
      if (!res.ok) { setErrore('Errore nel salvataggio della foto'); return; }
      setVociRisposte((prev) => ({ ...prev, [civicoApertoId]: { ...(prev[civicoApertoId] ?? {}), [chiave]: nuovo } }));
    } catch {
      setErrore('Errore di rete nel salvataggio della foto');
    }
  };
  const rimuoviFotoVoce = async (chiave: string, path: string) => {
    if (!civicoApertoId) return;
    const nuovo = comeArrayFoto((vociRisposte[civicoApertoId] ?? {})[chiave]).filter((p) => p !== path);
    try {
      const res = await fetch(`/api/r/${token}/voce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, risposte: { [chiave]: nuovo } }),
      });
      if (!res.ok) { setErrore('Errore nella rimozione della foto'); return; }
      setVociRisposte((prev) => ({ ...prev, [civicoApertoId]: { ...(prev[civicoApertoId] ?? {}), [chiave]: nuovo } }));
    } catch {
      setErrore('Errore di rete');
    }
  };

  const aggiungiRiga = async () => {
    if (!mat.trim() || !civicoApertoId || aggiungendoRiga) return;
    setErrore(null);
    // Cerca-o-aggiungi: se la matricola è già nel civico la apre (niente doppioni),
    // altrimenti crea la riga. Confronto normalizzato (MAIUSCOLO, solo A–Z/0–9).
    const norm = mat.trim();
    const key = normMatricola(norm);
    const esistente = key
      ? righe.find((r) => r.voce_id === civicoApertoId && normMatricola(r.matricola) === key)
      : undefined;
    if (esistente) {
      espandiRiga(esistente.id);
      setEvidenziata(esistente.id);
      setErrore('Misuratore già presente: aperto per la foto «dopo».');
      setMat(''); setPdr(''); setNom('');
      return;
    }
    setAggiungendoRiga(true);
    try {
      const res = await fetch(`/api/r/${token}/riga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, matricola: norm, pdr: pdr.trim() || null, nominativo: nom.trim() || null }),
      });
      if (!res.ok) { setErrore('Errore nell\'aggiunta del misuratore'); return; }
      const json = (await res.json()) as { riga?: RigaRisanamento };
      if (json.riga) {
        const nuova = json.riga;
        setRighe((prev) => [...prev, nuova]);
        setMat('');
        setPdr('');
        setNom('');
        espandiRiga(nuova.id);
      }
    } catch {
      setErrore('Errore di rete nell\'aggiunta del misuratore');
    } finally {
      setAggiungendoRiga(false);
    }
  };

  // Scanner unico "trova-o-crea": se la matricola è già in questo civico la evidenzia (niente doppioni),
  // altrimenti cerca nell'estrazione e crea la riga (o precompila il form manuale se non in elenco).
  const onScan = async (codice: string) => {
    setScanner(false);
    if (!civicoApertoId) return;
    const key = normMatricola(codice);
    const esistente = key
      ? righe.find((r) => r.voce_id === civicoApertoId && normMatricola(r.matricola) === key)
      : undefined;
    if (esistente) {
      espandiRiga(esistente.id);
      setEvidenziata(esistente.id);
      setErrore('Misuratore già presente: fai la foto «dopo».');
      return;
    }
    try {
      const res = await fetch(`/api/r/${token}/lookup-misuratore?voceId=${encodeURIComponent(civicoApertoId)}&codice=${encodeURIComponent(codice)}`);
      if (!res.ok) { setErrore('Errore nella ricerca del misuratore'); return; }
      const json = (await res.json()) as { trovato: false } | { trovato: true; fonte: string; ref_id: number; pdr: string | null; nominativo: string | null; indirizzoRef?: string };
      if (!json.trovato) {
        setMat(codice); setPdr(''); setNom('');
        setErrore('Matricola non in elenco: completa i dati e salva.');
        return;
      }
      const postRes = await fetch(`/api/r/${token}/riga`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voceId: civicoApertoId, matricola: codice, pdr: json.pdr, nominativo: json.nominativo, fonte: json.fonte, ref_id: json.ref_id }),
      });
      if (!postRes.ok) { setErrore('Errore nell\'aggiunta del misuratore'); return; }
      const rj = (await postRes.json()) as { riga?: RigaRisanamento };
      if (rj.riga) {
        const nuova = rj.riga;
        setRighe((prev) => [...prev, nuova]);
        espandiRiga(nuova.id);
        if (json.fonte === 'fuori_elenco') setErrore(`Misuratore fuori elenco (anagrafica: ${json.indirizzoRef ?? '—'}).`);
      }
    } catch {
      setErrore('Errore di rete');
    }
  };

  /* ── Vista lista civici ─────────────────────────────────────────────────── */

  if (civicoApertoId === null) {
    return (
      <>
        <div className="flex h-dvh flex-col">
          {/* Header */}
          <div className="shrink-0 border-b border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4">
            <div className="text-base font-bold text-[var(--brand-text-main)]">{rapportino.staff_name}</div>
            <div className="text-sm text-[var(--brand-text-muted)]">{formatData(rapportino.data)}</div>
          </div>

          {/* Lista civici */}
          <div className="flex-1 space-y-2.5 overflow-y-auto px-3 pb-6 pt-3">
            {voci.length === 0 ? (
              <p className="mt-8 text-center text-sm text-[var(--brand-text-muted)]">Nessun civico assegnato.</p>
            ) : (
              voci.map((voce, idx) => {
                const nMisuratori = righe.filter((r) => r.voce_id === voce.id).length;
                const titolo = [voce.via, (voce as Voce & { civico?: string }).civico].filter(Boolean).join(' ');
                return (
                  <button
                    key={voce.id}
                    type="button"
                    onClick={() => { setCivicoApertoId(voce.id); setErrore(null); }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 text-left transition active:border-[var(--brand-primary)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-sm font-bold text-[var(--brand-primary)]">
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-[var(--brand-text-main)]">
                        {titolo || voce.nominativo || `Civico ${idx + 1}`}
                      </span>
                      <span className="block truncate text-[12.5px] text-[var(--brand-text-muted)]">{voce.comune ?? ''}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--brand-surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--brand-text-subtle)]">
                      {nMisuratori} misuratori
                    </span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--brand-text-subtle)]" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer invio */}
          {!readOnly && !inviato && (
            <div className="sticky bottom-0 border-t border-[var(--brand-border)] bg-[var(--brand-surface)] p-3">
              {incompleti.length > 0 && (
                <div className="mb-2 rounded-xl border border-[var(--danger)] bg-[var(--danger)]/10 p-3 text-xs text-[var(--danger)]">
                  <p className="mb-1 font-semibold">Mancano foto obbligatorie:</p>
                  <ul className="space-y-1">
                    {incompleti.map((d, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => vaiAIncompleto(d)}
                          className="flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-[var(--danger)]/10"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">
                              {d.tipo === 'riga'
                                ? `Misuratore ${d.matricola?.trim() || '(senza matricola)'}`
                                : labelCivico(d.voceId)}
                            </span>
                            {d.tipo === 'riga' && (
                              <span className="block opacity-80">{labelCivico(d.voceId)}</span>
                            )}
                            <span className="block">Manca: {d.campiMancanti.join(', ')}</span>
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold opacity-70">apri ›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                type="button"
                onClick={onInviaClick}
                disabled={inviando}
                className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                {inviando ? 'Invio…' : `Invia rapportino (${puntiGas} punti gas)`}
              </button>
            </div>
          )}

          {/* Banner inviato */}
          {inviato && (
            <div className="m-3 rounded-xl border border-[var(--success)] bg-[var(--success)]/10 p-4 text-center">
              <p className="mb-3 text-sm font-semibold text-[var(--success)]">Rapportino inviato ✓</p>
              <button type="button" onClick={condividiPdf} disabled={pdfBusy}
                className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {pdfBusy ? 'Genero…' : '📄 Condividi PDF'}
              </button>
              {errore && <p className="mt-2 text-xs text-[var(--danger)]">{errore}</p>}
            </div>
          )}
        </div>

        {/* Modale conferma punti gas */}
        {modalePuntiGas && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[var(--brand-surface)] p-5">
              <p className="mb-2 text-base font-semibold text-[var(--brand-text-main)]">Conferma invio</p>
              <p className="mb-4 text-sm text-[var(--brand-text-soft)]">
                Rilevati <b>{puntiGas} punti gas</b> ({puntiGas} misuratori in {nCivici} civici). Confermi l&apos;invio del rapportino?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalePuntiGas(false)}
                  className="flex-1 rounded-xl border border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => { void confermaInvio(); }}
                  className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Conferma
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ── Vista dettaglio civico ─────────────────────────────────────────────── */

  const voce = voci.find((v) => v.id === civicoApertoId);
  if (civicoApertoId !== null && !voce) return null;
  // voce is defined here: the guard above returns null when voce is undefined
  const voceDefinita = voce!;

  const righeCivico = righe.filter((r) => r.voce_id === civicoApertoId).sort((a, b) => a.ordine - b.ordine);
  const risposteVoce = vociRisposte[civicoApertoId] ?? {};
  const titoloCivico = [voceDefinita.via, (voceDefinita as Voce & { civico?: string }).civico].filter(Boolean).join(' ') || voceDefinita.nominativo || 'Civico';

  // Conteggio foto-misuratore di una riga: completa = tutte le foto obbligatorie presenti.
  const statoFotoRiga = (riga: RigaRisanamento) => {
    const fatte = scope.misuratore.filter((c) => typeof riga.risposte?.[c.chiave] === 'string' && (riga.risposte?.[c.chiave] as string).length > 0).length;
    const obblOk = scope.misuratore
      .filter((c) => c.obbligatoria)
      .every((c) => typeof riga.risposte?.[c.chiave] === 'string' && (riga.risposte?.[c.chiave] as string).length > 0);
    return { fatte, totale: scope.misuratore.length, completa: obblOk };
  };

  return (
    <div className="flex h-dvh flex-col">
      {/* Header dettaglio */}
      <div className="shrink-0 border-b border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3">
        <button
          type="button"
          onClick={() => { setCivicoApertoId(null); setErrore(null); }}
          className="mb-1 flex items-center gap-1 text-sm font-semibold text-[var(--brand-primary)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Civici
        </button>
        <div className="text-base font-bold text-[var(--brand-text-main)]">{titoloCivico}</div>
        <div className="text-sm text-[var(--brand-text-muted)]">{voceDefinita.comune ?? ''}</div>
      </div>

      {/* Corpo scrollabile */}
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-8 pt-3">
        {/* Errore inline */}
        {errore && (
          <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
            {errore}
          </div>
        )}

        {/* ── Sezione 1: Misuratori ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--brand-text-subtle)]">Misuratori</h2>
            {righeCivico.length > 0 && (
              <span className="shrink-0 rounded-full bg-[var(--brand-surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--brand-text-subtle)]">
                {righeCivico.length}
              </span>
            )}
          </div>

          {righeCivico.length === 0 && (
            <p className="mb-3 text-sm text-[var(--brand-text-muted)]">Nessun misuratore ancora aggiunto.</p>
          )}

          {righeCivico.map((riga) => {
            const aperto = espansi.has(riga.id) || evidenziata === riga.id;
            const st = statoFotoRiga(riga);
            return (
              <div key={riga.id} id={`mis-${riga.id}`} className={`mb-2.5 overflow-hidden rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)]${evidenziata === riga.id ? ' ring-2 ring-[var(--brand-primary)]' : ''}`}>
                {/* Intestazione: toggle accordion + stato foto + elimina */}
                <div className="flex items-center gap-1.5 pr-2">
                  <button
                    type="button"
                    onClick={() => toggleRiga(riga.id)}
                    aria-expanded={aperto}
                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 text-left"
                  >
                    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-[var(--brand-text-subtle)] transition-transform${aperto ? ' rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[var(--brand-text-main)]">
                        {riga.matricola || 'Senza matricola'}
                      </span>
                      {riga.nominativo && (
                        <span className="block truncate text-[12px] text-[var(--brand-text-muted)]">{riga.nominativo}</span>
                      )}
                    </span>
                  </button>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.completa ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--brand-surface)] text-[var(--brand-text-subtle)]'}`}
                  >
                    {st.completa ? '✓ foto' : `${st.fatte}/${st.totale} foto`}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => { setEliminaTarget(riga); setEliminaStep2(false); }}
                      aria-label={`Elimina misuratore ${riga.matricola ?? ''}`}
                      title="Elimina misuratore"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Corpo: slot foto del misuratore */}
                {aperto && (
                  <div className="space-y-2 border-t border-[var(--brand-border)] px-3 py-3">
                    {scope.misuratore.map((campo) => (
                      <SlotFoto
                        key={campo.chiave}
                        token={token}
                        etichetta={campo.etichetta}
                        obbligatoria={campo.obbligatoria}
                        valore={(riga.risposte?.[campo.chiave] as string | null | undefined) ?? null}
                        disabilitato={readOnly}
                        onUploaded={(path) => { void salvaFotoRiga(riga.id, campo.chiave, path); }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Card cerca / scansiona / aggiungi misuratore (sempre presente) */}
          {!readOnly && (
            <div className="mt-3 space-y-2 rounded-xl border border-dashed border-[var(--brand-border)] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Cerca o aggiungi misuratore</div>
              <p className="text-[11px] leading-snug text-[var(--brand-text-muted)]">
                Scansiona o digita la matricola: se è già presente la apri per la foto, altrimenti viene aggiunta.
              </p>
              {/* DB pulito: anagrafica scritta SEMPRE in MAIUSCOLO (anche se digitata minuscola). */}
              <input
                type="text"
                placeholder="Matricola"
                aria-label="Matricola"
                value={mat}
                // MAIUSCOLO "IME-safe" (vedi maiuscoloDigitando): su Android lo SPAZIO non cancella il campo.
                onChange={(e) => { setMat(maiuscoloDigitando(e)); setErrore(null); }}
                onCompositionEnd={(e) => setMat(e.currentTarget.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void aggiungiRiga(); } }}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm uppercase text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              <input
                type="text"
                placeholder="PDR (facoltativo)"
                aria-label="PDR"
                value={pdr}
                onChange={(e) => { setPdr(maiuscoloDigitando(e)); }}
                onCompositionEnd={(e) => setPdr(e.currentTarget.value.toUpperCase())}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm uppercase text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              <input
                type="text"
                placeholder="Nominativo (facoltativo)"
                aria-label="Nominativo"
                value={nom}
                onChange={(e) => { setNom(maiuscoloDigitando(e)); }}
                onCompositionEnd={(e) => setNom(e.currentTarget.value.toUpperCase())}
                className="w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm uppercase text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScanner(true)}
                  className="flex-1 whitespace-nowrap rounded-xl border border-[var(--brand-primary)] px-2 py-2.5 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]"
                >
                  📷 Scansiona
                </button>
                <button
                  type="button"
                  onClick={() => { void aggiungiRiga(); }}
                  disabled={aggiungendoRiga}
                  className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--on-primary)] transition hover:opacity-90 disabled:opacity-50"
                >
                  ＋ Aggiungi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Sezione 2: Fasi ───────────────────────────────────────────────── */}
        {scope.fase.length > 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--brand-text-subtle)]">Fasi</h2>
            <div className="space-y-2">
              {scope.fase.map((campo) => (
                <GalleriaFoto
                  key={campo.chiave}
                  token={token}
                  etichetta={campo.etichetta}
                  obbligatoria={campo.obbligatoria}
                  valori={comeArrayFoto(risposteVoce[campo.chiave])}
                  disabilitato={readOnly}
                  onAdd={(path) => { void aggiungiFotoVoce(campo.chiave, path); }}
                  onRemove={(path) => { void rimuoviFotoVoce(campo.chiave, path); }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Sezione 3: Accessorie (slot sempre visibili, facoltativi) ─────── */}
        {scope.accessoria.length > 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-[var(--brand-text-subtle)]">Accessorie</h2>
            <p className="mb-3 text-[11px] text-[var(--brand-text-muted)]">Foto facoltative: compila solo quelle che servono.</p>
            <div className="space-y-2">
              {scope.accessoria.map((campo) => (
                <GalleriaFoto
                  key={campo.chiave}
                  token={token}
                  etichetta={campo.etichetta}
                  obbligatoria={campo.obbligatoria}
                  valori={comeArrayFoto(risposteVoce[campo.chiave])}
                  disabilitato={readOnly}
                  onAdd={(path) => { void aggiungiFotoVoce(campo.chiave, path); }}
                  onRemove={(path) => { void rimuoviFotoVoce(campo.chiave, path); }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {scanner && (
        <ScannerMisuratore onCodice={onScan} onChiudi={() => setScanner(false)} />
      )}

      {/* Eliminazione misuratore — doppia conferma */}
      {eliminaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--brand-surface)] p-5">
            {!eliminaStep2 ? (
              <>
                <p className="mb-2 text-base font-semibold text-[var(--brand-text-main)]">Eliminare il misuratore?</p>
                <p className="mb-4 text-sm text-[var(--brand-text-soft)]">
                  Stai per eliminare <b>{eliminaTarget.matricola?.trim() || '(senza matricola)'}</b> e tutte le foto caricate su questo misuratore.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEliminaTarget(null); setEliminaStep2(false); }}
                    className="flex-1 rounded-xl border border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={() => setEliminaStep2(true)}
                    className="flex-1 rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Elimina
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-2 text-base font-semibold text-[var(--danger)]">Conferma eliminazione</p>
                <p className="mb-4 text-sm text-[var(--brand-text-soft)]">
                  L&apos;operazione è <b>definitiva e non reversibile</b>. Confermi l&apos;eliminazione di <b>{eliminaTarget.matricola?.trim() || '(senza matricola)'}</b>?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEliminaTarget(null); setEliminaStep2(false); }}
                    disabled={eliminando}
                    className="flex-1 rounded-xl border border-[var(--brand-border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={() => { void eliminaRiga(); }}
                    disabled={eliminando}
                    className="flex-1 rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {eliminando ? 'Elimino…' : 'Sì, elimina'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
