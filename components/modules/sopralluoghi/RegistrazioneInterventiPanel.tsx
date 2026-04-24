'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { Card, CardContent, CardHeader } from '@/components/Card';
import Input from '@/components/Input';

type PDFGenerato = {
  id: number;
  microarea: string;
  territorio_id: string | null;
  num_civici: number;
  data_generazione: string;
  stato_registrazione: string;
  pdf_url: string | null;
  excel_url: string | null;
};

type CivicoRow = {
  id: number;
  odonimo: string;
  civico: string;
  microarea: string;
};

type ExistingSopralluogo = {
  civico_id: number;
  stato: 'da_visitare' | 'visitato' | 'programmato';
  idoneo_risanamento: boolean | null;
  punti_gas: number | null;
  note: string | null;
};

type SopralluogoDraft = {
  civico_id: number;
  visitato: boolean;
  idoneo: boolean;
  puntiGas: string;
  note: string;
};

type LoadRegistrazioneResponse = {
  civici: CivicoRow[];
  sopralluoghi: ExistingSopralluogo[];
};

function parsePuntiGasValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

type Props = {
  canManage: boolean;
  territorioSelezionato: string;
  territoryName?: string;
  microareaSelezionata: string | null;
  microareaOptions: string[];
  pdfGenerati: PDFGenerato[];
  onMicroareaChange: (value: string | null) => void;
};

