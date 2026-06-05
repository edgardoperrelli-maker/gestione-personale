// components/modules/rapportini/CondividiPdfButton.tsx
'use client';

import { useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { costruisciDatiPdf, type VoceRiepilogo } from '@/utils/rapportini/datiRiepilogoPdf';
import { generaRiepilogoPdfBlob, nomeFilePdf } from '@/utils/rapportini/rapportinoPdf';
import { condividiOScarica } from '@/utils/rapportini/condividiFile';

type Stato = 'idle' | 'lavoro' | 'fatto' | 'errore';

export function CondividiPdfButton({
  staffName,
  dataLabel,
  dataIso,
  voci,
  campi,
}: {
  staffName: string;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
}) {
  const [stato, setStato] = useState<Stato>('idle');

  const onClick = async () => {
    if (stato === 'lavoro') return;
    setStato('lavoro');
    try {
      const dati = costruisciDatiPdf({ staffName, dataLabel, voci, campi });
      const blob = await generaRiepilogoPdfBlob(dati);
      const esito = await condividiOScarica({
        blob,
        filename: nomeFilePdf(staffName, dataIso),
        title: `Rapportino ${staffName} ${dataLabel}`,
        text: `Rapportino ${staffName} — ${dataLabel}`,
      });
      setStato(esito === 'cancelled' ? 'idle' : 'fatto');
    } catch {
      setStato('errore');
    }
  };

  const label =
    stato === 'lavoro' ? 'Generazione…'
      : stato === 'fatto' ? 'PDF condiviso ✓'
      : stato === 'errore' ? 'Errore — tocca per riprovare'
      : '📄 Condividi PDF su WhatsApp';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={stato === 'lavoro'}
      className="mt-2 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-base font-semibold text-[var(--brand-text-main)] transition enabled:active:border-[var(--brand-primary)] disabled:opacity-60"
    >
      {label}
    </button>
  );
}
