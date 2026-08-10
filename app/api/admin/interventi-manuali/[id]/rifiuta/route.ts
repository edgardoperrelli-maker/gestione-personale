import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { maiuscolo } from '@/lib/testo/maiuscolo';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json()) as { motivo?: string };
  // DB pulito: la nota di rifiuto viene salvata in MAIUSCOLO.
  const motivo = maiuscolo((body.motivo ?? '').trim());

  // Leggi il voce_id (serve per aggiornare rapportino_voci dopo il lock).
  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // ── CHECK-AND-SET ATOMICO ────────────────────────────────────────────────────
  // Imposta stato='rifiutato' SOLO se la riga è ancora in_attesa.
  // Se due admin premono "rifiuta" (o uno approva e l'altro rifiuta) contemporaneamente,
  // solo il primo ottiene locked != null.
  // intervento_id: null esplicito — un rifiuto non deve MAI lasciare (o produrre) un intervento
  // canonico agganciato. Ridondante rispetto al guard 'in_attesa' (che già lo garantisce, dato che
  // solo 'approva'/corsia 'liberi' valorizzano intervento_id) e al CHECK a livello DB, ma lo rende
  // esplicito qui dove la decisione viene presa.
  const { data: locked } = await supabaseAdmin
    .from('interventi_manuali')
    .update({
      stato: 'rifiutato',
      motivo_rifiuto: motivo || null,
      deciso_da: user.id,
      deciso_at: new Date().toISOString(),
      intervento_id: null,
    })
    .eq('id', id)
    .eq('stato', 'in_attesa')
    .select('id')
    .maybeSingle();
  if (!locked) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });

  // ── Aggiorna la voce (se presente) ──────────────────────────────────────────
  // `intervento_id: null` come sulla richiesta, e per lo stesso motivo: il rifiuto dice che
  // quel lavoro non va registrato, quindi la voce non deve restare appesa a un intervento.
  // Mentre la richiesta era `in_attesa` la voce era agganciabile dall'auto-aggancio
  // (salvataggio, invio, recupero d'ufficio), e un collegamento fatto per ODL su una commessa
  // dove lo stesso ODL porta più misuratori è il collegamento all'intervento di un ALTRO
  // contatore. Se resta lì, quella voce continua a dire «ESEGUITO SI» nello Storico per conto
  // di un intervento che non è suo, e blocca la matricola come «già eseguita».
  if (richiesta.voce_id) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ approvazione_stato: 'rifiutato', intervento_id: null })
      .eq('id', richiesta.voce_id);
  }

  return NextResponse.json({ ok: true });
}
