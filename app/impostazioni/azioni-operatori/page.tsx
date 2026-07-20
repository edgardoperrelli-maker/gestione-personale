import { supabaseAdmin } from '@/lib/supabaseAdmin';
import AzioniOperatoriClient from './AzioniOperatoriClient';

export const dynamic = 'force-dynamic';

export default async function AzioniOperatoriPage() {
  const [{ data: templates }, { data: tassonomia }] = await Promise.all([
    supabaseAdmin
      .from('rapportino_template')
      .select('id, nome, committente, campi, info_campi, titolo_campi, foto_id_priority, tipo, is_default, active, solo_manuale, task_via, task_via_ibrido, gruppo_committente, gruppi_attivita, updated_at')
      .order('is_default', { ascending: false })
      .order('nome'),
    // Gruppi per l'albero Committente → Gruppo attività (range esplicito: oltre il cap 1000 PostgREST).
    supabaseAdmin
      .from('attivita_tassonomia')
      .select('committente, gruppo, attivo')
      .range(0, 4999),
  ]);

  return <AzioniOperatoriClient initial={templates ?? []} tassonomia={tassonomia ?? []} />;
}
