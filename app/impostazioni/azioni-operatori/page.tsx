import { supabaseAdmin } from '@/lib/supabaseAdmin';
import AzioniOperatoriClient from './AzioniOperatoriClient';

export const dynamic = 'force-dynamic';

const COLONNE = 'id, nome, committente, campi, info_campi, titolo_campi, foto_id_priority, tipo, active, solo_manuale, task_via, task_via_ibrido, gruppo_committente, gruppi_attivita, updated_at';

export default async function AzioniOperatoriPage() {
  const [conFlag, { data: tassonomia }] = await Promise.all([
    // riservato_pi con fallback: la colonna può non esistere finché la migration non è applicata.
    supabaseAdmin.from('rapportino_template').select(`${COLONNE}, riservato_pi`).order('nome'),
    // Gruppi per l'albero Committente → Gruppo attività (range esplicito: oltre il cap 1000 PostgREST).
    supabaseAdmin
      .from('attivita_tassonomia')
      .select('committente, gruppo, attivo')
      .range(0, 4999),
  ]);
  const templates = conFlag.error
    ? await supabaseAdmin.from('rapportino_template').select(COLONNE).order('nome')
    : conFlag;

  return <AzioniOperatoriClient initial={(templates.data ?? []) as never} tassonomia={tassonomia ?? []} />;
}
