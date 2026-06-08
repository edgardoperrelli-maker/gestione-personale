'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { nonConsegnati } from '@/utils/rapportini/nonConsegnati';
import { type RapportinoStato, statoBadge, whatsappHref } from '@/utils/rapportini/links';

interface Piano {
  id: string;
  data: string;
  territorio: string;
  note?: string;
  stato: string;
  created_at: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  operatori: Array<{
    staff_id: string;
    staff_name: string;
  }>;
}

interface Template {
  id: string;
  nome: string;
  is_default?: boolean;
  active?: boolean;
  solo_manuale?: boolean;
}

export default function RegistroPianificazioni() {
  const [piani, setPiani] = useState<Piano[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Rapportini: pannello/modal per piano
  const [rapPiano, setRapPiano] = useState<Piano | null>(null);
  const [alerts, setAlerts] = useState<{ staff_name?: string; data: string }[]>([]);

  const loadPiani = useCallback(async () => {
    try {
      const response = await fetch('/api/mappa/piani');
      if (!response.ok) {
        console.error('API error:', response.status, response.statusText);
        setPiani([]);
        return;
      }
      const data = await response.json();
      setPiani(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching piani:', error);
      setPiani([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPiani();
  }, [loadPiani]);

  // Alert "non consegnato": aggrega i rapportini di tutti i piani e usa nonConsegnati()
  const caricaAlert = async (lista: Piano[]) => {
    if (lista.length === 0) {
      setAlerts([]);
      return;
    }
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const liste = await Promise.all(
        lista.map(async (p) => {
          try {
            const res = await fetch(`/api/mappa/rapportini?pianoId=${p.id}`);
            if (!res.ok) return [] as RapportinoStato[];
            const data = await res.json();
            return (Array.isArray(data) ? data : []) as RapportinoStato[];
          } catch {
            return [] as RapportinoStato[];
          }
        }),
      );
      const tutti = liste.flat().map((r) => ({
        data: r.data,
        stato: r.stato,
        staff_name: r.staff_name ?? undefined,
      }));
      setAlerts(nonConsegnati(tutti, todayIso));
    } catch (error) {
      console.error('Error loading rapportini alerts:', error);
    }
  };

  useEffect(() => {
    caricaAlert(piani);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piani]);

  const refreshAlerts = () => caricaAlert(piani);

  const handleDelete = async (pianoId: string) => {
    setDeletingId(pianoId);
    try {
      const response = await fetch(`/api/mappa/piani?id=${pianoId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setPiani((prev) => prev.filter((p) => p.id !== pianoId));
      } else {
        console.error('Error deleting piano');
      }
    } catch (error) {
      console.error('Error deleting piano:', error);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const handleReopen = (pianoId: string) => {
    window.location.href = `/hub/mappa?vista=pianifica&pianoId=${pianoId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-[var(--brand-text-muted)]">Caricamento pianificazioni...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Registro pianificazioni</h2>
        <Link
          href="/hub/mappa?vista=pianifica"
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] hover:opacity-90"
        >
          + Nuova pianificazione
        </Link>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-4 py-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)]">
            <span aria-hidden>⚠</span>
            Rapportini non consegnati ({alerts.length})
          </div>
          <ul className="space-y-0.5">
            {alerts.map((a, i) => (
              <li key={`${a.staff_name ?? 'op'}-${a.data}-${i}`} className="text-xs text-[var(--brand-primary-hover)]">
                {a.staff_name ?? 'Operatore'} · piano{' '}
                {new Date(a.data).toLocaleDateString('it-IT', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}{' '}
                non consegnato, richiede intervento
              </li>
            ))}
          </ul>
        </div>
      )}

      {piani.length === 0 ? (
        <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--brand-text-muted)]">Nessuna pianificazione salvata</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--brand-border)] shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--brand-border)] bg-[var(--brand-surface-muted)]">
                <th className="px-4 py-3 text-left font-semibold text-[var(--brand-text-main)]">Data</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--brand-text-main)]">Territorio</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--brand-text-main)]">Operatori</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--brand-text-main)]">Note</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--brand-text-main)]">Stato</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--brand-text-main)]">
                  Autore
                </th>
                <th className="px-4 py-3 text-right font-semibold text-[var(--brand-text-main)]">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {piani.map((piano) => (
                <tr key={piano.id} className="border-b border-[var(--brand-border)] hover:bg-[var(--brand-surface-muted)]">
                  <td className="px-4 py-3 font-medium text-[var(--brand-text-main)]">
                    {new Date(piano.data).toLocaleDateString('it-IT', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-[var(--brand-text-main)]">{piano.territorio}</td>
                  <td className="px-4 py-3 text-[var(--brand-text-main)]">
                    {piano.operatori.length}
                  </td>
                  <td className="px-4 py-3 truncate text-[var(--brand-text-muted)]">
                    {piano.note ? (
                      <span title={piano.note}>{piano.note}</span>
                    ) : (
                      <span className="text-[var(--brand-text-subtle)]">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        piano.stato === 'confermato'
                          ? 'bg-[var(--success-soft)] text-[var(--success)]'
                          : 'bg-[var(--warning-soft)] text-[var(--warning)]'
                      }`}
                    >
                      {piano.stato === 'confermato' ? 'Confermato' : 'Bozza'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-[var(--brand-text-main)]">
                    <div className="text-xs">
                      {piano.updated_by_name
                        ? (
                          <span title={`Ultima modifica: ${piano.updated_by_name}`}>
                            {piano.updated_by_name}
                          </span>
                        )
                        : piano.created_by_name
                          ? piano.created_by_name
                          : <span className="opacity-40">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleReopen(piano.id)}
                      className="mr-2 rounded border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary-border)] disabled:opacity-50"
                      disabled={deletingId === piano.id || confirmId === piano.id}
                    >
                      Riapri
                    </button>

                    <button
                      onClick={() => setRapPiano(piano)}
                      className="mr-2 rounded border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-1 text-xs font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary-border)] disabled:opacity-50"
                      disabled={deletingId === piano.id || confirmId === piano.id}
                    >
                      Rapportini
                    </button>

                    {confirmId === piano.id ? (
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs font-medium text-[var(--danger)]">Elimina?</span>
                        <button
                          onClick={() => handleDelete(piano.id)}
                          disabled={deletingId === piano.id}
                          className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--danger)] hover:opacity-80 disabled:opacity-50"
                        >
                          {deletingId === piano.id ? '...' : 'Sì'}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="rounded border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(piano.id)}
                        className="rounded border border-[var(--brand-border)] px-3 py-1 text-xs text-[var(--brand-text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                      >
                        Elimina
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rapPiano && (
        <RapportiniModal
          piano={rapPiano}
          onClose={() => setRapPiano(null)}
          onRefreshAlerts={refreshAlerts}
          onChanged={loadPiani}
        />
      )}
    </div>
  );
}

function RapportiniModal({
  piano,
  onClose,
  onRefreshAlerts,
  onChanged,
}: {
  piano: Piano;
  onClose: () => void;
  onRefreshAlerts: () => void;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [stato, setStato] = useState<RapportinoStato[]>([]);
  const [loadingStato, setLoadingStato] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [rimuoviStaffId, setRimuoviStaffId] = useState<string | null>(null);
  const [rimuovendo, setRimuovendo] = useState<string | null>(null);

  const dataLabel = new Date(piano.data).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const caricaStato = async () => {
    setLoadingStato(true);
    try {
      const res = await fetch(`/api/mappa/rapportini?pianoId=${piano.id}`);
      const data = await res.json();
      setStato(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading stato rapportini:', error);
      setStato([]);
    } finally {
      setLoadingStato(false);
    }
  };

  useEffect(() => {
    const caricaTemplates = async () => {
      try {
        const res = await fetch('/api/admin/rapportino-template');
        const data = await res.json();
        const list: Template[] = Array.isArray(data) ? data : [];
        const listFiltrata = list.filter((t) => !t.solo_manuale);
        setTemplates(listFiltrata);
        const def = listFiltrata.find((t) => t.is_default) ?? listFiltrata[0];
        if (def) setTemplateId(def.id);
      } catch (error) {
        console.error('Error loading templates:', error);
      }
    };
    caricaTemplates();
    caricaStato();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piano.id]);

  const handleGenera = async () => {
    if (!templateId) {
      setErrore('Seleziona un modello.');
      return;
    }
    setGenerating(true);
    setErrore(null);
    try {
      const res = await fetch('/api/mappa/rapportini/genera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pianoId: piano.id, templateId }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setErrore(data?.error ?? 'Errore durante la generazione.');
        return;
      }
      await caricaStato();
      onRefreshAlerts();
    } catch (error) {
      console.error('Error generating rapportini:', error);
      setErrore('Errore durante la generazione.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (r: RapportinoStato) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setCopiedToken(r.token);
      setTimeout(() => setCopiedToken((t) => (t === r.token ? null : t)), 1800);
    } catch (error) {
      console.error('Error copying link:', error);
    }
  };

  const handleRimuovi = async (r: RapportinoStato) => {
    setRimuovendo(r.staff_id);
    setErrore(null);
    try {
      const res = await fetch(
        `/api/mappa/piani/operatore?pianoId=${piano.id}&staffId=${encodeURIComponent(r.staff_id)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok || data?.error) {
        setErrore(data?.error ?? 'Errore durante la rimozione.');
        return;
      }
      onChanged();
      onRefreshAlerts();
      if (data.pianoDeleted) {
        onClose();
        return;
      }
      await caricaStato();
    } catch {
      setErrore('Errore durante la rimozione.');
    } finally {
      setRimuovendo(null);
      setRimuoviStaffId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--brand-border)] px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--brand-text-main)]">
              Rapportini · {piano.territorio}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
              Piano del {dataLabel} · {piano.operatori.length} operatori
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">
                Modello rapportino
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
              >
                {templates.length === 0 && <option value="">Nessun modello</option>}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {t.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleGenera}
              disabled={generating || !templateId}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] hover:opacity-90 disabled:opacity-50"
            >
              {generating ? 'Genero...' : stato.length > 0 ? 'Rigenera' : 'Genera'}
            </button>
          </div>

          {errore && (
            <div className="mb-3 rounded-lg border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-3 py-2 text-xs text-[var(--brand-primary)]">
              {errore}
            </div>
          )}

          {loadingStato ? (
            <div className="py-8 text-center text-sm text-[var(--brand-text-muted)]">
              Caricamento stato...
            </div>
          ) : stato.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--brand-border)] px-4 py-8 text-center text-sm text-[var(--brand-text-muted)]">
              Nessun rapportino generato. Seleziona un modello e premi “Genera”.
            </div>
          ) : (
            <ul className="space-y-2">
              {stato.map((r) => {
                const badge = statoBadge(r.statoCalcolato);
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--brand-text-main)]">
                          {r.staff_name ?? 'Operatore'}
                        </span>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
                        {r.nVoci} {r.nVoci === 1 ? 'intervento' : 'interventi'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => handleCopy(r)}
                        className="rounded border border-[var(--brand-border)] px-2.5 py-1 text-xs font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
                      >
                        {copiedToken === r.token ? 'Copiato!' : 'Copia link'}
                      </button>
                      <a
                        href={`/api/mappa/rapportini/export?rapportinoId=${r.id}`}
                        className="rounded border border-[var(--brand-border)] px-2.5 py-1 text-xs font-medium text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]"
                      >
                        Esporta Excel
                      </a>
                      <a
                        href={whatsappHref(r.staff_name, dataLabel, r.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-[var(--success)]/40 bg-[var(--success-soft)] px-2.5 py-1 text-xs font-medium text-[var(--success)] hover:opacity-80"
                      >
                        WhatsApp
                      </a>
                      {rimuoviStaffId === r.staff_id ? (
                        <span className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleRimuovi(r)}
                            disabled={rimuovendo === r.staff_id}
                            className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs font-semibold text-[var(--danger)] hover:opacity-80 disabled:opacity-50"
                          >
                            {rimuovendo === r.staff_id ? '...' : 'Rimuovi?'}
                          </button>
                          <button
                            onClick={() => setRimuoviStaffId(null)}
                            className="rounded border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setRimuoviStaffId(r.staff_id)}
                          className="rounded border border-[var(--brand-border)] px-2.5 py-1 text-xs font-medium text-[var(--brand-text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          Rimuovi
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
