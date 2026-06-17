'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RegolaMappa } from '@/lib/agente/decisione';
import { GIORNI_LABEL, formattaContatto, type AgenteConfigRow, type AgenteRunRow, type AgenteFileColonneRow } from '@/lib/agente/uiTypes';
import { StoricoCard } from './StoricoCard';
import { ColonneCard } from './ColonneCard';

export type AgenteClientProps = {
  config: AgenteConfigRow;
  runs: AgenteRunRow[];
  files: AgenteFileColonneRow[];
  stato: { online: boolean; allerta: string | null };
  minutiDaContatto: number | null;
};

/** Forma modificabile della config nel form (sottoinsieme salvabile). */
export type ConfigForm = {
  enabled: boolean;
  giorni: number[];
  ora: string;
  dry_run: boolean;
  finestra_giorni: number;
  mappatura: RegolaMappa[];
  esito_positivo: string;
  esito_negativo: string;
};

const cardStyle = {
  borderColor: 'var(--brand-border)',
  backgroundColor: 'var(--brand-surface)',
} as const;

export default function AgenteClient({ config, runs, files, stato, minutiDaContatto }: AgenteClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<ConfigForm>({
    enabled: config.enabled,
    giorni: [...config.giorni].sort((a, b) => a - b),
    ora: config.ora,
    dry_run: config.dry_run,
    finestra_giorni: config.finestra_giorni,
    mappatura: config.mappatura,
    esito_positivo: config.esito_positivo,
    esito_negativo: config.esito_negativo,
  });
  const [salvando, setSalvando] = useState(false);
  const [esitoSalva, setEsitoSalva] = useState<{ ok: boolean; msg: string } | null>(null);
  const [arming, setArming] = useState(false);
  const [armMsg, setArmMsg] = useState<string | null>(null);

  async function eseguiOra() {
    setArming(true); setArmMsg(null);
    try {
      const res = await fetch('/api/admin/agente/esegui-ora', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      setArmMsg(res.ok ? 'Giro armato: parte al prossimo contatto dell\'agente (entro l\'ora).' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setArmMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setArming(false);
    }
  }

  function patch(p: Partial<ConfigForm>) {
    setForm((prev) => ({ ...prev, ...p }));
    setEsitoSalva(null);
  }

  function toggleGiorno(iso: number) {
    setForm((prev) => {
      const has = prev.giorni.includes(iso);
      const giorni = (has ? prev.giorni.filter((g) => g !== iso) : [...prev.giorni, iso]).sort((a, b) => a - b);
      return { ...prev, giorni };
    });
    setEsitoSalva(null);
  }

  async function salva(override?: Partial<ConfigForm>) {
    setSalvando(true);
    setEsitoSalva(null);
    try {
      const payload = override ? { ...form, ...override } : form;
      const res = await fetch('/api/admin/agente/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as { errore?: string; error?: string };
      if (res.ok) {
        setEsitoSalva({ ok: true, msg: 'Impostazioni salvate.' });
        router.refresh();
      } else {
        setEsitoSalva({ ok: false, msg: j.errore ?? j.error ?? `Errore ${res.status}.` });
      }
    } catch {
      setEsitoSalva({ ok: false, msg: 'Errore di rete nel salvataggio.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Agente
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Pianificazione e feedback del sync limitazioni massive.
        </p>
      </header>

      {/* Card Pianificazione */}
      <section className="rounded-2xl border p-5 space-y-4" style={cardStyle}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Pianificazione</h2>
          <button
            type="button"
            onClick={() => patch({ enabled: !form.enabled })}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold transition"
            style={{
              backgroundColor: form.enabled ? 'var(--success-soft)' : 'var(--brand-surface-muted)',
              color: form.enabled ? 'var(--success)' : 'var(--brand-text-muted)',
            }}
            aria-pressed={form.enabled}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: form.enabled ? '#22c55e' : '#9ca3af' }} />
            {form.enabled ? 'Acceso' : 'Spento'}
          </button>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Giorni</label>
          <div className="flex flex-wrap gap-1.5">
            {GIORNI_LABEL.map((lbl, i) => {
              const iso = i + 1; // 1=Lun..7=Dom
              const on = form.giorni.includes(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleGiorno(iso)}
                  className="rounded-xl border px-3 py-1.5 text-sm font-medium transition"
                  style={{
                    borderColor: on ? 'var(--brand-primary)' : 'var(--brand-border)',
                    backgroundColor: on ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                    color: 'var(--brand-text-main)',
                  }}
                  aria-pressed={on}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>
              Ora
              <input
                type="time"
                value={form.ora}
                onChange={(e) => patch({ ora: e.target.value })}
                className="mt-1 block rounded-xl border px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
              />
            </label>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>
              Finestra (giorni)
              <input
                type="number"
                min={1}
                max={60}
                value={form.finestra_giorni}
                onChange={(e) => patch({ finestra_giorni: Number(e.target.value) })}
                className="mt-1 block w-24 rounded-xl border px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
              />
            </label>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Modalità</label>
            <button
              type="button"
              onClick={() => { const nuovo = !form.dry_run; patch({ dry_run: nuovo }); void salva({ dry_run: nuovo }); }}
              disabled={salvando}
              className="rounded-xl border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60"
              style={{
                borderColor: 'var(--brand-border)',
                backgroundColor: form.dry_run ? 'var(--warning-soft)' : 'var(--brand-surface)',
                color: 'var(--brand-text-main)',
              }}
              aria-pressed={form.dry_run}
              title="Prova non scrive sui file; Reale scrive. Si salva subito."
            >
              {form.dry_run ? 'Prova (dry-run)' : 'Reale'}
            </button>
          </div>
        </div>
      </section>

      {/* Card Stato */}
      <section className="rounded-2xl border p-5 space-y-3" style={cardStyle}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Stato</h2>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stato.online ? '#22c55e' : '#9ca3af' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
            {stato.online ? 'Online' : 'Offline'}
          </span>
          <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            · ultimo contatto {formattaContatto(minutiDaContatto)}
          </span>
        </div>
        {stato.allerta && (
          <div
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
            role="alert"
          >
            ⚠ {stato.allerta}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={eseguiOra}
            disabled={arming}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {arming ? 'Armo…' : 'Esegui ora'}
          </button>
          {armMsg && <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{armMsg}</span>}
        </div>
      </section>

      {/* Card Storico (D6) */}
      <StoricoCard runs={runs} />

      {/* Card Colonne & scrittura (D6) — l'editor mappa condivide form + salva */}
      <ColonneCard
        files={files}
        mappatura={form.mappatura}
        esitoPositivo={form.esito_positivo}
        esitoNegativo={form.esito_negativo}
        onChange={patch}
      />

      {/* Barra di salvataggio condivisa (Pianificazione + Colonne) */}
      <div className="sticky bottom-3 flex items-center justify-end gap-3">
        {esitoSalva && (
          <span
            className="rounded-full px-3 py-1 text-sm font-medium"
            style={{
              backgroundColor: esitoSalva.ok ? 'var(--success-soft)' : 'var(--danger-soft)',
              color: esitoSalva.ok ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {esitoSalva.msg}
          </span>
        )}
        <button
          type="button"
          onClick={() => void salva()}
          disabled={salvando}
          className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:border-[var(--brand-primary)] disabled:opacity-60"
          style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}
        >
          {salvando ? 'Salvo…' : 'Salva impostazioni'}
        </button>
      </div>
    </main>
  );
}
