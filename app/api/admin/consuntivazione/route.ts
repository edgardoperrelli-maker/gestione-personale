import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { caricaFlussi, fallbackFlusso } from '@/lib/consuntivazione/flusso';
import { etichettaCommittente } from '@/lib/interventi/manuali/etichettaCommittente';

export const runtime = 'nodejs';

/**
 * GET /api/admin/consuntivazione — bootstrap del modulo.
 * Restituisce operatori (per la squadra), committenti e attività dalla tassonomia (per la
 * foglietta "Nuovo ordine"), i flussi attivi (per risolvere le AZIONI lato client) e i campi di
 * fallback. Le azioni renderizzate sono le stesse del motore operatore (Azioni operatori).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const [{ data: staffRows }, { data: terrRows }, tassonomia, flussi] = await Promise.all([
    supabaseAdmin.from('staff').select('id, display_name, active'),
    supabaseAdmin.from('territories').select('id, name'),
    caricaTassonomia(),
    caricaFlussi(supabaseAdmin),
  ]);

  const operatori = ((staffRows ?? []) as Array<{ id: string; display_name: string | null; active: boolean | null }>)
    .filter((s) => s.active !== false)
    .map((s) => ({ staffId: s.id, nome: (s.display_name ?? '').trim() || s.id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  // Attività attive raggruppate per committente (canonico), con il loro gruppo.
  const attive = tassonomia.filter((r) => r.attivo);
  const committentiSet = new Set(attive.map((r) => r.committente));
  const committenti = [...committentiSet]
    .sort((a, b) => a.localeCompare(b, 'it'))
    .map((c) => ({ value: c, label: etichettaCommittente(c) }));
  const attivita = attive
    .map((r) => ({ committente: r.committente, descrizione: r.descrizione, gruppo: r.gruppo }))
    .sort((a, b) => a.descrizione.localeCompare(b.descrizione, 'it'));

  // Flussi per la risoluzione delle azioni lato client (id, nome, collegamento, campi).
  const flussiClient = flussi.map((f) => ({
    id: f.id,
    nome: f.nome,
    campi: f.campi ?? [],
    solo_manuale: f.solo_manuale ?? false,
    gruppo_committente: f.gruppo_committente ?? null,
    gruppi_attivita: f.gruppi_attivita ?? null,
  }));
  const fb = fallbackFlusso(flussi);

  const territori = ((terrRows ?? []) as Array<{ id: string; name: string | null }>)
    .map((t) => ({ value: t.id, label: (t.name ?? '').trim() || t.id }))
    .sort((a, b) => a.label.localeCompare(b.label, 'it'));

  return NextResponse.json({
    operatori,
    committenti,
    territori,
    attivita,
    flussi: flussiClient,
    fallbackCampi: fb?.campi ?? [],
  });
}
