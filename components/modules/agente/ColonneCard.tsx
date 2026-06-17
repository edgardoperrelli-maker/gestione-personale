'use client';

import type { RegolaMappa } from '@/lib/agente/decisione';
import type { AgenteFileColonneRow } from '@/lib/agente/uiTypes';
import { columnsDaFile, colonneRilevate, uniscoMappaturaColonna } from '@/lib/agente/colonneView';
import { formattaIstante } from '@/lib/agente/uiTypes';

const cardStyle = { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' } as const;

const ETICHETTA_CAMPO: Record<string, string> = {
  esecutore: 'Esecutore',
  data: 'Data',
  esito: 'Esito',
  sigillo: 'Sigillo',
  matricola: 'Matricola',
  via: 'Via',
  pdr: 'PDR',
  nominativo: 'Nominativo',
  comune: 'Comune',
  marcatore: 'Marcatore (solo extra)',
};

export function ColonneCard({
  files,
  mappatura,
  esitoPositivo,
  esitoNegativo,
  onChange,
}: {
  files: AgenteFileColonneRow[];
  mappatura: RegolaMappa[];
  esitoPositivo: string;
  esitoNegativo: string;
  onChange: (p: { mappatura?: RegolaMappa[]; esito_positivo?: string; esito_negativo?: string }) => void;
}) {
  const opzioni = colonneRilevate(files);

  function setColonna(campo: string, colonna: string) {
    onChange({ mappatura: uniscoMappaturaColonna(mappatura, campo, { colonna }) });
  }
  function setAbilitato(campo: string, abilitato: boolean) {
    onChange({ mappatura: uniscoMappaturaColonna(mappatura, campo, { abilitato }) });
  }

  return (
    <section className="rounded-2xl border p-5 space-y-5" style={cardStyle}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Colonne & scrittura</h2>

      {/* Colonne rilevate per file */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Colonne rilevate</h3>
        {files.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna scansione ricevuta dall&apos;agente.</p>
        )}
        {files.map((f) => (
          <div key={f.file} className="rounded-xl border p-3" style={{ borderColor: 'var(--brand-border)' }}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>{f.file}</span>
              {f.is_master && (
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}>master</span>
              )}
              <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>· {formattaIstante(f.rilevato_il)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {columnsDaFile(f).map((c) => (
                <span
                  key={`${f.file}:${c.nome}`}
                  className="rounded-lg border px-2 py-0.5 text-xs"
                  style={
                    c.stato === 'nuova'
                      ? { borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }
                      : c.stato === 'sparita'
                        ? { borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)', textDecoration: 'line-through' }
                        : { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-muted)' }
                  }
                  title={c.stato === 'nuova' ? 'Colonna nuova' : c.stato === 'sparita' ? 'Colonna sparita' : undefined}
                >
                  {c.nome}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Editor mappa */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Mappa di scrittura</h3>
        <div className="space-y-2">
          {mappatura.map((r) => (
            <div key={r.campo} className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2"
              style={{ borderColor: 'var(--brand-border)' }}>
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--brand-text-main)' }}>
                <input type="checkbox" checked={r.abilitato} onChange={(e) => setAbilitato(r.campo, e.target.checked)} />
                <span className="w-40 font-medium">{ETICHETTA_CAMPO[r.campo] ?? r.campo}</span>
              </label>
              <select
                value={r.colonna}
                onChange={(e) => setColonna(r.campo, e.target.value)}
                disabled={r.auto === true}
                className="min-w-[12rem] rounded-xl border px-3 py-1.5 text-sm outline-none disabled:opacity-60"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
              >
                <option value="">{r.auto ? '(auto)' : '— scegli colonna —'}</option>
                {!opzioni.includes(r.colonna) && r.colonna !== '' && (
                  <option value={r.colonna}>{r.colonna} (non rilevata)</option>
                )}
                {opzioni.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {r.auto && (
                <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>colonna libera auto-rilevata</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Testi esito */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Testo esito positivo</label>
          <input
            type="text"
            value={esitoPositivo}
            onChange={(e) => onChange({ esito_positivo: e.target.value })}
            className="rounded-xl border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Testo esito negativo</label>
          <input
            type="text"
            value={esitoNegativo}
            onChange={(e) => onChange({ esito_negativo: e.target.value })}
            className="rounded-xl border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
          />
        </div>
      </div>
    </section>
  );
}
