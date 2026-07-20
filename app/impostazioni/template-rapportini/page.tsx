import { redirect } from 'next/navigation';

// Modulo Template rapportini RIMOSSO: sostituito da Azioni operatori
// (Committente → Gruppo attività → azioni del flusso). Redirect di cortesia per i bookmark.
export default function TemplateRapportiniPage() {
  redirect('/impostazioni/azioni-operatori');
}
