import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { COLONNE_TEMPLATE_OPZIONALI, selectDegradante } from '@/lib/rapportini/colonneOpzionali';
import AzioniOperatoriClient from './AzioniOperatoriClient';

export const dynamic = 'force-dynamic';

const COLONNE = 'id, nome, committente, campi, info_campi, titolo_campi, foto_id_priority, tipo, active, solo_manuale, task_via, task_via_ibrido, gruppo_committente, gruppi_attivita, updated_at';

export default async function AzioniOperatoriPage() {
  const [templates, { data: tassonomia }] = await Promise.all([
    // riservato_pi / lista_campi con fallback: possono mancare finché la migration non è applicata.
    selectDegradante(COLONNE, COLONNE_TEMPLATE_OPZIONALI, (colonne) =>
      supabaseAdmin.from('rapportino_template').select(colonne).order('nome'),
    ),
    // Gruppi per l'albero Committente → Gruppo attività (range esplicito: oltre il cap 1000 PostgREST).
    supabaseAdmin
      .from('attivita_tassonomia')
      .select('committente, gruppo, attivo, descrizione')
      .range(0, 4999),
  ]);

  return <AzioniOperatoriClient initial={(templates.data ?? []) as never} tassonomia={tassonomia ?? []} />;
}
