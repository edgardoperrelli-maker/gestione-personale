'use client';

import { useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { CampoFoto } from '@/components/modules/rapportini/CampoFoto';

export function CaricaFotoRichiesta({
  richiestaId,
  slotFoto,
  onCaricato,
}: {
  richiestaId: string;
  slotFoto: TemplateCampo[];
  onCaricato: () => void;
}) {
  const [foto, setFoto] = useState<Record<string, File>>({});
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const nSel = Object.keys(foto).length;

  if (slotFoto.length === 0) {
    return <p className="text-xs text-[var(--brand-text-muted)]">Nessuno slot foto per questo committente.</p>;
  }

  const carica = async () => {
    if (nSel === 0) return;
    setInviando(true);
    setErrore(null);
    try {
      const fd = new FormData();
      for (const [chiave, f] of Object.entries(foto)) fd.append(`foto:${chiave}`, f, f.name);
      const res = await fetch(`/api/admin/interventi-manuali/${richiestaId}/foto`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFoto({});
      onCaricato();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore');
    } finally {
      setInviando(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Carica foto (recupero)</p>
      {slotFoto.map((c) => (
        <CampoFoto
          key={c.chiave}
          campo={c}
          file={foto[c.chiave] ?? null}
          disabilitato={inviando}
          onChange={(f) =>
            setFoto((prev) => {
              const next = { ...prev };
              if (f) next[c.chiave] = f;
              else delete next[c.chiave];
              return next;
            })
          }
        />
      ))}
      {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
      <button
        type="button"
        onClick={() => void carica()}
        disabled={inviando || nSel === 0}
        className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 font-semibold text-[oklch(0.16_0.06_245)] disabled:opacity-50"
      >
        {inviando ? 'Caricamento…' : `Carica ${nSel || ''} foto`}
      </button>
    </div>
  );
}
