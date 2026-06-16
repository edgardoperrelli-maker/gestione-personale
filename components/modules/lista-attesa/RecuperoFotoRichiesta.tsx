'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { CaricaFotoRichiesta } from './CaricaFotoRichiesta';

export function RecuperoFotoRichiesta({
  richiestaId,
  slotFoto,
}: {
  richiestaId: string;
  slotFoto: TemplateCampo[];
}) {
  const [foto, setFoto] = useState<Array<{ id: string; etichetta: string; url: string | null }>>([]);
  const caricaFoto = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/interventi-manuali/${richiestaId}/foto`, { cache: 'no-store' });
      const j = (r.ok ? await r.json() : { foto: [] }) as { foto?: Array<{ id: string; etichetta: string; url: string | null }> };
      setFoto(j.foto ?? []);
    } catch { /* opzionali */ }
  }, [richiestaId]);
  useEffect(() => { void caricaFoto(); }, [caricaFoto]);

  return (
    <div className="space-y-3">
      {foto.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {foto.map((f) => f.url && (
            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" title={f.etichetta} className="block h-16 w-16 overflow-hidden rounded-lg border border-[var(--brand-border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.etichetta} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      <CaricaFotoRichiesta richiestaId={richiestaId} slotFoto={slotFoto} onCaricato={caricaFoto} />
    </div>
  );
}
