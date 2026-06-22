'use client';

import { useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { CampoFoto } from '@/components/modules/rapportini/CampoFoto';
import Button from '@/components/Button';

export function CaricaFotoRichiesta({
  richiestaId,
  slotFoto,
  onCaricato,
}: {
  richiestaId: string;
  slotFoto: TemplateCampo[];
  onCaricato: () => void;
}) {
  const [aperto, setAperto] = useState(false);
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
      <Button
        variant="secondary"
        size="sm"
        animated={false}
        className="w-full justify-between"
        onClick={() => setAperto((a) => !a)}
      >
        <span>📷 Carica foto (recupero){nSel ? ` · ${nSel} pronte` : ''}</span>
        <span>{aperto ? '▲' : '▼'}</span>
      </Button>
      {aperto && (
        <>
          <div className="grid grid-cols-2 gap-2">
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
          </div>
          {errore && <p className="text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
          <Button
            variant="primary"
            size="md"
            animated={false}
            disabled={inviando || nSel === 0}
            onClick={() => void carica()}
          >
            {inviando ? 'Caricamento…' : `Carica ${nSel || ''} foto`}
          </Button>
        </>
      )}
    </div>
  );
}
