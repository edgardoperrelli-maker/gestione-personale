// components/modules/rapportini/CondividiPdfButton.tsx
'use client';

import { useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
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
  infoCampi,
}: {
  staffName: string;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
}) {
  const [stato, setStato] = useState<Stato>('idle');

  const onClick = async () => {
    if (stato === 'lavoro') return;
    setStato('lavoro');
    try {
      const dati = costruisciDatiPdf({ staffName, dataLabel, voci, campi, infoCampi });
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
      className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-base font-semibold text-[var(--on-primary)] shadow-sm transition enabled:hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}
