/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
// components/modules/rapportini/CondividiPdfButton.tsx
'use client';

import { useState } from 'react';
import { AlertTriangle, Check, FileText } from 'lucide-react';
import Button from '@/components/Button';
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
  taskVia,
  taskViaIbrido,
  committenti,
}: {
  staffName: string;
  dataLabel: string;
  dataIso: string;
  voci: VoceRiepilogo[];
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  /** Template task-via (BONIFICHE EXTRA): il PDF mostra gli ordini "+", non le vie contenitore. */
  taskVia?: boolean;
  /** Template ibrido: il PDF tiene le voci classiche e scarta solo i contenitori BONIFICHE EXTRA. */
  taskViaIbrido?: boolean;
  /** Committenti della giornata, in etichetta leggibile: finiscono nell'intestazione del PDF. */
  committenti?: string[];
}) {
  const [stato, setStato] = useState<Stato>('idle');

  const onClick = async () => {
    if (stato === 'lavoro') return;
    setStato('lavoro');
    try {
      const dati = costruisciDatiPdf({ staffName, dataLabel, voci, campi, infoCampi, taskVia, taskViaIbrido, committenti });
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

  // Le icone stanno nel JSX (lucide a currentColor), non nella stringa: le emoji
  // cambiano col font di sistema e in monocromia spariscono (DESIGN.md §7quater).
  const contenuto =
    stato === 'lavoro' ? 'Generazione…'
      : stato === 'fatto' ? <><Check size={16} strokeWidth={2} aria-hidden />PDF condiviso</>
      : stato === 'errore' ? <><AlertTriangle size={16} strokeWidth={2} aria-hidden />Errore — tocca per riprovare</>
      : <><FileText size={16} strokeWidth={2} aria-hidden />Condividi PDF su WhatsApp</>;

  return (
    <Button
      variant="primary"
      size="touch"
      className="w-full"
      onClick={onClick}
      loading={stato === 'lavoro'}
      disabled={stato === 'lavoro'}
    >
      {contenuto}
    </Button>
  );
}