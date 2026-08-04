import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import { getAllowedModulesForUser, resolveUserRole } from '@/lib/moduleAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { riepilogoRapportino } from '@/utils/rapportini/riepilogo';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { notaUfficioFromRaw } from '@/utils/rapportini/notaUfficio';
import { normOdlTop, odlTop } from '@/lib/acea/top';
import { selectDegradante } from '@/lib/rapportini/colonneOpzionali';
import OggiClient, { type GiroOggi, type NotaOggi } from '@/components/modules/oggi/OggiClient';

export const dynamic = 'force-dynamic';

/** Data odierna in fuso Europe/Rome (YYYY-MM-DD), come /hub/live. */
function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

type VoceOggiRow = {
  id: string;
  ordine: number;
  odl: string | null;
  via: string | null;
  nominativo: string | null;
  raw_json: unknown;
  risposte: Record<string, unknown> | null;
  manuale: boolean | null;
  approvazione_stato: string | null;
  /** Snapshot del flusso per-voce: colonna recente, può mancare (selectDegradante). */
  campi_snapshot?: unknown;
};

/**
 * «Il mio giorno» — home dell'operatore: il giro di oggi in sintesi e il ponte
 * verso il rapportino (/r/<token>, riuso totale della pagina esistente).
 */
export default async function OggiPage() {
  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = resolveUserRole(profile?.role, user.app_metadata?.role);
  const allowedModules = getAllowedModulesForUser(user.app_metadata, role);
  if (!allowedModules.includes('oggi')) redirect('/hub');

  const oggi = oggiRoma();
  // Es. «lunedì 4 agosto» — la data del giorno per esteso, in italiano.
  const dataEstesa = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  }).format(new Date());

  /*
    Staff collegato all'utenza (staff.user_id, Tappa A). Lettura con supabaseAdmin
    come /r/[token]: le utenze operatore nascono col solo modulo `oggi` e questa
    pagina non deve dipendere dalle policy RLS di `staff` per funzionare.
  */
  const { data: staffRow } = await supabaseAdmin
    .from('staff')
    .select('id, display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!staffRow) {
    return <OggiClient dataEstesa={dataEstesa} operatore={null} senzaStaff giro={null} />;
  }

  // Rapportino del giorno: se per anomalia ce n'è più d'uno, vince il più recente.
  const { data: rapRows } = await supabaseAdmin
    .from('rapportini')
    .select('id, token, stato, data, expires_at, riaperto_at, campi_snapshot')
    .eq('staff_id', staffRow.id)
    .eq('data', oggi)
    .order('created_at', { ascending: false })
    .limit(1);
  const rap = (rapRows ?? [])[0] as
    | { id: string; token: string; stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; expires_at: string | null; riaperto_at: string | null; campi_snapshot: unknown }
    | undefined;

  if (!rap) {
    return <OggiClient dataEstesa={dataEstesa} operatore={staffRow.display_name} senzaStaff={false} giro={null} />;
  }

  const stato = tokenStatus(rap, new Date().toISOString());

  // Voci del giro: il minimo per contare e per le note. `campi_snapshot` (colonna
  // recente) si stacca da sola se la migration non è ancora passata.
  const { data: vociData } = await selectDegradante<VoceOggiRow[]>(
    'id, ordine, odl, via, nominativo, raw_json, risposte, manuale, approvazione_stato',
    ['campi_snapshot'],
    (colonne) =>
      supabaseAdmin
        .from('rapportino_voci')
        .select(colonne)
        .eq('rapportino_id', rap.id)
        .order('ordine', { ascending: true }),
  );
  const vociRows = (vociData ?? []) as VoceOggiRow[];

  /*
    Conteggi con la STESSA fonte di verità del rapportino (`riepilogoRapportino`):
    lista, PDF e questa card devono dire la stessa cosa sulla stessa voce.
    Unica semplificazione: niente lookup «ODL già positivo altrove» (bloccoPositivo),
    che qui sposterebbe al più qualche voce rara da «da fare» ad «annullata».
  */
  const campi = ((rap.campi_snapshot ?? []) as TemplateCampo[]).slice().sort((a, b) => a.ordine - b.ordine);
  const conteggi = riepilogoRapportino(
    vociRows.map((v) => ({
      risposte: (v.risposte ?? {}) as Record<string, unknown>,
      annullato: Boolean((v.raw_json as { _annullato?: unknown } | null)?._annullato),
      manuale: Boolean(v.manuale),
      approvazione_stato: v.approvazione_stato ?? null,
      campi:
        Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
          ? (v.campi_snapshot as TemplateCampo[])
          : null,
    })),
    campi,
  );

  // Note dell'ufficio (raw_json.note, come /r): solo voci non rifiutate, in ordine di giro.
  const note: NotaOggi[] = vociRows
    .filter((v) => v.approvazione_stato !== 'rifiutato')
    .flatMap((v) => {
      const testo = notaUfficioFromRaw(v.raw_json);
      if (!testo) return [];
      return [{ riferimento: v.via ?? v.nominativo ?? v.odl, testo }];
    });

  // ODL TOP letti ADESSO dal registro (stessa query best-effort di /r): se la
  // lettura salta, niente badge — un'evidenza non può spegnere la home.
  let conteggioTop = 0;
  {
    const odlVoci = [...new Set(vociRows.map((v) => normOdlTop(v.odl)).filter((o) => o !== ''))];
    if (odlVoci.length > 0) {
      const { data: righeTop, error: eTop } = await supabaseAdmin
        .from('acea_ordini')
        .select('odl, top')
        .in('odl', odlVoci)
        .eq('top', true);
      if (eTop) console.error('[hub/oggi] ODL TOP non letti:', eTop);
      else {
        const set = odlTop((righeTop ?? []) as { odl: string | null; top?: boolean }[]);
        conteggioTop = vociRows.filter((v) => set.has(normOdlTop(v.odl))).length;
      }
    }
  }

  const giro: GiroOggi = {
    token: rap.token,
    stato,
    totale: conteggi.totali,
    completate: conteggi.eseguiti + conteggi.nonEseguiti,
    daFare: conteggi.daFare,
    odlTop: conteggioTop,
    note,
  };

  return <OggiClient dataEstesa={dataEstesa} operatore={staffRow.display_name} senzaStaff={false} giro={giro} />;
}
