import { supabaseAdmin } from '@/lib/supabaseAdmin';
import TemplateRapportiniClient from './TemplateRapportiniClient';

export const dynamic = 'force-dynamic';

export default async function TemplateRapportiniPage() {
  const { data } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, nome, committente, campi, info_campi, titolo_campi, is_default, active, solo_manuale')
    .order('is_default', { ascending: false })
    .order('nome');

  return <TemplateRapportiniClient initial={data ?? []} />;
}
