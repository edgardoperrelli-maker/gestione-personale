import { supabaseAdmin } from '@/lib/supabaseAdmin';
import TemplateRapportiniClient from './TemplateRapportiniClient';

export const dynamic = 'force-dynamic';

export default async function TemplateRapportiniPage() {
  const { data } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, nome, committente, campi, info_campi, titolo_campi, foto_id_priority, tipo, is_default, active, solo_manuale, task_via, task_via_ibrido, updated_at')
    .order('is_default', { ascending: false })
    .order('nome');

  return <TemplateRapportiniClient initial={data ?? []} />;
}
