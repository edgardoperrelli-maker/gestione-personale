'use client';
import { useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

type Template = {
  id: string;
  nome: string;
  campi: TemplateCampo[];
  is_default: boolean;
  active: boolean;
};

type Props = { initial: Template[] };

type Feedback = { type: 'success' | 'error'; message: string };

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function newCampo(n: number): TemplateCampo {
  return { chiave: `campo_${n}`, etichetta: '', tipo: 'testo', ordine: n };
}

const TIPO_LABELS: Record<TemplateCampo['tipo'], string> = {
  crocetta: 'Crocetta',
  testo: 'Testo libero',
  select: 'Selezione',
  numero: 'Numero',
};

export default function TemplateRapportiniClient({ initial }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.length > 0 ? initial[0].id : null,
  );
  const [isNew, setIsNew] = useState(false);
  const [nome, setNome] = useState('');
  const [campi, setCampi] = useState<TemplateCampo[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function showFeedback(type: 'success' | 'error', message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  }

  function loadTemplate(tpl: Template) {
    setIsNew(false);
    setSelectedId(tpl.id);
    setNome(tpl.nome);
    setCampi(tpl.campi.map((c) => ({ ...c, opzioni: c.opzioni ?? [] })));
  }

  function startNew() {
    setIsNew(true);
    setSelectedId(null);
    setNome('');
    setCampi([newCampo(1)]);
  }

  async function reloadTemplates() {
    const res = await fetch('/api/admin/rapportino-template');
    if (res.ok) {
      const data: Template[] = await res.json();
      setTemplates(data);
    }
  }

  // ── Campo operations ───────────────────────────────────────────────────────

  function updateCampo(idx: number, patch: Partial<TemplateCampo>) {
    setCampi((prev) => {
      const next = [...prev];
      const updated = { ...next[idx], ...patch };
      if (patch.etichetta !== undefined) {
        const slug = slugify(patch.etichetta);
        updated.chiave = slug || `campo_${idx + 1}`;
      }
      next[idx] = updated;
      return next;
    });
  }

  function addCampo() {
    setCampi((prev) => [...prev, newCampo(prev.length + 1)]);
  }

  function removeCampo(idx: number) {
    setCampi((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, ordine: i + 1 })));
  }

  function moveCampo(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= campi.length) return;
    setCampi((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((c, i) => ({ ...c, ordine: i + 1 }));
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!nome.trim()) { showFeedback('error', 'Il nome del template è obbligatorio'); return; }
    if (campi.length === 0) { showFeedback('error', 'Aggiungi almeno un campo'); return; }
    for (const c of campi) {
      if (!c.etichetta.trim()) { showFeedback('error', 'Tutti i campi devono avere un\'etichetta'); return; }
    }

    setSaving(true);
    try {
      const payload = {
        nome: nome.trim(),
        campi: campi.map((c, i) => ({
          ...c,
          ordine: i + 1,
          opzioni: c.tipo === 'select' ? (c.opzioni ?? []).map((s) => s.trim()).filter(Boolean) : undefined,
        })),
        active: true,
        ...(isNew ? {} : { id: selectedId }),
      };

      const res = await fetch('/api/admin/rapportino-template', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante il salvataggio'); return; }

      showFeedback('success', isNew ? 'Template creato' : 'Template aggiornato');
      await reloadTemplates();

      if (isNew && json.id) {
        setIsNew(false);
        setSelectedId(json.id);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!selectedId) return;
    const tpl = templates.find((t) => t.id === selectedId);
    if (!confirm(`Confermi di eliminare il template "${tpl?.nome}"?`)) return;

    const res = await fetch(`/api/admin/rapportino-template?id=${selectedId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante l\'eliminazione'); return; }

    showFeedback('success', 'Template eliminato');
    await reloadTemplates();
    setSelectedId(null);
    setIsNew(false);
    setNome('');
    setCampi([]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedTpl = templates.find((t) => t.id === selectedId);
  const isEditing = isNew || selectedTpl != null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ─── COLONNA SINISTRA: Lista template ───────────────────────────────── */}
      <div className="flex max-w-sm flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--brand-text-main)]">Template rapportini</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90"
          >
            + Nuovo
          </button>
        </div>

        {templates.length === 0 && !isNew ? (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
            Nessun template. Creane uno.
          </div>
        ) : (
          <div className="space-y-2">
            {isNew && (
              <div className="cursor-pointer rounded-2xl border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] p-4">
                <p className="font-semibold text-[var(--brand-primary)]">Nuovo template…</p>
              </div>
            )}
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => loadTemplate(tpl)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  selectedId === tpl.id && !isNew
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]'
                    : 'border-[var(--brand-border)] bg-[var(--brand-surface)] hover:border-[var(--brand-primary)]'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-semibold text-[var(--brand-text-main)]">{tpl.nome}</span>
                  {tpl.is_default && (
                    <span className="rounded-full bg-[var(--brand-primary)] px-2 py-0.5 text-xs font-bold text-[oklch(0.16_0.06_245)]">
                      default
                    </span>
                  )}
                  {!tpl.active && (
                    <span className="rounded-full border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                      inattivo
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--brand-text-muted)]">
                  {tpl.campi?.length ?? 0} campi
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── COLONNA DESTRA: Editor ──────────────────────────────────────────── */}
      <div className="flex-1 space-y-4">
        {!isEditing ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
            <div className="text-center">
              <div className="mb-3 text-4xl">📋</div>
              <p className="text-sm text-[var(--brand-text-muted)]">
                Seleziona un template per modificarlo o creane uno nuovo
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Nome template ─────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-4 font-semibold text-[var(--brand-text-main)]">Nome template</h3>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                placeholder="es. Rapportino standard"
              />
            </div>

            {/* ── Campi ─────────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-4 font-semibold text-[var(--brand-text-main)]">Campi</h3>

              {campi.length === 0 && (
                <p className="mb-4 text-sm text-[var(--brand-text-muted)]">Nessun campo. Aggiungine uno.</p>
              )}

              <div className="space-y-3">
                {campi.map((campo, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-4"
                  >
                    {/* Row 1: etichetta + tipo */}
                    <div className="mb-3 flex gap-3">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Etichetta
                        </label>
                        <input
                          type="text"
                          value={campo.etichetta}
                          onChange={(e) => updateCampo(idx, { etichetta: e.target.value })}
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                          placeholder="es. Firma tecnico"
                        />
                        {campo.chiave && (
                          <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">chiave: {campo.chiave}</p>
                        )}
                      </div>
                      <div className="w-40">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Tipo
                        </label>
                        <select
                          value={campo.tipo}
                          onChange={(e) => updateCampo(idx, { tipo: e.target.value as TemplateCampo['tipo'] })}
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                        >
                          {(Object.keys(TIPO_LABELS) as TemplateCampo['tipo'][]).map((t) => (
                            <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Row 2: opzioni (solo se tipo=select) */}
                    {campo.tipo === 'select' && (
                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Opzioni (una per riga)
                        </label>
                        <textarea
                          rows={3}
                          value={(campo.opzioni ?? []).join('\n')}
                          onChange={(e) =>
                            updateCampo(idx, { opzioni: e.target.value.split('\n') })
                          }
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                          placeholder={'SI\nNO'}
                        />
                      </div>
                    )}

                    {/* Row 3: azioni */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveCampo(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30"
                        title="Sposta su"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCampo(idx, 1)}
                        disabled={idx === campi.length - 1}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30"
                        title="Sposta giù"
                      >
                        ▼
                      </button>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => removeCampo(idx)}
                        className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addCampo}
                className="mt-4 rounded-lg border border-dashed border-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]"
              >
                ＋ Aggiungi campo
              </button>
            </div>

            {/* ── Azioni ────────────────────────────────────────────────────── */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvataggio…' : isNew ? 'Crea template' : 'Salva modifiche'}
              </button>
              {!isNew && selectedTpl && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-lg border border-[var(--danger)] px-4 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                >
                  Elimina template
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── FEEDBACK TOAST ──────────────────────────────────────────────────── */}
      {feedback && (
        <div
          className={`fixed bottom-4 right-4 rounded-lg px-4 py-3 text-sm font-semibold transition ${
            feedback.type === 'success'
              ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]'
              : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]'
          }`}
        >
          {feedback.type === 'success' ? '✓ ' : '✗ '}{feedback.message}
        </div>
      )}
    </div>
  );
}

