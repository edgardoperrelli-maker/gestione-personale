import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import RapportinoForm, {
  type Voce as FormVoce,
} from '@/components/modules/rapportini/RapportinoForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VoceRow = {
  id: string;
  ordine: number;
  nominativo: string | null;
  pdr: string | null;
  via: string | null;
  comune: string | null;
  cap: string | null;
  attivita: string | null;
  fascia_oraria: string | null;
  risposte: Record<string, unknown> | null;
};

/* ── Layout standalone (fuori dalla shell dell'app) ────────────────────────── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full bg-[var(--brand-bg)] px-4 py-6 text-[var(--brand-text-main)] sm:py-10">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </main>
  );
}

function CenteredCard({
  title,
  message,
  tone = 'neutral',
}: {
  title: string;
  message?: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <Shell>
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center shadow-sm">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{
              backgroundColor:
                tone === 'danger' ? 'var(--danger-soft)' : 'var(--brand-surface-muted)',
              color: tone === 'danger' ? 'var(--danger)' : 'var(--brand-text-muted)',
            }}
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-[var(--brand-text-main)]">{title}</h1>
          {message && (
            <p className="mt-2 text-sm text-[var(--brand-text-muted)]">{message}</p>
          )}
        </div>
      </div>
    </Shell>
  );
}

export default async function RapportinoPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_name, data, stato, expires_at, campi_snapshot')
    .eq('token', token)
    .maybeSingle();

  if (!rap) {
    return (
      <CenteredCard
        title="Rapportino non trovato"
        message="Il link non è valido. Controlla di aver aperto l'indirizzo corretto."
      />
    );
  }

  const stato = tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; expires_at: string }, new Date().toISOString());

  if (stato === 'scaduto') {
    return (
      <CenteredCard
        title="Link scaduto"
        message="Contatta l'ufficio per ricevere un nuovo collegamento."
        tone="danger"
      />
    );
  }

  const { data: vociRows } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, ordine, nominativo, pdr, via, comune, cap, attivita, fascia_oraria, risposte')
    .eq('rapportino_id', rap.id)
    .order('ordine');

  const voci: FormVoce[] = ((vociRows ?? []) as VoceRow[]).map((v) => ({
    id: v.id,
    ordine: v.ordine,
    nominativo: v.nominativo ?? undefined,
    pdr: v.pdr ?? undefined,
    via: v.via ?? undefined,
    comune: v.comune ?? undefined,
    cap: v.cap ?? undefined,
    attivita: v.attivita ?? undefined,
    fascia_oraria: v.fascia_oraria ?? undefined,
    risposte: (v.risposte ?? {}) as Record<string, unknown>,
  }));

  const campiSnapshot = ((rap.campi_snapshot ?? []) as TemplateCampo[])
    .slice()
    .sort((a, b) => a.ordine - b.ordine);

  return (
    <Shell>
      <RapportinoForm
        token={token}
        rapportino={{ staff_name: rap.staff_name, data: rap.data }}
        voci={voci}
        campiSnapshot={campiSnapshot}
        readOnly={stato === 'inviato'}
      />
    </Shell>
  );
}
