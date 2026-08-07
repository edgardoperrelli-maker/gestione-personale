'use client';

import { chiediConferma } from '@/components/ui/chiediConferma';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { numeroIt } from '@/utils/numero-it';

/** Codice di runtime del committente: viene dal REGISTRO (`committenti`), non da un
 *  elenco cablato. Aggiungere un committente in Contratti lo rende selezionabile qui. */
type Committente = string;

/** Voce del menu committente: codice di runtime + nome leggibile. */
export type OpzioneCommittente = { codice: string; nome: string };

type RigaTassonomia = {
  id: string;
  committente: string;
  descrizione: string;
  descrizione_norm?: string;
  gruppo: string;
  attivo: boolean;
  utilizzo: number;
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

const NUOVO_GRUPPO = '__nuovo__';

/** Nome leggibile dal registro; se un codice storico non c'è più, si mostra il codice. */
function etichettaDa(opzioni: OpzioneCommittente[], committente: string): string {
  return opzioni.find((o) => o.codice === committente)?.nome ?? committente;
}

/** Posizione nell'ordine del registro; gli sconosciuti finiscono in fondo. */
function indiceDa(opzioni: OpzioneCommittente[], committente: string): number {
  const i = opzioni.findIndex((o) => o.codice === committente);
  return i === -1 ? opzioni.length : i;
}

function usageLabel(utilizzo: number): string {
  if (utilizzo === 0) return 'Non utilizzata';
  return `${numeroIt(utilizzo)} interventi`;
}

function sortRows(rows: RigaTassonomia[], opzioni: OpzioneCommittente[]): RigaTassonomia[] {
  return [...rows].sort((a, b) => {
    const ci = indiceDa(opzioni, a.committente) - indiceDa(opzioni, b.committente);
    if (ci !== 0) return ci;
    const gi = a.gruppo.localeCompare(b.gruppo, 'it', { sensitivity: 'base' });
    if (gi !== 0) return gi;
    return a.descrizione.localeCompare(b.descrizione, 'it', { sensitivity: 'base' });
  });
}

type GruppoGroup = { gruppo: string; rows: RigaTassonomia[] };
type CommittenteGroup = { committente: string; label: string; groups: GruppoGroup[] };

function buildGrouped(rows: RigaTassonomia[], opzioni: OpzioneCommittente[]): CommittenteGroup[] {
  const sorted = sortRows(rows, opzioni);
  const committenteMap = new Map<string, Map<string, RigaTassonomia[]>>();
  for (const row of sorted) {
    if (!committenteMap.has(row.committente)) committenteMap.set(row.committente, new Map());
    const gruppoMap = committenteMap.get(row.committente)!;
    if (!gruppoMap.has(row.gruppo)) gruppoMap.set(row.gruppo, []);
    gruppoMap.get(row.gruppo)!.push(row);
  }
  return [...committenteMap.entries()]
    .sort(([a], [b]) => indiceDa(opzioni, a) - indiceDa(opzioni, b))
    .map(([committente, gruppoMap]) => ({
      committente,
      label: etichettaDa(opzioni, committente),
      groups: [...gruppoMap.entries()].map(([gruppo, groupRows]) => ({ gruppo, rows: groupRows })),
    }));
}

export default function AttivitaTassonomiaClient({
  committenti,
}: {
  /** Dal registro `committenti` + la voce «Altro», che è un catch-all e non un committente. */
  committenti: OpzioneCommittente[];
}) {
  const [rows, setRows] = useState<RigaTassonomia[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [committenteFilter, setCommittenteFilter] = useState<'all' | Committente>('all');

  const [newCommittente, setNewCommittente] = useState<Committente>(committenti[0]?.codice ?? 'altro');
  const [newDescrizione, setNewDescrizione] = useState('');
  const [newGruppoSelect, setNewGruppoSelect] = useState('');
  const [newGruppoCustom, setNewGruppoCustom] = useState('');
  const [creating, setCreating] = useState(false);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Spostamento di gruppo: una riga alla volta, editor inline aperto sulla riga scelta.
  const [moveId, setMoveId] = useState<string | null>(null);
  const [moveSelect, setMoveSelect] = useState('');
  const [moveCustom, setMoveCustom] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);

  const showFeedback = useCallback((type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 3500);
  }, []);

  useEffect(() => {
    let alive = true;

    const loadRows = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/attivita-tassonomia', { cache: 'no-store' });
        const json = (await response.json()) as { error?: string; righe?: RigaTassonomia[] };
        if (!response.ok) throw new Error(json.error ?? 'Errore caricamento tassonomia.');
        if (alive) setRows(json.righe ?? []);
      } catch (err) {
        if (alive) {
          showFeedback('error', err instanceof Error ? err.message : 'Errore caricamento tassonomia.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadRows();
    return () => {
      alive = false;
    };
  }, [showFeedback]);

  const stats = useMemo(() => {
    const attive = rows.filter((row) => row.attivo).length;
    const inUso = rows.filter((row) => row.utilizzo > 0).length;
    return { totale: rows.length, attive, inUso };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('it-IT');
    let filtered = rows;

    if (term) {
      filtered = filtered.filter(
        (row) =>
          row.descrizione.toLocaleLowerCase('it-IT').includes(term) ||
          row.gruppo.toLocaleLowerCase('it-IT').includes(term),
      );
    }

    if (statusFilter === 'active') {
      filtered = filtered.filter((row) => row.attivo);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter((row) => !row.attivo);
    }

    if (committenteFilter !== 'all') {
      filtered = filtered.filter((row) => row.committente === committenteFilter);
    }

    return filtered;
  }, [rows, query, statusFilter, committenteFilter]);

  const grouped = useMemo(() => buildGrouped(filteredRows, committenti), [filteredRows, committenti]);

  const gruppiPerCommittente = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!map.has(row.committente)) map.set(row.committente, new Set());
      map.get(row.committente)!.add(row.gruppo);
    }
    return map;
  }, [rows]);

  const tuttiIGruppi = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) set.add(row.gruppo);
    return [...set].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  }, [rows]);

  const gruppiPropri = useMemo(() => {
    const set = gruppiPerCommittente.get(newCommittente) ?? new Set<string>();
    return [...set].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  }, [gruppiPerCommittente, newCommittente]);

  const gruppiAltri = useMemo(
    () => tuttiIGruppi.filter((gruppo) => !gruppiPropri.includes(gruppo)),
    [tuttiIGruppi, gruppiPropri],
  );

  const handleCreate = async () => {
    if (creating) return;

    const descrizione = newDescrizione.replace(/\s+/g, ' ').trim();
    if (!descrizione) {
      showFeedback('error', 'Descrizione attività obbligatoria.');
      return;
    }

    const gruppoScelto = newGruppoSelect === NUOVO_GRUPPO ? newGruppoCustom : newGruppoSelect;
    const gruppo = gruppoScelto.replace(/\s+/g, ' ').trim();
    if (!gruppo) {
      showFeedback('error', 'Gruppo attività obbligatorio.');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/admin/attivita-tassonomia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ committente: newCommittente, descrizione, gruppo }),
      });
      const json = (await response.json()) as { error?: string; riga?: RigaTassonomia };
      if (!response.ok) throw new Error(json.error ?? 'Errore creazione voce.');
      if (json.riga) setRows((prev) => [json.riga!, ...prev]);
      setNewDescrizione('');
      setNewGruppoSelect('');
      setNewGruppoCustom('');
      showFeedback('success', `${descrizione} aggiunta.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore creazione voce.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (row: RigaTassonomia) => {
    if (savingId) return;

    setSavingId(row.id);
    try {
      const response = await fetch('/api/admin/attivita-tassonomia', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, attivo: !row.attivo }),
      });
      const json = (await response.json()) as { error?: string; riga?: RigaTassonomia };
      if (!response.ok) throw new Error(json.error ?? 'Errore aggiornamento stato.');
      if (json.riga) {
        const aggiornata = json.riga;
        setRows((prev) => prev.map((r) => (r.id === row.id ? aggiornata : r)));
        showFeedback('success', `${aggiornata.descrizione} ${aggiornata.attivo ? 'attivata' : 'disattivata'}.`);
      }
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore aggiornamento stato.');
    } finally {
      setSavingId(null);
    }
  };

  const apriSpostamento = (row: RigaTassonomia) => {
    setMoveId(row.id);
    setMoveSelect(NUOVO_GRUPPO);
    setMoveCustom('');
  };

  const chiudiSpostamento = () => {
    setMoveId(null);
    setMoveSelect('');
    setMoveCustom('');
  };

  /** Sposta l'attività in un altro gruppo: cambia CHI le dà le azioni, non la sua storia. */
  const handleMove = async (row: RigaTassonomia) => {
    if (movingId) return;

    const scelto = moveSelect === NUOVO_GRUPPO ? moveCustom : moveSelect;
    const gruppo = scelto.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!gruppo) {
      showFeedback('error', 'Gruppo di destinazione obbligatorio.');
      return;
    }
    if (gruppo === row.gruppo.toUpperCase()) {
      chiudiSpostamento();
      return;
    }

    const ok = await chiediConferma({
      title: `Spostare "${row.descrizione}" nel gruppo ${gruppo}?`,
      message:
        row.utilizzo > 0
          ? `${usageLabel(row.utilizzo)} già registrati passano da ${row.gruppo} a ${gruppo}. Da qui in poi l'attività prende le azioni del flusso di ${gruppo} (Azioni operatori); i rapportini già generati restano come sono finché non li rigeneri.`
          : `Da qui in poi l'attività prende le azioni del flusso di ${gruppo} (Azioni operatori).`,
      confirmLabel: 'Sposta',
    });
    if (!ok) return;

    setMovingId(row.id);
    try {
      const response = await fetch('/api/admin/attivita-tassonomia', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, gruppo }),
      });
      const json = (await response.json()) as {
        error?: string; riga?: RigaTassonomia; interventiRiallineati?: number; vociRiagganciate?: number;
      };
      if (!response.ok) throw new Error(json.error ?? 'Errore spostamento gruppo.');
      if (json.riga) {
        const aggiornata = json.riga;
        setRows((prev) => prev.map((r) => (r.id === row.id ? aggiornata : r)));
        const n = json.interventiRiallineati ?? 0;
        const v = json.vociRiagganciate ?? 0;
        showFeedback(
          'success',
          `${aggiornata.descrizione} spostata in ${aggiornata.gruppo}` +
            (n > 0 ? ` · ${numeroIt(n)} interventi riallineati` : '') +
            (v > 0 ? ` · ${numeroIt(v)} voci di rapportini aperti già sulle nuove azioni` : '') +
            '.',
        );
      }
      chiudiSpostamento();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore spostamento gruppo.');
    } finally {
      setMovingId(null);
    }
  };

  const handleDelete = async (row: RigaTassonomia) => {
    if (deletingId || row.utilizzo > 0) return;
    if (!(await chiediConferma({ title: `Eliminare "${row.descrizione}"?`, confirmLabel: 'Elimina', danger: true }))) return;

    setDeletingId(row.id);
    try {
      const response = await fetch(`/api/admin/attivita-tassonomia?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const json = (await response.json()) as { error?: string; utilizzo?: number };
      if (!response.ok) throw new Error(json.error ?? 'Errore eliminazione voce.');
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showFeedback('success', `${row.descrizione} eliminata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore eliminazione voce.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Tassonomia attività</h1>
        <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
          Descrizioni e gruppi attività validi per import mappa, template rapportini e inserimenti manuali.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Voci totali</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.totale}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">Attive</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.attive}</div>
        </div>
        <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-3 py-2">
          <div className="text-xs text-[var(--brand-text-muted)]">In uso</div>
          <div className="text-lg font-semibold text-[var(--brand-primary)]">{stats.inUso}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-[var(--brand-text-main)]">Nuova voce</h2>
        <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_220px_auto]">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Committente
            </label>
            <select
              value={newCommittente}
              onChange={(event) => {
                setNewCommittente(event.target.value as Committente);
                setNewGruppoSelect('');
                setNewGruppoCustom('');
              }}
              className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
            >
              {committenti.map((c) => (
                <option key={c.codice} value={c.codice}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Descrizione attività
            </label>
            <input
              value={newDescrizione}
              onChange={(event) => setNewDescrizione(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreate();
              }}
              placeholder="Descrizione attività"
              className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Gruppo
            </label>
            <select
              value={newGruppoSelect}
              onChange={(event) => setNewGruppoSelect(event.target.value)}
              className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
            >
              <option value="">Seleziona gruppo...</option>
              {gruppiPropri.length > 0 && (
                <optgroup label={`Gruppi ${etichettaDa(committenti, newCommittente)}`}>
                  {gruppiPropri.map((gruppo) => (
                    <option key={gruppo} value={gruppo}>
                      {gruppo}
                    </option>
                  ))}
                </optgroup>
              )}
              {gruppiAltri.length > 0 && (
                <optgroup label="Altri gruppi">
                  {gruppiAltri.map((gruppo) => (
                    <option key={gruppo} value={gruppo}>
                      {gruppo}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value={NUOVO_GRUPPO}>+ Nuovo gruppo...</option>
            </select>
            {newGruppoSelect === NUOVO_GRUPPO && (
              <input
                value={newGruppoCustom}
                onChange={(event) => setNewGruppoCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreate();
                }}
                placeholder="Nome nuovo gruppo"
                className="mt-2 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
              />
            )}
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newDescrizione.trim()}
              className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 sm:w-auto"
            >
              {creating ? 'Aggiunta...' : 'Aggiungi'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/30 px-4 py-3 text-sm text-[var(--brand-text-muted)]">
        Le descrizioni non si rinominano: crea la nuova voce e disattiva la vecchia. Le nuove attività sono subito
        valide per import mappa, template e inserimenti manuali. Il <strong>gruppo</strong> invece si cambia con
        «Sposta»: è il gruppo a decidere le azioni che l&apos;operatore compila (Azioni operatori), quindi
        un&apos;attività che deve avere azioni sue va portata in un gruppo suo.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Cerca
          </label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Descrizione o gruppo..."
            className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Stato
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
            className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
          >
            <option value="all">Tutte</option>
            <option value="active">Attive</option>
            <option value="inactive">Disattive</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Committente
          </label>
          <select
            value={committenteFilter}
            onChange={(event) => setCommittenteFilter(event.target.value as 'all' | Committente)}
            className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
          >
            <option value="all">Tutti</option>
            {committenti.map((c) => (
              <option key={c.codice} value={c.codice}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            feedback.type === 'success'
              ? 'border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 text-[var(--brand-text-main)]'
              : 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="space-y-6">
        {loading && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center text-sm text-[var(--brand-text-muted)] shadow-sm">
            Caricamento tassonomia...
          </div>
        )}

        {!loading && grouped.length === 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center text-sm text-[var(--brand-text-muted)] shadow-sm">
            Nessuna voce trovata.
          </div>
        )}

        {!loading &&
          grouped.map((committenteGroup) => (
            <div key={committenteGroup.committente} className="space-y-3">
              <h2 className="text-lg font-semibold text-[var(--brand-text-main)]">{committenteGroup.label}</h2>

              {committenteGroup.groups.map((gruppoGroup) => (
                <div key={gruppoGroup.gruppo} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    {gruppoGroup.gruppo}
                  </h3>

                  {gruppoGroup.rows.map((row) => {
                    const saving = savingId === row.id;
                    const deleting = deletingId === row.id;
                    const moving = movingId === row.id;
                    const canDelete = row.utilizzo === 0;
                    const inSpostamento = moveId === row.id;
                    const gruppiDestinazione = [...(gruppiPerCommittente.get(row.committente) ?? new Set<string>())]
                      .filter((g) => g !== row.gruppo)
                      .sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

                    return (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-[var(--brand-text-main)]">{row.descrizione}</span>
                            <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-2 py-0.5 text-xs text-[var(--brand-primary)]">
                              {row.gruppo}
                            </span>
                            <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                              {row.attivo ? 'Attiva' : 'Disattiva'}
                            </span>
                            <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                              {usageLabel(row.utilizzo)}
                            </span>
                          </div>

                          {inSpostamento && (
                            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/30 p-3">
                              <div className="min-w-[220px] flex-1">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                                  Sposta nel gruppo
                                </label>
                                <select
                                  value={moveSelect}
                                  onChange={(event) => setMoveSelect(event.target.value)}
                                  className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                                >
                                  {gruppiDestinazione.length > 0 && (
                                    <optgroup label={`Gruppi ${etichettaDa(committenti, row.committente)}`}>
                                      {gruppiDestinazione.map((gruppo) => (
                                        <option key={gruppo} value={gruppo}>
                                          {gruppo}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <option value={NUOVO_GRUPPO}>+ Nuovo gruppo...</option>
                                </select>
                                {moveSelect === NUOVO_GRUPPO && (
                                  <input
                                    value={moveCustom}
                                    onChange={(event) => setMoveCustom(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') void handleMove(row);
                                    }}
                                    placeholder="Nome nuovo gruppo"
                                    className="mt-2 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                                  />
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={moving}
                                onClick={() => void handleMove(row)}
                                className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
                              >
                                {moving ? 'Spostamento...' : 'Sposta'}
                              </button>
                              <button
                                type="button"
                                disabled={moving}
                                onClick={chiudiSpostamento}
                                className="rounded-xl border border-[var(--brand-border)] px-4 py-2 text-sm font-semibold text-[var(--brand-text-main)] transition hover:bg-[var(--brand-surface)] disabled:opacity-50"
                              >
                                Annulla
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={saving || deleting || moving}
                            title="Cambia il gruppo: è il gruppo a decidere le azioni che l'operatore compila"
                            onClick={() => (inSpostamento ? chiudiSpostamento() : apriSpostamento(row))}
                            className="rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-main)] transition hover:bg-[var(--brand-primary-soft)] disabled:opacity-50"
                          >
                            {inSpostamento ? 'Chiudi' : 'Sposta'}
                          </button>
                          <button
                            type="button"
                            disabled={saving || deleting || moving}
                            onClick={() => void handleToggle(row)}
                            className="rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-text-main)] transition hover:bg-[var(--brand-primary-soft)] disabled:opacity-50"
                          >
                            {saving ? 'Attendere...' : row.attivo ? 'Disattiva' : 'Attiva'}
                          </button>
                          <button
                            type="button"
                            disabled={saving || deleting || moving || !canDelete}
                            title={canDelete ? undefined : 'Voce già utilizzata: disattivala invece'}
                            onClick={() => void handleDelete(row)}
                            className="rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)] disabled:opacity-50"
                          >
                            {deleting ? 'Eliminazione...' : 'Elimina'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
