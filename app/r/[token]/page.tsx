import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { InfoChiave, TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { coordinateFromRaw } from '@/utils/rapportini/infoCampi';
import { notaUfficioFromRaw } from '@/utils/rapportini/notaUfficio';
import { caricaNotePrecedenti } from '@/lib/interventi/caricaNotePrecedenti';
import type { NotaPrecedente } from '@/lib/interventi/notePrecedenti';
import { caricaPositiviInfo, type PositivoDettaglio } from '@/lib/interventi/caricaOdlPositivi';
import { normOdl } from '@/lib/interventi/odlPositivi';
import { fotoObbligatorieSoloMassive } from '@/utils/rapportini/attivitaMassiva';
import RapportinoForm, {
  type Voce as FormVoce,
} from '@/components/modules/rapportini/RapportinoForm';
import type { CommittenteManuale } from '@/lib/interventi/manuali/types';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { caricaTemplateManuali } from '@/lib/interventi/manuali/caricaTemplateManuali';
import { BrandHeader } from '@/components/brand/BrandHeader';
import { BRAND, appBaseUrl } from '@/lib/brand';
import { sessionId as assistSessionId } from '@/lib/assistenza/canale';
import OperatoreAssistenza from '@/components/assistenza/OperatoreAssistenza';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Anteprima del link: titolo/descrizione volutamente generici. Il saluto col nome,
 *  la data e le istruzioni stanno SOLO nell'immagine (opengraph-image), così non
 *  vengono ripetuti nel testo della card. */
export function generateMetadata(): Metadata {
  const titolo = '📋 Rapportino';
  const desc = BRAND.tagline;
  return {
    metadataBase: new URL(appBaseUrl()),
    title: titolo,
    description: desc,
    openGraph: { title: titolo, description: desc, type: 'website' },
    twitter: { card: 'summary_large_image', title: titolo, description: desc },
  };
}

type VoceRow = {
  id: string;
  task_id: string | null;
  ordine: number;
  nominativo: string | null;
  matricola: string | null;
  pdr: string | null;
  odl: string | null;
  via: string | null;
  comune: string | null;
  cap: string | null;
  recapito: string | null;
  attivita: string | null;
  accessibilita: string | null;
  fascia_oraria: string | null;
  risposte: Record<string, unknown> | null;
  raw_json: unknown;
  manuale?: boolean | null;
  approvazione_stato?: string | null;
  richiesta_id?: string | null;
  intervento_id?: string | null;
};

/* ── Layout standalone (fuori dalla shell dell'app) ────────────────────────── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh w-full bg-[var(--brand-bg)] px-4 py-6 text-[var(--brand-text-main)] sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <BrandHeader subtitle="Rapportino interventi" />
        </div>
        {children}
      </div>
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
      <div className="flex min-h-[60dvh] items-center justify-center">
        <div className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center shadow-sm">
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
    .select('id, staff_name, data, stato, expires_at, campi_snapshot, info_snapshot, template_id, riaperto_at, tipo')
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

  const stato = tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString());

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
    .select('id, task_id, ordine, nominativo, matricola, pdr, odl, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte, raw_json, manuale, approvazione_stato, richiesta_id, intervento_id')
    .eq('rapportino_id', rap.id)
    .order('ordine');

  // Note "tramandate": per ogni voce, le note dei precedenti interventi POSITIVI sullo stesso
  // impianto (match matricola/PDR, stesso committente) — sola lettura. Non fatale: se la query
  // fallisce (colonna intervento_id non ancora presente su installazioni vecchie, ecc.) si resta
  // senza note, il rapportino funziona comunque.
  const notePrecedentiByVoce = new Map<string, NotaPrecedente[]>();
  try {
    const mappa = await caricaNotePrecedenti(
      supabaseAdmin,
      ((vociRows ?? []) as VoceRow[]).map((v) => ({
        id: v.id,
        matricola: v.matricola,
        pdr: v.pdr,
        interventoId: v.intervento_id ?? null,
      })),
      { dataMax: rap.data },
    );
    for (const [voceId, note] of mappa) notePrecedentiByVoce.set(voceId, note);
  } catch {
    // best-effort: nessuna nota tramandata
  }

  // Blocco "ODL già positivo": rete di sicurezza per i positivi arrivati DOPO la generazione
  // (lo sweep server-side rimuove le voci non compilate, ma un rapportino già aperto/in cache
  // può ancora contenerle). La voce resta visibile ma bloccata, con data ed esecutore del
  // positivo originale. Le voci COMPILATE non si bloccano mai (le gestisce il backstop
  // all'invio). Best-effort: se la query fallisce, nessun blocco (restano sweep + backstop).
  const bloccoByVoce = new Map<string, PositivoDettaglio>();
  if (stato !== 'inviato') {
    try {
      const daControllare = ((vociRows ?? []) as VoceRow[]).filter(
        (v) => !v.manuale && (v.odl ?? '').trim() && Object.keys(v.risposte ?? {}).length === 0,
      );
      if (daControllare.length > 0) {
        const positivi = await caricaPositiviInfo(supabaseAdmin, daControllare.map((v) => v.odl));
        for (const v of daControllare) {
          const pos = positivi.get(normOdl(v.odl));
          if (pos && pos.id !== (v.intervento_id ?? null)) bloccoByVoce.set(v.id, pos);
        }
      }
    } catch {
      // best-effort: nessun blocco
    }
  }

  // Campi per-voce (flusso del gruppo attività dell'intervento): query separata e resiliente —
  // se le colonne non esistono ancora (migration non applicata) si resta sui campi del rapportino.
  const campiVoceById = new Map<string, TemplateCampo[]>();
  const tplIdByVoceId = new Map<string, string>();
  {
    const { data: snapRows, error: eSnap } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id, campi_snapshot, template_id')
      .eq('rapportino_id', rap.id);
    if (!eSnap) {
      for (const r of (snapRows ?? []) as Array<{ id: string; campi_snapshot: unknown; template_id: string | null }>) {
        if (Array.isArray(r.campi_snapshot) && r.campi_snapshot.length > 0) {
          campiVoceById.set(r.id, (r.campi_snapshot as TemplateCampo[]).slice().sort((a, b) => a.ordine - b.ordine));
        }
        if (r.template_id) tplIdByVoceId.set(r.id, r.template_id);
      }
    }
  }

  // Titolo e dettagli PER-VOCE, letti LIVE dal flusso della voce (voce.template_id): nei
  // rapportini misti ogni card segue la config del SUO flusso, e modificarla in Azioni
  // operatori si riflette subito. Template cancellato o voce storica senza template_id →
  // si resta sulla config del rapportino (comportamento precedente, nessuna regressione).
  const displayByTplId = new Map<string, { titolo: InfoChiave[]; info: TemplateInfoCampo[] }>();
  {
    const ids = [...new Set(tplIdByVoceId.values())];
    if (ids.length > 0) {
      const { data: tplVoceRows } = await supabaseAdmin
        .from('rapportino_template')
        .select('id, titolo_campi, info_campi')
        .in('id', ids);
      for (const t of (tplVoceRows ?? []) as Array<{ id: string; titolo_campi: unknown; info_campi: unknown }>) {
        displayByTplId.set(t.id, {
          titolo: (Array.isArray(t.titolo_campi) ? t.titolo_campi : []) as InfoChiave[],
          info: (Array.isArray(t.info_campi) ? t.info_campi : []) as TemplateInfoCampo[],
        });
      }
    }
  }

  // Risanamento: carica le righe-misuratore (figlie delle voci-civico) per il rendering gerarchico.
  let righe: Array<{ id: string; voce_id: string; matricola: string | null; pdr: string | null; nominativo: string | null; risposte: Record<string, unknown> | null; ordine: number; fonte: string }> = [];
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    const { data: righeRows } = await supabaseAdmin
      .from('rapportino_righe')
      .select('id, voce_id, matricola, pdr, nominativo, risposte, ordine, fonte')
      .eq('rapportino_id', rap.id)
      .order('ordine', { ascending: true });
    righe = (righeRows ?? []) as typeof righe;
  }

  const richiesteIds = (vociRows ?? [])
    .map((v) => (v as { richiesta_id?: string | null }).richiesta_id)
    .filter((x): x is string => Boolean(x));
  const motivoByRichiesta: Record<string, string | null> = {};
  if (richiesteIds.length > 0) {
    const { data: reqRows } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, motivo_rifiuto')
      .in('id', richiesteIds);
    for (const r of (reqRows ?? []) as Array<{ id: string; motivo_rifiuto: string | null }>) {
      motivoByRichiesta[r.id] = r.motivo_rifiuto;
    }
  }

  // Le voci create dal "+" — comprese quelle figlie di un contenitore BONIFICHE EXTRA
  // (parent_voce_id valorizzato) — sono gli interventi VERI del rapportino: devono restare nella
  // lista, nei conteggi e nel PDF. Il PDF task-via/ibrido è costruito apposta per tenere gli ordini
  // "+" e scartare i contenitori a sola via; filtrarli qui svuotava rapportino e PDF (i contenitori
  // venivano poi scartati dal PDF, lasciando il corpo vuoto). Quindi NON si filtrano più.
  const voci: FormVoce[] = ((vociRows ?? []) as VoceRow[])
    .map((v) => ({
    id: v.id,
    taskId: v.task_id ?? undefined,
    ordine: v.ordine,
    nominativo: v.nominativo ?? undefined,
    matricola: v.matricola ?? undefined,
    pdr: v.pdr ?? undefined,
    odl: v.odl ?? undefined,
    via: v.via ?? undefined,
    comune: v.comune ?? undefined,
    cap: v.cap ?? undefined,
    recapito: v.recapito ?? undefined,
    attivita: v.attivita ?? undefined,
    accessibilita: v.accessibilita ?? undefined,
    fascia_oraria: v.fascia_oraria ?? undefined,
    risposte: (v.risposte ?? {}) as Record<string, unknown>,
    coordinate: coordinateFromRaw(v.raw_json),
    notaUfficio: notaUfficioFromRaw(v.raw_json),
    notePrecedenti: notePrecedentiByVoce.get(v.id),
    nuovo: Boolean((v.raw_json as { _nuovo?: unknown } | null)?._nuovo),
    annullato: Boolean((v.raw_json as { _annullato?: unknown } | null)?._annullato),
    bloccoPositivo: bloccoByVoce.has(v.id)
      ? { data: bloccoByVoce.get(v.id)!.data, esecutore: bloccoByVoce.get(v.id)!.esecutore }
      : undefined,
    manuale: Boolean(v.manuale),
    approvazione_stato: v.approvazione_stato ?? null,
    motivo_rifiuto: v.richiesta_id ? (motivoByRichiesta[v.richiesta_id] ?? null) : null,
    campi: campiVoceById.get(v.id),
    titolo_campi: displayByTplId.get(tplIdByVoceId.get(v.id) ?? '')?.titolo,
    info_campi: displayByTplId.get(tplIdByVoceId.get(v.id) ?? '')?.info,
  }));

  const campiSnapshot = ((rap.campi_snapshot ?? []) as TemplateCampo[])
    .slice()
    .sort((a, b) => a.ordine - b.ordine);

  // Config di visualizzazione letta LIVE dal template collegato → vale anche sui rapportini già
  // generati. Non fatale: se il template è stato cancellato o la colonna non esiste ancora
  // (migrazione non applicata → select in errore), si resta sullo snapshot congelato + titolo storico.
  let infoCampiLive = (rap.info_snapshot ?? []) as TemplateInfoCampo[];
  let titoloCampi: InfoChiave[] = [];
  // Campi "standard" che comandano il "+": quelli del template del rapportino, letti LIVE
  // (così modificando lo standard il "+" segue). Il template manuale è solo un override.
  let campiStandardLive = campiSnapshot;
  if (rap.template_id) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('campi, titolo_campi, info_campi')
      .eq('id', rap.template_id)
      .maybeSingle();
    if (tpl) {
      if (Array.isArray(tpl.campi) && tpl.campi.length > 0) {
        campiStandardLive = (tpl.campi as TemplateCampo[]).slice().sort((a, b) => a.ordine - b.ordine);
      }
      if (Array.isArray(tpl.info_campi) && tpl.info_campi.length > 0) {
        infoCampiLive = tpl.info_campi as TemplateInfoCampo[];
      }
      if (Array.isArray(tpl.titolo_campi)) {
        titoloCampi = tpl.titolo_campi as InfoChiave[];
      }
    }
  }

  // Flag "task-via" del template (query separata e resiliente: default false se la colonna
  // non esiste ancora). I rapportini di un template task-via mostrano il contenitore + "+".
  let taskVia = false;
  if (rap.template_id) {
    const { data: tplFlag } = await supabaseAdmin
      .from('rapportino_template').select('task_via').eq('id', rap.template_id).maybeSingle();
    taskVia = Boolean((tplFlag as { task_via?: boolean } | null)?.task_via);
  }

  // Flag "ibrido" del template (query separata e resiliente, indipendente da quella di `task_via`
  // così la colonna mancante non regredisce i task-via puri). Nei rapportini ibridi convivono
  // attività classiche e voci BONIFICHE EXTRA: solo queste ultime aprono il contenitore + "+".
  // Nella stessa query si legge il `nome`: il template "Ibrido acea" rende le foto obbligatorie
  // SOLO per le voci di limitazione massiva (le sospensioni non le richiedono, come nel template
  // LIMITAZIONI/SOSPENSIONI). Riconoscimento per nome → nessun altro template è toccato.
  let taskViaIbrido = false;
  let fotoSoloMassive = false;
  if (rap.template_id) {
    const { data: tplIbrido } = await supabaseAdmin
      .from('rapportino_template').select('task_via_ibrido, nome').eq('id', rap.template_id).maybeSingle();
    taskViaIbrido = Boolean((tplIbrido as { task_via_ibrido?: boolean } | null)?.task_via_ibrido);
    fotoSoloMassive = fotoObbligatorieSoloMassive((tplIbrido as { nome?: string | null } | null)?.nome);
  }

  // Template attivi per committente → alimentano la modale "intervento manuale".
  // Si legge ANCHE info_campi: l'anagrafica del "+" è guidata dal template manuale scelto
  // (coerente con l'editor "Anagrafica da compilare"), non dall'anagrafica del rapportino.
  // caricaTemplateManuali esclude i modelli riservati (P.I.): non alimentano il "+".
  const tplManuali = await caricaTemplateManuali(supabaseAdmin, { soloAttivi: true });
  const templatesPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>> = {};
  const infoCampiPerCommittente: Partial<Record<CommittenteManuale, TemplateInfoCampo[]>> = {};
  for (const t of tplManuali as Array<{ committente: string | null; campi: unknown; info_campi: unknown }>) {
    if (t.committente === 'acea' || t.committente === 'italgas' || t.committente === 'altro' || t.committente === 'lim_massive') {
      templatesPerCommittente[t.committente] = ((t.campi ?? []) as TemplateCampo[]);
      if (Array.isArray(t.info_campi) && t.info_campi.length > 0) {
        infoCampiPerCommittente[t.committente] = t.info_campi as TemplateInfoCampo[];
      }
    }
  }

  // Tassonomia attività: alimenta la select obbligatoria del "+" (spec §7). Non fatale: se il
  // caricamento fallisce, la select resta vuota (l'operatore non può inviare senza scegliere,
  // meglio bloccato in modo esplicito che con un default silenzioso).
  const tassonomia = await caricaTassonomia().catch(() => []);

  return (
    <main className="min-h-dvh bg-[var(--brand-bg)] text-[var(--brand-text-main)]">
      <ServiceWorkerRegister />
      <RapportinoForm
        token={token}
        rapportino={{ staff_name: rap.staff_name, data: rap.data }}
        voci={voci}
        campiSnapshot={campiSnapshot}
        infoCampi={infoCampiLive}
        titoloCampi={titoloCampi}
        readOnly={stato === 'inviato'}
        infoCampiManuale={infoCampiLive}
        templatesPerCommittente={templatesPerCommittente}
        infoCampiPerCommittente={infoCampiPerCommittente}
        campiStandardManuale={campiStandardLive}
        taskVia={taskVia}
        taskViaIbrido={taskViaIbrido}
        fotoSoloMassive={fotoSoloMassive}
        tipo={(rap as { tipo?: 'standard' | 'risanamento' }).tipo ?? 'standard'}
        righe={righe}
        tassonomia={tassonomia}
      />
      <OperatoreAssistenza sessionId={assistSessionId(token)} staff={rap.staff_name} data={rap.data} />
    </main>
  );
}
