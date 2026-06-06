// utils/rapportini/riepilogoConferma.ts
// Costruisce il testo del dialogo di conferma (window.confirm) mostrato al Salva quando
// la variazione tocca i rapportini. Affidabile e nativo: sostituisce la modale React.
import type { DiffRapportini } from './diffRapportini';

export function buildRiepilogoConferma(diff: DiffRapportini): { testo: string; haInviati: boolean } {
  const righe: string[] = [
    ...diff.spostamenti.map((s) => `• ${s.descr}: ${s.daNome} → ${s.aNome}`),
    ...diff.nuoviLink.map((n) => `• Nuovo rapportino + link per ${n.staffName}`),
    ...diff.svuotati.map((v) => `• ${v.staffName}: nessun intervento (rapportino vuoto, link conservato)`),
  ];
  const haInviati = diff.inviatiCoinvolti.length > 0;
  const avvisoInviati = haInviati
    ? `\n\n⚠️ ATTENZIONE: verranno RIAPERTI i rapportini già inviati di: ${diff.inviatiCoinvolti.map((i) => i.staffName).join(', ')}.`
    : '';
  const testo = `Aggiorno i rapportini con queste variazioni?\n\n${righe.join('\n')}${avvisoInviati}`;
  return { testo, haInviati };
}