export default function RegistrazioneInterventiPanel({
  canManage,
  territorioSelezionato,
  territoryName,
  microareaSelezionata,
  microareaOptions,
  pdfGenerati,
  onMicroareaChange,
}: Props) {
  const router = useRouter();
  const [civici, setCivici] = useState<CivicoRow[]>([]);
  const [drafts, setDrafts] = useState<Map<number, SopralluogoDraft>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!territorioSelezionato || !microareaSelezionata) {
      setCivici([]);
      setDrafts(new Map());
      setMessage(null);
      return;
    }

    let active = true;

    const loadCivici = async () => {
      setLoading(true);
      setMessage(null);

      try {
        const searchParams = new URLSearchParams({
          territorio_id: territorioSelezionato,
          microarea: microareaSelezionata,
        });
        const response = await fetch(`/api/sopralluoghi/registrazione?${searchParams.toString()}`, {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = (await response.json()) as LoadRegistrazioneResponse | { error?: string };

        if (!active) return;

        if (!response.ok || !('civici' in payload)) {
          setCivici([]);
          setDrafts(new Map());
          setMessage({
            type: 'error',
            text: 'error' in payload ? payload.error ?? 'Errore caricamento civici' : 'Errore caricamento civici',
          });
          return;
        }

        setCivici(payload.civici);

        if (payload.civici.length === 0) {
          setDrafts(new Map());
          return;
        }

        const nextDrafts = new Map<number, SopralluogoDraft>();
        payload.sopralluoghi.forEach((existing) => {
          const idoneo = Boolean(existing.idoneo_risanamento);
          nextDrafts.set(existing.civico_id, {
            civico_id: existing.civico_id,
            visitato: existing.stato === 'visitato',
            idoneo,
            puntiGas: idoneo && existing.punti_gas != null ? String(existing.punti_gas) : '',
            note: existing.note ?? '',
          });
        });

        setDrafts(nextDrafts);
      } catch (error: unknown) {
        if (!active) return;

        setCivici([]);
        setDrafts(new Map());
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Errore caricamento civici',
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadCivici();

    return () => {
      active = false;
    };
  }, [microareaSelezionata, territorioSelezionato]);

  const pdfDisponibili = useMemo(
    () => pdfGenerati.filter((pdf) => (
      pdf.territorio_id === territorioSelezionato
      && (!microareaSelezionata || pdf.microarea === microareaSelezionata)
    )),
    [microareaSelezionata, pdfGenerati, territorioSelezionato],
  );

  const handleToggle = (civicoId: number, field: 'visitato' | 'idoneo') => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(civicoId) ?? {
        civico_id: civicoId,
        visitato: false,
        idoneo: false,
        puntiGas: '',
        note: '',
      };

      const updated: SopralluogoDraft = {
        ...current,
        [field]: !current[field],
      };

      if (field === 'visitato' && !updated.visitato) {
        updated.idoneo = false;
        updated.puntiGas = '';
      }

      if (field === 'idoneo' && !updated.idoneo) {
        updated.puntiGas = '';
      }

      next.set(civicoId, updated);
      return next;
    });
  };

  const handleNoteChange = (civicoId: number, note: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(civicoId) ?? {
        civico_id: civicoId,
        visitato: false,
        idoneo: false,
        puntiGas: '',
        note: '',
      };

      next.set(civicoId, { ...current, note });
      return next;
    });
  };

  const handlePuntiGasChange = (civicoId: number, puntiGas: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const current = next.get(civicoId) ?? {
        civico_id: civicoId,
        visitato: false,
        idoneo: false,
        puntiGas: '',
        note: '',
      };

      next.set(civicoId, { ...current, puntiGas });
      return next;
    });
  };

  const handleSave = async () => {
    if (!territorioSelezionato || !microareaSelezionata) {
      setMessage({ type: 'error', text: 'Seleziona territorio e microarea prima di salvare.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/sopralluoghi/registrazione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          territorio_id: territorioSelezionato,
          microarea: microareaSelezionata,
          drafts: Array.from(drafts.values()),
        }),
      });

      const data = (await response.json()) as { error?: string; salvati?: number; rimossi?: number; punti_gas_totali?: number };
      if (!response.ok) {
        throw new Error(data.error ?? 'Errore salvataggio registrazione');
      }

      setMessage({
        type: 'success',
        text: `Registrazione aggiornata: ${data.salvati ?? 0} interventi salvati, ${data.rimossi ?? 0} movimenti rimossi, ${data.punti_gas_totali ?? 0} PG censiti.`,
      });
      router.refresh();
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const visitatiCount = Array.from(drafts.values()).filter((draft) => draft.visitato).length;
  const idoneiCount = Array.from(drafts.values()).filter((draft) => draft.visitato && draft.idoneo).length;
  const puntiGasTotali = Array.from(drafts.values()).reduce(
    (sum, draft) => sum + (draft.visitato && draft.idoneo ? parsePuntiGasValue(draft.puntiGas) : 0),
    0,
  );

  if (!canManage) {
    return (
      <Card>
        <CardContent className="text-sm text-[var(--brand-text-muted)]">
          La registrazione degli interventi e disponibile solo per utenze admin.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-base font-semibold text-[var(--brand-text-main)]">
              Registrazione Interventi
            </div>
            <div className="mt-1 text-sm text-[var(--brand-text-muted)]">
              Registrazione manuale dei sopralluoghi sul territorio selezionato.
            </div>
          </div>

          <div className="w-full max-w-sm">
            <label className="mb-1 block text-sm font-medium text-[var(--brand-text-muted)]">
              Microarea
            </label>
            <select
              value={microareaSelezionata ?? ''}
              onChange={(event) => onMicroareaChange(event.target.value || null)}
              disabled={!territorioSelezionato || microareaOptions.length === 0}
              className="w-full rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] disabled:cursor-not-allowed disabled:bg-gray-50"
            >
              <option value="">Seleziona una microarea</option>
              {microareaOptions.map((microarea) => (
                <option key={microarea} value={microarea}>
                  {microarea}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!territorioSelezionato && (
            <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3 text-sm text-[var(--brand-text-muted)]">
              Seleziona un territorio per caricare le microaree importate.
            </div>
          )}

          {territorioSelezionato && (
            <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-primary-soft)]/40 px-4 py-3 text-sm text-[var(--brand-text-main)]">
              Territorio attivo: <span className="font-semibold">{territoryName ?? 'Territorio selezionato'}</span>
            </div>
          )}

          {pdfDisponibili.length > 0 && (
            <div className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm">
              <div className="font-medium text-[var(--brand-text-main)]">PDF disponibili per consultazione</div>
              <div className="mt-2 flex flex-wrap gap-3">
                {pdfDisponibili.slice(0, 3).map((pdf) => (
                  <div key={pdf.id} className="flex flex-wrap items-center gap-3">
                    {pdf.pdf_url && (
                      <a
                        href={pdf.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--brand-primary)] hover:underline"
                      >
                        {pdf.microarea} PDF - {new Date(pdf.data_generazione).toLocaleDateString('it-IT')}
                      </a>
                    )}
                    {pdf.excel_url && (
                      <a
                        href={pdf.excel_url}
                        className="text-[var(--brand-primary)] hover:underline"
                      >
                        {pdf.microarea} Excel - {new Date(pdf.data_generazione).toLocaleDateString('it-IT')}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                message.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {microareaSelezionata && (
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3">
                <div className="text-xs text-[var(--brand-text-muted)]">Civici caricati</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--brand-text-main)]">{civici.length}</div>
              </div>
              <div className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3">
                <div className="text-xs text-[var(--brand-text-muted)]">Visitati</div>
                <div className="mt-1 text-2xl font-semibold text-blue-600">{visitatiCount}</div>
              </div>
              <div className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3">
                <div className="text-xs text-[var(--brand-text-muted)]">Idonei</div>
                <div className="mt-1 text-2xl font-semibold text-green-600">{idoneiCount}</div>
              </div>
              <div className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3">
                <div className="text-xs text-[var(--brand-text-muted)]">PG</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--brand-primary)]">{puntiGasTotali}</div>
              </div>
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-6 text-center text-sm text-[var(--brand-text-muted)]">
              Caricamento civici...
            </div>
          )}

          {!loading && civici.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[var(--brand-border)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="bg-[var(--brand-bg)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">#</th>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">Indirizzo</th>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">Civico</th>
                      <th className="px-4 py-3 text-center font-medium text-[var(--brand-text-muted)]">Visitato</th>
                      <th className="px-4 py-3 text-center font-medium text-[var(--brand-text-muted)]">Idoneo</th>
                      <th className="px-4 py-3 text-center font-medium text-[var(--brand-text-muted)]">PG</th>
                      <th className="px-4 py-3 text-left font-medium text-[var(--brand-text-muted)]">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--brand-border)] bg-white">
                    {civici.map((civico, index) => {
                      const draft = drafts.get(civico.id);

                      return (
                        <tr key={civico.id} className="hover:bg-[var(--brand-bg)]/40">
                          <td className="px-4 py-3 text-[var(--brand-text-muted)]">{index + 1}</td>
                          <td className="px-4 py-3 text-[var(--brand-text-main)]">{civico.odonimo}</td>
                          <td className="px-4 py-3 font-medium text-[var(--brand-text-main)]">{civico.civico}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={draft?.visitato ?? false}
                              onChange={() => handleToggle(civico.id, 'visitato')}
                              className="h-4 w-4 rounded border-gray-300 text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={draft?.idoneo ?? false}
                              onChange={() => handleToggle(civico.id, 'idoneo')}
                              disabled={!draft?.visitato}
                              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-30"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={draft?.puntiGas ?? ''}
                              onChange={(event) => handlePuntiGasChange(civico.id, event.target.value)}
                              placeholder="0"
                              disabled={!draft?.visitato || !draft?.idoneo}
                              className="mx-auto w-24 text-center disabled:bg-gray-50"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              value={draft?.note ?? ''}
                              onChange={(event) => handleNoteChange(civico.id, event.target.value)}
                              placeholder="Note..."
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-[var(--brand-text-muted)]">
                  {visitatiCount} visitati - {idoneiCount} idonei per risanamento - {puntiGasTotali} PG censiti
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSave}
                  disabled={saving || !microareaSelezionata || drafts.size === 0}
                >
                  {saving ? 'Salvataggio...' : 'Salva registrazione'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
