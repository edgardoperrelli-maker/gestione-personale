'use client';
// Azioni operatori — consolle per-attività (redesign 2026-07-21).
// Architettura: rail attività a sinistra · editor al centro · telefono (componenti reali)
// a destra. L'unità mentale è l'ATTIVITÀ (gruppo della tassonomia): ogni attività risolve
// il flusso che la copre con la STESSA funzione del motore (risolviFlussoPerGruppo), così
// ciò che si vede qui è ciò che genera i rapportini. Contratto API invariato:
// POST/PATCH/DELETE su /api/admin/rapportino-template con lock ottimistico (409 → ricarica).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { nomeFotoFile, FOTO_ID_CAMPI, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
import {
  INFO_CAMPI_DISPONIBILI,
  partitionInfoCampi,
  resolveInfoCampi,
  titoloVoce,
  valoreInfo,
  type InfoChiave,
  type TemplateInfoCampo,
} from '@/utils/rapportini/infoCampi';
import { VoceTitolo, VoceHeaderInfo, VoceDettagli, VoceCampi } from '@/components/modules/rapportini/VoceCard';
import { RigaVoceCard, type RigaVoce } from '@/components/modules/rapportini/RapportinoLista';
import { SAMPLE_VOCE_INFO, sampleRisposte } from '@/utils/rapportini/sampleVoce';
import SezioneAccordion from './SezioneAccordion';
import { erroreCommittenteManuale } from '@/lib/rapportini/templateScheda';
import { chiaveTassonomia } from '@/lib/attivita/tassonomia';
import {
  buildAlberoFlussi,
  risolviFlussoPerGruppo,
  COMMITTENTE_FLUSSO_LABEL,
  COMMITTENTI_FLUSSO,
  type CommittenteFlusso,
  type TassonomiaGruppoRiga,
} from '@/lib/rapportini/flussiGruppo';

/* ── Tipi ─────────────────────────────────────────────────────────────────── */

type Committente = 'acea' | 'italgas' | 'altro' | 'lim_massive';

type Template = {
  id: string;
  nome: string;
  committente?: Committente | null;
  campi: TemplateCampo[];
  info_campi?: TemplateInfoCampo[];
  titolo_campi?: InfoChiave[];
  foto_id_priority?: FotoIdCampo[];
  active: boolean;
  solo_manuale?: boolean;
  task_via?: boolean;
  task_via_ibrido?: boolean;
  tipo?: 'standard' | 'risanamento';
  gruppo_committente?: string | null;
  gruppi_attivita?: string[] | null;
  riservato_pi?: boolean | null;
  updated_at?: string;
};

type Props = { initial: Template[]; tassonomia: TassonomiaGruppoRiga[] };

type Feedback = { type: 'success' | 'error'; message: string };

/** Cosa mostra la colonna centrale: panoramica, un'attività (gruppo) o un flusso diretto. */
type Vista =
  | { t: 'panoramica' }
  | { t: 'gruppo'; committente: CommittenteFlusso; gruppo: string }
  | { t: 'flusso'; id: string };

const COMMITTENTI_PLUS: { v: Committente; label: string }[] = [
  { v: 'italgas', label: 'Italgas' },
  { v: 'acea', label: 'Acea' },
  { v: 'altro', label: 'Altro' },
  { v: 'lim_massive', label: 'Lim. massive' },
];

const SCOPE_FOTO: { v: 'misuratore' | 'fase' | 'accessoria'; label: string }[] = [
  { v: 'misuratore', label: 'Misuratore (prima/dopo)' },
  { v: 'fase', label: 'Fase lavorazione' },
  { v: 'accessoria', label: 'Accessoria opzionale' },
];

/** Etichette semplici, pensate per il backoffice. */
const TIPO_LABELS: Record<TemplateCampo['tipo'], string> = {
  crocetta: 'Casella da spuntare',
  testo: 'Testo libero',
  select: 'Scelta da elenco',
  numero: 'Numero',
  foto: 'Foto',
  ora: 'Ora',
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function newCampo(n: number): TemplateCampo {
  return { chiave: `campo_${n}`, etichetta: '', tipo: 'testo', ordine: n };
}

function dataBreve(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

/** Riassunto della natura del flusso (etichette nelle liste e nell'header editor). */
function tagNatura(t: Template): string[] {
  const out: string[] = [];
  if (t.solo_manuale) out.push('manuale (+)');
  if (t.task_via) out.push('task-via');
  if (t.task_via_ibrido) out.push('ibrido');
  if (t.tipo === 'risanamento') out.push('risanamento');
  if (t.riservato_pi) out.push('riservato P.I.');
  return out;
}

/* ── Piccoli primitivi visuali ────────────────────────────────────────────── */

function Dot({ tone }: { tone: 'ok' | 'warn' | 'idle' }) {
  const bg = tone === 'ok' ? 'var(--status-ok)' : tone === 'warn' ? 'var(--status-warn)' : 'var(--status-idle)';
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: bg }} />;
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'mut' | 'primary'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-[var(--success-soft)] text-[var(--success)]'
      : tone === 'warn'
        ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
        : tone === 'primary'
          ? 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
          : 'border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

function CardBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-[var(--shadow-sm)] ${className}`}>
      {children}
    </div>
  );
}

/** Chip-azione per il registro della panoramica (innesto «Registro»). */
function ChipAzione({ campo }: { campo: TemplateCampo }) {
  const obb = campo.obbligatoria === true;
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
        obb
          ? 'border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
          : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]'
      }`}
      title={obb ? 'Obbligatoria' : undefined}
    >
      {campo.etichetta || campo.chiave}
    </span>
  );
}

/* ── Telefono: anteprima fedele coi componenti reali dell'app operatore ───── */

function Telefono({
  campi, infoCampi, titoloCampi, soloManuale, coordinataAbilitata, scoperto, nomeAttivita,
}: {
  campi: TemplateCampo[];
  infoCampi: TemplateInfoCampo[];
  titoloCampi: InfoChiave[];
  soloManuale: boolean;
  coordinataAbilitata: boolean;
  scoperto?: boolean;
  nomeAttivita?: string;
}) {
  const anteprimaVoce = { ...SAMPLE_VOCE_INFO, risposte: sampleRisposte(campi) };
  const dettaglio = partitionInfoCampi(infoCampi).dettaglio;
  const riga: RigaVoce = {
    index: 0,
    titolo: titoloVoce(anteprimaVoce, titoloCampi, 0),
    sub: [SAMPLE_VOCE_INFO.via, SAMPLE_VOCE_INFO.comune].filter(Boolean).join(' · '),
    attivita: SAMPLE_VOCE_INFO.attivita,
    fascia: SAMPLE_VOCE_INFO.fascia_oraria,
    stato: 'da_fare',
  };
  return (
    <div className="rounded-[34px] bg-[var(--phone-bezel)] p-2.5 shadow-[var(--shadow-lg)]">
      <div aria-hidden className="mx-auto mb-2 mt-0.5 h-[5px] w-20 rounded-full bg-white/25" />
      <div className="max-h-[560px] overflow-y-auto rounded-[24px] bg-[var(--phone-screen)] p-3">
        {scoperto ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 shadow-[var(--shadow-sm)]">
            <p className="text-sm font-semibold text-[var(--brand-text-main)]">Giulia Neri</p>
            <p className="text-xs text-[var(--brand-text-muted)]">VIA APPIA 12 · Latina{nomeAttivita ? ` · ${nomeAttivita}` : ''}</p>
            <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--warning)] bg-[var(--warning-soft)] p-2.5 text-xs text-[var(--warning)]">
              Nessuna azione configurata: l&apos;operatore può solo dare l&apos;esito, senza letture né foto.
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {!soloManuale && (
              <>
                <RigaVoceCard riga={riga} onApri={() => {}} />
                <p className="text-center text-[10px] text-[var(--brand-text-subtle)]">— aprendo la card —</p>
              </>
            )}
            <div className="rounded-[var(--radius-lg)] border border-[var(--brand-primary)] bg-[var(--brand-surface)] p-3 shadow-[var(--shadow-sm)]">
              <VoceTitolo voce={anteprimaVoce} titoloCampi={titoloCampi} indice={0} />
              {!soloManuale && <VoceHeaderInfo voce={anteprimaVoce} coordinataAbilitata={coordinataAbilitata} />}
              <VoceDettagli voce={anteprimaVoce} dettaglio={dettaglio} />
              <div className="mt-2 border-t border-[var(--brand-border)] pt-2">
                <VoceCampi campi={campi} voce={anteprimaVoce} disabilitato onChange={() => {}} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Innesto «Guidata»: checklist di verifica accanto al telefono in creazione. */
function ChecklistVerifica({ campi, titoloCampi }: { campi: TemplateCampo[]; titoloCampi: InfoChiave[] }) {
  const anteprimaVoce = { ...SAMPLE_VOCE_INFO, risposte: {} };
  const titolo = titoloVoce(anteprimaVoce, titoloCampi, 0);
  const obbligatorie = campi.filter((c) => c.obbligatoria === true).length;
  const voci: { ok: boolean; testo: string }[] = [
    { ok: campi.length > 0, testo: campi.length > 0 ? `${campi.length} azion${campi.length === 1 ? 'e' : 'i'}, ${obbligatorie} obbligatori${obbligatorie === 1 ? 'a' : 'e'}` : 'Nessuna azione: aggiungine almeno una' },
    { ok: true, testo: `Titolo della card: «${titolo}»` },
    { ok: campi.every((c) => c.etichetta.trim() !== ''), testo: campi.every((c) => c.etichetta.trim() !== '') ? 'Tutte le azioni hanno un nome' : 'C’è un’azione senza nome' },
  ];
  return (
    <div className="mt-3 space-y-1.5">
      {voci.map((v, i) => (
        <div key={i} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-xs">
          <span
            aria-hidden
            className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold"
            style={{ backgroundColor: v.ok ? 'var(--success-soft)' : 'var(--warning-soft)', color: v.ok ? 'var(--success)' : 'var(--warning)' }}
          >
            {v.ok ? '✓' : '!'}
          </span>
          <span className={v.ok ? 'text-[var(--brand-text-muted)]' : 'font-medium text-[var(--warning)]'}>{v.testo}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Componente principale ────────────────────────────────────────────────── */

export default function AzioniOperatoriClient({ initial, tassonomia }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [vista, setVista] = useState<Vista>({ t: 'panoramica' });

  // Editor (stesso contratto del client precedente).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [nome, setNome] = useState('');
  const [committente, setCommittente] = useState<Committente | ''>('');
  const [soloManuale, setSoloManuale] = useState(false);
  const [tipo, setTipo] = useState<'standard' | 'risanamento'>('standard');
  const [taskVia, setTaskVia] = useState(false);
  const [taskViaIbrido, setTaskViaIbrido] = useState(false);
  const [gruppoCommittente, setGruppoCommittente] = useState<CommittenteFlusso | ''>('');
  const [gruppiAttivita, setGruppiAttivita] = useState<string[]>([]);
  const [campi, setCampi] = useState<TemplateCampo[]>([]);
  const [infoCampi, setInfoCampi] = useState<TemplateInfoCampo[]>([]);
  const [titoloCampi, setTitoloCampi] = useState<InfoChiave[]>([]);
  const [fotoIdPriority, setFotoIdPriority] = useState<FotoIdCampo[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const skipAutosave = useRef(true);
  // Version token per il lock ottimistico (409 → ricarica, mai sovrascrivere).
  const baseUpdatedAt = useRef<string | null>(null);
  const conflictHandlerRef = useRef<(id: string) => void | Promise<void>>(() => {});

  /* ── Derivati ─────────────────────────────────────────────────────────── */

  const attivi = useMemo(() => templates.filter((t) => t.active), [templates]);
  const archiviati = useMemo(() => templates.filter((t) => !t.active), [templates]);
  // L'albero mostra solo i flussi ATTIVI: gli archiviati vivono nella loro sezione.
  const albero = useMemo(() => buildAlberoFlussi(tassonomia, attivi), [tassonomia, attivi]);

  /** Il flusso che GENERA per un'attività: stessa semantica del motore. */
  const vincente = useMemo(() => {
    const m = new Map<string, Template | null>();
    for (const c of albero.committenti) {
      for (const g of c.gruppi) {
        m.set(`${c.committente}|${chiaveTassonomia(g.gruppo)}`, risolviFlussoPerGruppo(c.committente, g.gruppo, attivi));
      }
    }
    return m;
  }, [albero, attivi]);
  const flussoDiGruppo = (c: CommittenteFlusso, g: string) => vincente.get(`${c}|${chiaveTassonomia(g)}`) ?? null;

  const scoperte = useMemo(
    () =>
      albero.committenti.flatMap((c) =>
        c.gruppi.filter((g) => !flussoDiGruppo(c.committente, g.gruppo)).map((g) => ({ committente: c.committente, gruppo: g.gruppo })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [albero, vincente],
  );

  /** Slot del "+" per committente (unicità garantita da indice + 409 API). */
  const slotPlus = useMemo(() => {
    const m = new Map<Committente, Template | undefined>();
    for (const c of COMMITTENTI_PLUS) m.set(c.v, attivi.find((t) => t.solo_manuale && !t.riservato_pi && t.committente === c.v));
    return m;
  }, [attivi]);
  const riservatoPI = useMemo(() => templates.find((t) => t.riservato_pi) ?? null, [templates]);

  const selectedTpl = templates.find((t) => t.id === selectedId);
  const isEditing = isNew || selectedTpl != null;
  const gruppoVista = vista.t === 'gruppo' ? vista : null;
  const gruppoScoperto = gruppoVista != null && !isEditing;

  /** Validazione che blocca l'auto-save: SEMPRE dichiarata, mai silenziosa (lezione F2). */
  const motivoBlocco = !isEditing
    ? null
    : !nome.trim()
      ? 'dai un nome al flusso'
      : campi.length === 0
        ? 'serve almeno un’azione'
        : campi.some((c) => !c.etichetta.trim())
          ? 'ogni azione deve avere un nome'
          : erroreCommittenteManuale({ solo_manuale: soloManuale, committente: committente || null })
            ? 'scegli il committente del «+»'
            : null;

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  function showFeedback(type: 'success' | 'error', message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  }

  function loadTemplate(tpl: Template) {
    skipAutosave.current = true;
    baseUpdatedAt.current = tpl.updated_at ?? null;
    setAutoState('idle');
    setIsNew(false);
    setSelectedId(tpl.id);
    setNome(tpl.nome);
    setCommittente(tpl.committente ?? '');
    setSoloManuale(Boolean(tpl.solo_manuale));
    setTipo(tpl.tipo ?? 'standard');
    setTaskVia(Boolean(tpl.task_via));
    setTaskViaIbrido(Boolean(tpl.task_via_ibrido));
    setGruppoCommittente((tpl.gruppo_committente as CommittenteFlusso | null) ?? '');
    setGruppiAttivita(tpl.gruppi_attivita ?? []);
    setCampi(tpl.campi.map((c) => ({ ...c, opzioni: c.opzioni ?? [] })));
    setInfoCampi(resolveInfoCampi(tpl.info_campi));
    setTitoloCampi(tpl.titolo_campi ?? []);
    setFotoIdPriority(tpl.foto_id_priority ?? []);
  }

  function startNew(preset: {
    nome?: string;
    soloManuale?: boolean;
    committente?: Committente | '';
    gruppoCommittente?: CommittenteFlusso | '';
    gruppiAttivita?: string[];
    da?: Template;
  } = {}) {
    skipAutosave.current = true;
    baseUpdatedAt.current = null;
    setAutoState('idle');
    setIsNew(true);
    setSelectedId(null);
    setNome(preset.nome ?? '');
    setCommittente(preset.committente ?? '');
    setSoloManuale(preset.soloManuale ?? false);
    setTipo(preset.da?.tipo ?? 'standard');
    setTaskVia(false);
    setTaskViaIbrido(false);
    setGruppoCommittente(preset.gruppoCommittente ?? '');
    setGruppiAttivita(preset.gruppiAttivita ?? []);
    setCampi(preset.da ? preset.da.campi.map((c, i) => ({ ...c, ordine: i + 1, opzioni: c.opzioni ? [...c.opzioni] : [] })) : []);
    setInfoCampi(preset.da ? resolveInfoCampi(preset.da.info_campi) : []);
    setTitoloCampi(preset.da?.titolo_campi ? [...preset.da.titolo_campi] : []);
    setFotoIdPriority(preset.da?.foto_id_priority ? [...preset.da.foto_id_priority] : []);
  }

  function chiudiEditor() {
    skipAutosave.current = true;
    setSelectedId(null);
    setIsNew(false);
  }

  function tornaPanoramica() {
    chiudiEditor();
    setVista({ t: 'panoramica' });
  }

  function apriGruppo(c: CommittenteFlusso, gruppo: string) {
    const win = flussoDiGruppo(c, gruppo);
    if (win) loadTemplate(win);
    else chiudiEditor(); // attività scoperta: mostra l'avvio guidato
    setVista({ t: 'gruppo', committente: c, gruppo });
  }

  function apriFlusso(tpl: Template) {
    loadTemplate(tpl);
    setVista({ t: 'flusso', id: tpl.id });
  }

  async function reloadTemplates() {
    const res = await fetch('/api/admin/rapportino-template');
    if (res.ok) setTemplates((await res.json()) as Template[]);
  }

  // Conflitto (409): il flusso è cambiato altrove → ricarica, mai sovrascrivere.
  async function handleConflict(id: string) {
    const res = await fetch('/api/admin/rapportino-template');
    if (!res.ok) return;
    const data = (await res.json()) as Template[];
    setTemplates(data);
    const tpl = data.find((t) => t.id === id);
    if (tpl) loadTemplate(tpl);
    showFeedback('error', 'Flusso modificato altrove: ho ricaricato la versione aggiornata. Riapplica le tue modifiche.');
  }
  conflictHandlerRef.current = handleConflict;

  /* ── Operazioni sulle azioni (campi) ──────────────────────────────────── */

  function updateCampo(idx: number, patch: Partial<TemplateCampo>) {
    setCampi((prev) => {
      const next = [...prev];
      const updated = { ...next[idx], ...patch };
      if (patch.etichetta !== undefined) {
        const slug = slugify(patch.etichetta);
        updated.chiave = slug || `campo_${idx + 1}`;
      }
      next[idx] = updated;
      return next;
    });
  }
  function addCampo() {
    setCampi((prev) => [...prev, newCampo(prev.length + 1)]);
  }
  function removeCampo(idx: number) {
    setCampi((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, ordine: i + 1 })));
  }
  function moveCampo(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= campi.length) return;
    setCampi((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((c, i) => ({ ...c, ordine: i + 1 }));
    });
  }

  /* ── Titolo / dettagli / foto ─────────────────────────────────────────── */

  function toggleInfo(chiave: InfoChiave) {
    setInfoCampi((prev) => {
      if (prev.some((c) => c.chiave === chiave)) return prev.filter((c) => c.chiave !== chiave).map((c, i) => ({ ...c, ordine: i + 1 }));
      const def = INFO_CAMPI_DISPONIBILI.find((c) => c.chiave === chiave)!;
      return [...prev, { chiave, etichetta: def.etichettaDefault, ordine: prev.length + 1 }];
    });
  }
  function updateInfoEtichetta(chiave: InfoChiave, etichetta: string) {
    setInfoCampi((prev) => prev.map((c) => (c.chiave === chiave ? { ...c, etichetta } : c)));
  }
  function moveInfo(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    setInfoCampi((prev) => {
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((c, i) => ({ ...c, ordine: i + 1 }));
    });
  }
  function toggleTitolo(chiave: InfoChiave) {
    setTitoloCampi((prev) => (prev.includes(chiave) ? prev.filter((c) => c !== chiave) : [...prev, chiave]));
  }
  function moveTitolo(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    setTitoloCampi((prev) => {
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }
  function toggleFotoId(chiave: FotoIdCampo) {
    setFotoIdPriority((prev) => (prev.includes(chiave) ? prev.filter((c) => c !== chiave) : [...prev, chiave]));
  }
  function moveFotoId(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    setFotoIdPriority((prev) => {
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  /* ── Collegamento (copertura attività) ────────────────────────────────── */

  const gruppiDisponibili = useMemo(() => {
    if (!gruppoCommittente) return [];
    const nodo = albero.committenti.find((c) => c.committente === gruppoCommittente);
    const base = (nodo?.gruppi ?? []).map((g) => g.gruppo);
    const chiavi = new Set(base.map((g) => chiaveTassonomia(g)));
    const extra = gruppiAttivita.filter((g) => !chiavi.has(chiaveTassonomia(g)));
    return [...base, ...extra];
  }, [albero, gruppoCommittente, gruppiAttivita]);

  function toggleGruppo(gruppo: string) {
    const k = chiaveTassonomia(gruppo);
    setGruppiAttivita((prev) => {
      const presente = prev.some((g) => chiaveTassonomia(g) === k);
      return presente ? prev.filter((g) => chiaveTassonomia(g) !== k) : [...prev, gruppo];
    });
  }
  function cambiaGruppoCommittente(v: CommittenteFlusso | '') {
    setGruppoCommittente(v);
    setGruppiAttivita([]);
  }

  /* ── Salvataggio ──────────────────────────────────────────────────────── */

  // NB: niente `active` nel payload ordinario — l'archiviazione è un'azione dedicata
  // (il vecchio client forzava active:true a ogni salvataggio, resuscitando gli archiviati).
  function payloadCorrente() {
    return {
      nome: nome.trim(),
      committente: committente || null,
      solo_manuale: soloManuale,
      task_via: taskVia,
      task_via_ibrido: taskViaIbrido,
      tipo,
      gruppo_committente: gruppoCommittente || null,
      gruppi_attivita: gruppiAttivita,
      campi: campi.map((c, i) => ({
        ...c,
        ordine: i + 1,
        opzioni: c.tipo === 'select' ? (c.opzioni ?? []).map((s) => s.trim()).filter(Boolean) : undefined,
      })),
      info_campi: infoCampi.map((c, i) => ({ ...c, ordine: i + 1 })),
      titolo_campi: titoloCampi,
      foto_id_priority: fotoIdPriority,
    };
  }

  async function handleCrea() {
    if (motivoBlocco) { showFeedback('error', `Non ancora: ${motivoBlocco}.`); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/rapportino-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payloadCorrente(), active: true }),
      });
      const json = await res.json();
      if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante la creazione'); return; }
      showFeedback('success', 'Flusso creato');
      await reloadTemplates();
      if (json.id) {
        skipAutosave.current = true;
        setIsNew(false);
        setSelectedId(json.id);
        if (typeof json.updated_at === 'string') baseUpdatedAt.current = json.updated_at;
      }
    } finally {
      setSaving(false);
    }
  }

  /** Archivia/riattiva: PATCH dedicata col solo flag active. */
  async function impostaActive(id: string, active: boolean, expected?: string | null) {
    const res = await fetch('/api/admin/rapportino-template', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active, ...(expected ? { expected_updated_at: expected } : {}) }),
    });
    const json = await res.json().catch(() => ({} as { error?: string }));
    if (res.status === 409 && json && 'conflict' in (json as object)) { await handleConflict(id); return false; }
    if (!res.ok) { showFeedback('error', (json as { error?: string }).error ?? 'Operazione non riuscita'); return false; }
    await reloadTemplates();
    return true;
  }

  async function handleArchivia() {
    if (!selectedId || !selectedTpl) return;
    if (await impostaActive(selectedId, false, baseUpdatedAt.current)) {
      showFeedback('success', `«${selectedTpl.nome}» archiviato: fuori uso, riattivabile quando vuoi`);
      tornaPanoramica();
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    const tpl = templates.find((t) => t.id === selectedId);
    if (!confirm(`Eliminare per sempre il flusso "${tpl?.nome}"? L'archiviazione è quasi sempre la scelta giusta.`)) return;
    const res = await fetch(`/api/admin/rapportino-template?id=${selectedId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante l’eliminazione'); return; }
    showFeedback('success', 'Flusso eliminato');
    await reloadTemplates();
    tornaPanoramica();
  }

  // Auto-save (solo flussi esistenti; debounce 800ms; 409 → ricarica).
  useEffect(() => {
    if (skipAutosave.current) { skipAutosave.current = false; return; }
    if (isNew || !selectedId) return;
    if (motivoBlocco) { setAutoState('idle'); return; } // il motivo è GIÀ in vista nella pill rossa
    setAutoState('saving');
    const id = selectedId;
    const timer = setTimeout(async () => {
      try {
        const payload = { id, expected_updated_at: baseUpdatedAt.current, ...payloadCorrente() };
        const res = await fetch('/api/admin/rapportino-template', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 409) {
          const json = await res.json().catch(() => ({} as { conflict?: boolean; error?: string }));
          if ((json as { conflict?: boolean }).conflict) { setAutoState('idle'); await conflictHandlerRef.current(id); return; }
          // 409 di unicità del "+": messaggio esplicito, stato errore.
          setAutoState('error');
          showFeedback('error', (json as { error?: string }).error ?? 'Salvataggio rifiutato');
          return;
        }
        const json = await res.json().catch(() => ({} as { updated_at?: string }));
        if (res.ok && typeof json.updated_at === 'string') baseUpdatedAt.current = json.updated_at;
        setAutoState(res.ok ? 'saved' : 'error');
        if (res.ok) await reloadTemplates(); // il rail e la panoramica seguono le modifiche
      } catch {
        setAutoState('error');
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, committente, soloManuale, tipo, taskVia, taskViaIbrido, gruppoCommittente, gruppiAttivita, campi, infoCampi, titoloCampi, fotoIdPriority, isNew, selectedId]);

  /* ── Anteprime derivate ───────────────────────────────────────────────── */

  const anteprimaVoce = { ...SAMPLE_VOCE_INFO, risposte: sampleRisposte(campi) };
  const haCampiFoto = campi.some((c) => c.tipo === 'foto');
  const etichettaFotoEsempio = campi.find((c) => c.tipo === 'foto')?.etichetta?.trim() || 'Foto contatore';
  const anteprimaNomeFoto = nomeFotoFile(
    etichettaFotoEsempio,
    { pdr: '12345', matricola: 'M-678', odl: 'ODL-900', indirizzo: 'Via Roma 1' },
    'jpg',
    fotoIdPriority,
  );

  const contestoLabel = gruppoVista
    ? `${COMMITTENTE_FLUSSO_LABEL[gruppoVista.committente]} → ${gruppoVista.gruppo}`
    : soloManuale
      ? selectedTpl?.riservato_pi
        ? 'Riservato al modulo Pronto Intervento'
        : `Modello del «+»${committente ? ` · ${COMMITTENTI_PLUS.find((c) => c.v === committente)?.label ?? committente}` : ''}`
      : gruppoCommittente && gruppiAttivita.length > 0
        ? `${COMMITTENTE_FLUSSO_LABEL[gruppoCommittente as CommittenteFlusso]} → ${gruppiAttivita.join(' · ')}`
        : 'Non collegato a nessuna attività';

  const altriFlussiDelGruppo = gruppoVista
    ? (albero.committenti
        .find((c) => c.committente === gruppoVista.committente)
        ?.gruppi.find((g) => chiaveTassonomia(g.gruppo) === chiaveTassonomia(gruppoVista.gruppo))
        ?.flussi.filter((f) => f.id !== selectedId) ?? [])
    : [];

  /* ── Pill di stato del salvataggio (mai silenziosa) ───────────────────── */

  function SavePill() {
    if (isNew) return <Pill tone="mut">Bozza — si crea con «Crea flusso»</Pill>;
    if (motivoBlocco) return <Pill tone="warn">⚠ Non salvato — {motivoBlocco}</Pill>;
    if (autoState === 'saving') return <Pill tone="mut"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />Salvataggio…</Pill>;
    if (autoState === 'saved') return <Pill tone="ok">Salvato ✓</Pill>;
    if (autoState === 'error') return <Pill tone="warn">Non salvato — riprova</Pill>;
    return <Pill tone="mut">Le modifiche si salvano da sole</Pill>;
  }

  /* ── Render: rail ─────────────────────────────────────────────────────── */

  const railAttiva = (c: CommittenteFlusso, gruppo: string) =>
    gruppoVista != null && gruppoVista.committente === c && chiaveTassonomia(gruppoVista.gruppo) === chiaveTassonomia(gruppo);

  const rail = (
    <aside className="w-full shrink-0 lg:w-[300px]">
      <div className="lg:sticky lg:top-4">
        <button
          type="button"
          onClick={tornaPanoramica}
          className={`mb-1 w-full rounded-[var(--radius-lg)] px-3 py-2 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
            vista.t === 'panoramica' ? 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]' : 'text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]'
          }`}
        >
          Panoramica
        </button>

        {albero.committenti.map((c) => (
          <div key={c.committente} className="mb-2">
            <p className="flex items-baseline justify-between px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">
              {c.label}
              <span className="font-normal normal-case">{c.gruppi.length} attività</span>
            </p>
            {c.gruppi.map((g) => {
              const win = flussoDiGruppo(c.committente, g.gruppo);
              const attiva = railAttiva(c.committente, g.gruppo);
              return (
                <button
                  key={g.gruppo}
                  type="button"
                  onClick={() => apriGruppo(c.committente, g.gruppo)}
                  aria-current={attiva || undefined}
                  className={`relative flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] px-3 py-2 text-left text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                    attiva ? 'bg-[var(--brand-primary-soft)] text-[var(--primary-text)]' : 'text-[var(--brand-text-main)] hover:bg-[var(--brand-surface-muted)]'
                  }`}
                >
                  {attiva && <span aria-hidden className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-[var(--brand-primary)]" />}
                  <Dot tone={win ? 'ok' : 'warn'} />
                  <span className="min-w-0 flex-1 truncate">{g.gruppo}</span>
                  <span className="shrink-0 text-[11px] font-normal text-[var(--brand-text-subtle)]">
                    {win ? `${win.campi.length} azion${win.campi.length === 1 ? 'e' : 'i'}` : 'da configurare'}
                  </span>
                </button>
              );
            })}
          </div>
        ))}

        <div className="mt-3 border-t border-[var(--brand-border)] pt-2 text-[12.5px]">
          <a href="#modelli-plus" className="block rounded-[var(--radius-md)] px-3 py-1.5 text-[var(--brand-text-muted)] transition hover:bg-[var(--brand-surface-muted)] hover:text-[var(--brand-text-main)]" onClick={tornaPanoramica}>
            ⊞ Modelli del «+» operatore
          </a>
          <a href="#archiviati" className="block rounded-[var(--radius-md)] px-3 py-1.5 text-[var(--brand-text-muted)] transition hover:bg-[var(--brand-surface-muted)] hover:text-[var(--brand-text-main)]" onClick={tornaPanoramica}>
            ▣ Archiviati ({archiviati.length})
          </a>
        </div>
      </div>
    </aside>
  );

  /* ── Render: panoramica (innesto «Registro»: KPI + chip azioni) ───────── */

  const panoramica = (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--brand-text-main)]">Azioni operatori</h2>
          <p className="mt-0.5 max-w-[70ch] text-[13px] text-[var(--brand-text-muted)]">
            Ogni attività ha le sue azioni: quello che l&apos;operatore compila sul campo. Le azioni valgono per i
            rapportini generati da adesso; titolo e dettagli si aggiornano anche su quelli già in mano agli operatori.
          </p>
        </div>
        <div className="flex gap-5 pt-1 text-right">
          {albero.committenti.map((c) => {
            const coperti = c.gruppi.filter((g) => flussoDiGruppo(c.committente, g.gruppo)).length;
            const ok = coperti === c.gruppi.length;
            return (
              <div key={c.committente}>
                <p className={`text-lg font-semibold leading-tight ${ok ? 'text-[var(--brand-text-main)]' : 'text-[var(--warning)]'}`}>
                  {coperti}/{c.gruppi.length}
                </p>
                <p className="text-[11px] text-[var(--brand-text-muted)]">{c.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {scoperte.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-[13px]">
          <span aria-hidden>⚠</span>
          <span className="min-w-0 flex-1">
            <b className="font-semibold">{scoperte[0].gruppo}</b> ({COMMITTENTE_FLUSSO_LABEL[scoperte[0].committente]}) non ha azioni:
            gli interventi arrivano al telefono senza nulla da compilare.
          </span>
          <button
            type="button"
            onClick={() => apriGruppo(scoperte[0].committente, scoperte[0].gruppo)}
            className="shrink-0 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--on-primary)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--brand-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            Configura ora
          </button>
        </div>
      )}

      <CardBox className="overflow-hidden">
        {albero.committenti.map((c) => (
          <div key={c.committente}>
            <p className="flex items-center gap-2 px-4 pb-1.5 pt-3 text-xs font-semibold text-[var(--brand-text-muted)]">
              {c.label} <span className="font-normal text-[var(--brand-text-subtle)]">· {c.gruppi.length} attività</span>
              <span aria-hidden className="h-px flex-1 bg-[var(--brand-border)]" />
            </p>
            {c.gruppi.map((g) => {
              const win = flussoDiGruppo(c.committente, g.gruppo);
              const prime = (win?.campi ?? []).slice().sort((a, b) => a.ordine - b.ordine).slice(0, 3);
              const extra = (win?.campi.length ?? 0) - prime.length;
              const condiviso = (win?.gruppi_attivita?.length ?? 0) > 1;
              return (
                <button
                  key={g.gruppo}
                  type="button"
                  onClick={() => apriGruppo(c.committente, g.gruppo)}
                  className="grid w-full grid-cols-1 items-center gap-x-4 gap-y-1 border-b border-[var(--brand-border)] px-4 py-2.5 text-left transition last:border-b-0 hover:bg-[var(--brand-primary-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)] md:grid-cols-[minmax(180px,1fr)_minmax(0,1.6fr)_110px_70px]"
                >
                  <span className="flex min-w-0 items-center gap-2.5 text-[13.5px] font-medium text-[var(--brand-text-main)]">
                    <Dot tone={win ? 'ok' : 'warn'} />
                    <span className="truncate">{g.gruppo}</span>
                    {win && tagNatura(win).filter((n) => n !== 'manuale (+)').map((n) => (
                      <span key={n} className="shrink-0 rounded border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{n}</span>
                    ))}
                    {condiviso && <span className="shrink-0 rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-px text-[9.5px] font-medium text-[var(--brand-text-muted)]">condiviso</span>}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {win ? (
                      <>
                        {prime.map((cp) => <ChipAzione key={cp.chiave} campo={cp} />)}
                        {extra > 0 && <span className="rounded-full border border-dashed border-[var(--brand-border-strong)] px-2 py-0.5 text-[10.5px] text-[var(--brand-text-subtle)]">＋{extra}</span>}
                      </>
                    ) : (
                      <span className="rounded-full border border-dashed border-[var(--warning)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--warning)]">nessuna azione configurata</span>
                    )}
                  </span>
                  <span>{win ? <Pill tone="ok">{win.campi.length} azioni</Pill> : <Pill tone="warn">scoperta</Pill>}</span>
                  <span className="text-right text-[11.5px] text-[var(--brand-text-subtle)]">{dataBreve(win?.updated_at)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </CardBox>

      {albero.nonCollegati.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1 text-sm font-semibold text-[var(--brand-text-main)]">Da sistemare — flussi non collegati</h3>
          <p className="mb-2 text-xs text-[var(--brand-text-muted)]">Attivi ma senza attività: non generano niente. Aprili e collegali (o archiviali).</p>
          <div className="flex flex-wrap gap-2">
            {albero.nonCollegati.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => apriFlusso(t as Template)}
                className="rounded-[var(--radius-lg)] border border-dashed border-[var(--warning)] bg-[var(--brand-surface)] px-3.5 py-2 text-left text-[13px] font-medium text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                {(t as Template).nome}
                <span className="block text-[11px] font-normal text-[var(--brand-text-muted)]">{(t as Template).campi.length} azioni · non collegato</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6" id="modelli-plus">
        <h3 className="mb-1 text-sm font-semibold text-[var(--brand-text-main)]">Modelli del «+» operatore</h3>
        <p className="mb-2 max-w-[75ch] text-xs text-[var(--brand-text-muted)]">
          Cosa compila l&apos;operatore quando crea un intervento dal «+». <b className="font-semibold">Uno per committente</b>:
          se lo slot è vuoto, il «+» eredita le azioni standard del rapportino.
        </p>
        <CardBox className="overflow-hidden">
          {COMMITTENTI_PLUS.map(({ v, label }) => {
            const slot = slotPlus.get(v);
            return (
              <div key={v} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--brand-border)] px-4 py-2.5 text-[13px] last:border-b-0">
                <span className="text-xs font-semibold text-[var(--brand-text-main)]">{label}</span>
                {slot ? (
                  <button type="button" onClick={() => apriFlusso(slot)} className="min-w-0 truncate text-left font-medium text-[var(--brand-text-main)] underline-offset-2 transition hover:text-[var(--primary-text)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
                    {slot.nome}
                    <span className="ml-2 text-[11.5px] font-normal text-[var(--brand-text-muted)]">{slot.campi.length} azioni</span>
                  </button>
                ) : (
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-[var(--brand-text-subtle)]">
                    Nessun modello — il «+» eredita le azioni standard
                    <button
                      type="button"
                      onClick={() => { startNew({ soloManuale: true, committente: v }); setVista({ t: 'flusso', id: '__nuovo__' }); }}
                      className="rounded-[var(--radius-md)] border border-dashed border-[var(--brand-primary)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--primary-text)] transition hover:bg-[var(--brand-primary-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                    >
                      ＋ Crea
                    </button>
                  </span>
                )}
                <span>{slot ? <Pill tone="ok">attivo</Pill> : <Pill tone="mut">eredita</Pill>}</span>
              </div>
            );
          })}
          {riservatoPI && (
            <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="text-xs font-semibold text-[var(--brand-text-main)]">Modulo P.I.</span>
              <button type="button" onClick={() => apriFlusso(riservatoPI)} className="min-w-0 truncate text-left font-medium text-[var(--brand-text-main)] underline-offset-2 transition hover:text-[var(--primary-text)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
                {riservatoPI.nome}
                <span className="ml-2 text-[11.5px] font-normal text-[var(--brand-text-muted)]">usato dai token P.I. — non alimenta il «+»</span>
              </button>
              <Pill tone="primary">riservato P.I.</Pill>
            </div>
          )}
        </CardBox>
      </div>

      {archiviati.length > 0 && (
        <details className="mt-6" id="archiviati">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--brand-text-muted)] transition hover:text-[var(--brand-text-main)]">
            ▸ Archiviati ({archiviati.length}) — fuori uso, riattivabili
          </summary>
          <div className="mt-2 space-y-2">
            {archiviati.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border-strong)] px-4 py-2.5 text-[12.5px] text-[var(--brand-text-muted)]">
                <span aria-hidden>▣</span>
                <span className="min-w-0 flex-1">
                  <b className="font-semibold text-[var(--brand-text-main)]">{t.nome}</b>
                  {tagNatura(t).length > 0 && <span> · {tagNatura(t).join(' · ')}</span>}
                  <span> · {t.campi.length} azioni</span>
                </span>
                <button
                  type="button"
                  onClick={async () => { if (await impostaActive(t.id, true)) showFeedback('success', `«${t.nome}» riattivato`); }}
                  className="rounded-[var(--radius-md)] border border-[var(--brand-border-strong)] px-3 py-1 text-[12px] font-medium text-[var(--brand-text-main)] transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  Riattiva
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );

  /* ── Render: avvio guidato per attività scoperta ──────────────────────── */

  const candidatiDuplica = gruppoVista
    ? attivi
        .filter((t) => !t.solo_manuale && t.campi.length > 0)
        .sort((a, b) => b.campi.length - a.campi.length)
        .slice(0, 2)
    : [];

  const avvioScoperta = gruppoVista && (
    <div className="rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--brand-border-strong)] bg-[var(--brand-surface)] p-8 text-center">
      <div aria-hidden className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[var(--brand-primary-soft)] text-lg text-[var(--primary-text)]">＋</div>
      <h3 className="text-[15px] font-semibold text-[var(--brand-text-main)]">Quali azioni deve fare l&apos;operatore?</h3>
      <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] text-[var(--brand-text-muted)]">
        Oggi gli interventi di «{gruppoVista.gruppo}» arrivano al telefono <b className="font-semibold">senza azioni da compilare</b>.
        Parti da zero o duplica un flusso che assomiglia.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={() => startNew({ nome: gruppoVista.gruppo, gruppoCommittente: gruppoVista.committente, gruppiAttivita: [gruppoVista.gruppo] })}
          className="rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 py-2 text-[13px] font-medium text-[var(--on-primary)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--brand-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          ＋ Prima azione
        </button>
        {candidatiDuplica.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => startNew({ nome: gruppoVista.gruppo, gruppoCommittente: gruppoVista.committente, gruppiAttivita: [gruppoVista.gruppo], da: t })}
            className="rounded-[var(--radius-md)] border border-[var(--brand-border-strong)] px-4 py-2 text-[13px] font-medium text-[var(--brand-text-main)] transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            Duplica da «{t.nome}» ({t.campi.length} azioni)
          </button>
        ))}
      </div>
    </div>
  );

  /* ── Render: editor ───────────────────────────────────────────────────── */

  const editor = isEditing && (
    <div className="min-w-0 flex-1 space-y-4">
      {/* Header: nome + stato salvataggio + contesto */}
      <CardBox className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="min-w-[200px] flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-2.5 py-1.5 text-[17px] font-semibold text-[var(--brand-text-main)] placeholder-[var(--brand-text-subtle)] transition hover:bg-[var(--brand-surface-muted)] focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
            placeholder="Nome del flusso (es. DUNNING)"
            aria-label="Nome del flusso"
          />
          {isNew ? (
            <button
              type="button"
              onClick={handleCrea}
              disabled={saving || Boolean(motivoBlocco)}
              title={motivoBlocco ?? undefined}
              className="rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-[var(--on-primary)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              {saving ? 'Creazione…' : 'Crea flusso'}
            </button>
          ) : (
            <span aria-live="polite"><SavePill /></span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--brand-text-muted)]">
          <span>Si usa per: <b className="font-semibold text-[var(--primary-text)]">{contestoLabel}</b></span>
          {selectedTpl && tagNatura(selectedTpl).map((n) => (
            <span key={n} className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">{n}</span>
          ))}
          {altriFlussiDelGruppo.length > 0 && (
            <span className="flex items-center gap-1.5">
              · altri flussi su questa attività:
              {altriFlussiDelGruppo.map((f) => (
                <button key={f.id} type="button" onClick={() => loadTemplate(f as Template)} className="font-medium text-[var(--primary-text)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
                  {(f as Template).nome}
                </button>
              ))}
            </span>
          )}
        </div>
        {isNew && motivoBlocco && (
          <p className="mt-2 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-3 py-1.5 text-xs font-medium text-[var(--warning)]">
            Per creare il flusso: {motivoBlocco}.
          </p>
        )}
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--brand-surface-muted)] px-3 py-2 text-xs text-[var(--brand-text-muted)]">
          <span aria-hidden className="mt-px">ⓘ</span>
          <span><b className="font-semibold">Le azioni</b> valgono per i rapportini generati da adesso. <b className="font-semibold">Titolo e dettagli</b> si aggiornano anche sui rapportini già in mano agli operatori oggi.</span>
        </p>
      </CardBox>

      {/* Azioni — il cuore del modulo */}
      <CardBox>
        <div className="flex items-center gap-2.5 border-b border-[var(--brand-border)] px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[var(--brand-text-main)]">Azioni per l&apos;operatore</h3>
          <span className="text-xs text-[var(--brand-text-muted)]">nell&apos;ordine in cui le vede</span>
          <button
            type="button"
            onClick={addCampo}
            className="ml-auto rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--on-primary)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--brand-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            ＋ Azione
          </button>
        </div>
        <div className="space-y-2 px-5 py-4">
          {campi.length === 0 && (
            <p className="text-sm text-[var(--brand-text-muted)]">Nessuna azione. Aggiungine una con «＋ Azione»: la vedrai comparire nel telefono qui accanto.</p>
          )}
          {campi.map((campo, idx) => (
            <div key={idx} className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2.5 transition hover:border-[var(--brand-border-strong)] hover:shadow-[var(--shadow-md)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex shrink-0 flex-col">
                  <button type="button" onClick={() => moveCampo(idx, -1)} disabled={idx === 0} title="Sposta su"
                    className="rounded-t-[var(--radius-sm)] border border-b-0 border-[var(--brand-border)] px-1.5 text-[10px] leading-4 text-[var(--brand-text-muted)] transition hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▲</button>
                  <button type="button" onClick={() => moveCampo(idx, 1)} disabled={idx === campi.length - 1} title="Sposta giù"
                    className="rounded-b-[var(--radius-sm)] border border-[var(--brand-border)] px-1.5 text-[10px] leading-4 text-[var(--brand-text-muted)] transition hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▼</button>
                </span>
                <span className="w-4 shrink-0 text-right text-[11px] font-semibold text-[var(--brand-text-subtle)]">{idx + 1}</span>
                <input
                  type="text"
                  value={campo.etichetta}
                  onChange={(e) => updateCampo(idx, { etichetta: e.target.value })}
                  className={`min-w-[150px] flex-1 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[13.5px] font-medium text-[var(--brand-text-main)] placeholder-[var(--brand-text-subtle)] transition focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)] ${campo.etichetta.trim() ? 'border-[var(--brand-border)]' : 'border-[var(--warning)]'}`}
                  placeholder="Cosa deve fare? es. Foto contatore"
                  aria-label={`Etichetta azione ${idx + 1}`}
                />
                <select
                  value={campo.tipo}
                  onChange={(e) => updateCampo(idx, { tipo: e.target.value as TemplateCampo['tipo'] })}
                  title="Tipo di risposta"
                  className="w-44 rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2 py-1.5 text-[12.5px] text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                >
                  {(Object.keys(TIPO_LABELS) as TemplateCampo['tipo'][]).map((t) => (
                    <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                  ))}
                </select>
                {!(tipo === 'risanamento' && campo.tipo === 'foto' && (campo.scope_foto ?? 'misuratore') === 'accessoria') && (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-[var(--brand-text-main)]">
                    <input
                      type="checkbox"
                      checked={campo.obbligatoria === true}
                      onChange={(e) => updateCampo(idx, { obbligatoria: e.target.checked })}
                      className="h-4 w-4 accent-[var(--brand-primary)]"
                    />
                    Obbligatoria
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => removeCampo(idx)}
                  title="Rimuovi azione"
                  className="shrink-0 rounded-[var(--radius-md)] border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  ✕
                </button>
              </div>

              {campo.tipo === 'select' && (
                <div className="mt-2 pl-9">
                  <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Scelte possibili (una per riga)</label>
                  <textarea
                    rows={3}
                    value={(campo.opzioni ?? []).join('\n')}
                    onChange={(e) => updateCampo(idx, { opzioni: e.target.value.split('\n') })}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2.5 py-1.5 text-[13px] text-[var(--brand-text-main)] placeholder-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                    placeholder={'SI\nNO'}
                  />
                </div>
              )}

              {campo.tipo === 'foto' && tipo === 'risanamento' && (
                <div className="mt-2 pl-9">
                  <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Sezione foto</label>
                  <select
                    value={campo.scope_foto ?? 'misuratore'}
                    onChange={(e) => {
                      const scope = e.target.value as 'misuratore' | 'fase' | 'accessoria';
                      // Accessoria = sempre opzionale; uscendo riporta obbligatoria al neutro (undefined).
                      updateCampo(idx, scope === 'accessoria' ? { scope_foto: scope, obbligatoria: false } : { scope_foto: scope, obbligatoria: undefined });
                    }}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2.5 py-1.5 text-[13px] text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                  >
                    {SCOPE_FOTO.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}

          {tipo === 'risanamento' && haCampiFoto && (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3 text-xs">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima sezioni foto</p>
              {SCOPE_FOTO.map((s) => {
                const slots = campi.filter((c) => c.tipo === 'foto' && (c.scope_foto ?? 'misuratore') === s.v);
                if (slots.length === 0) return null;
                return (
                  <p key={s.v} className="mb-0.5">
                    <span className="font-medium text-[var(--brand-text-main)]">{s.label}{s.v !== 'misuratore' ? ' (più foto)' : ''}:</span>{' '}
                    <span className="text-[var(--brand-text-muted)]">
                      {slots.map((c) => `${c.etichetta || '(senza nome)'}${s.v !== 'accessoria' && c.obbligatoria ? ' *' : ''}`).join(', ')}
                    </span>
                  </p>
                );
              })}
              <p className="mt-1 text-[var(--brand-text-subtle)]">* obbligatoria · (più foto) = l&apos;operatore può caricarne diverse</p>
            </div>
          )}
        </div>
      </CardBox>

      {/* Titolo e dettagli della card */}
      <CardBox>
        <div className="flex items-center gap-2.5 border-b border-[var(--brand-border)] px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[var(--brand-text-main)]">{soloManuale ? 'Anagrafica da compilare (+)' : 'Titolo e dettagli della card'}</h3>
          <span className="text-xs text-[var(--brand-text-muted)]">{soloManuale ? 'i dati che chiede la modale «+»' : 'come si presenta il task'}</span>
        </div>
        <div className="px-5 py-4">
          {!soloManuale && (
            <div className="mb-5">
              <p className="text-[13px] font-semibold text-[var(--brand-text-main)]">Titolo</p>
              <p className="mb-2.5 mt-0.5 text-xs text-[var(--brand-text-muted)]">Si usa il primo dato non vuoto, nell&apos;ordine della lista. Lista vuota = Nominativo, poi Matricola, ODS/ODL, PDR.</p>
              <div className="mb-2.5 rounded-[var(--radius-lg)] border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] px-3 py-2 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--primary-text)]">L&apos;operatore leggerà: </span>
                <span className="font-semibold text-[var(--brand-text-main)]">«{titoloVoce(anteprimaVoce, titoloCampi, 0)}»</span>
              </div>
              <div className="space-y-1.5">
                {titoloCampi.map((chiave, idx) => {
                  const def = INFO_CAMPI_DISPONIBILI.find((d) => d.chiave === chiave);
                  const esempio = valoreInfo(anteprimaVoce, chiave);
                  const usato = idx === titoloCampi.findIndex((k) => valoreInfo(anteprimaVoce, k) !== '');
                  return (
                    <div key={chiave} className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2 ${usato ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)]'}`}>
                      <span className="text-[13px] font-medium text-[var(--brand-text-main)]">{idx + 1}. {def?.etichettaDefault ?? chiave}</span>
                      <span className="min-w-[110px] flex-1 truncate text-xs text-[var(--brand-text-muted)]">
                        es. {esempio || '—'}{usato ? ' ← fa da titolo' : ''}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={() => moveTitolo(idx, -1)} disabled={idx === 0} title="Sposta su" className="rounded-[var(--radius-sm)] border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▲</button>
                        <button type="button" onClick={() => moveTitolo(idx, 1)} disabled={idx === titoloCampi.length - 1} title="Sposta giù" className="rounded-[var(--radius-sm)] border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▼</button>
                        <button type="button" onClick={() => toggleTitolo(chiave)} title="Rimuovi" className="rounded-[var(--radius-sm)] border border-[var(--danger)] px-2 py-0.5 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">✕</button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {INFO_CAMPI_DISPONIBILI.filter((d) => d.chiave !== 'coordinate' && !titoloCampi.includes(d.chiave)).map((d) => (
                  <button key={d.chiave} type="button" onClick={() => toggleTitolo(d.chiave)}
                    className="rounded-full border border-dashed border-[var(--brand-border-strong)] px-3 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-solid hover:border-[var(--brand-primary)] hover:text-[var(--primary-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
                    ＋ {d.etichettaDefault}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[13px] font-semibold text-[var(--brand-text-main)]">{soloManuale ? 'Dati da compilare' : 'Dettagli mostrati sul task'}</p>
          <p className="mb-2.5 mt-0.5 text-xs text-[var(--brand-text-muted)]">
            {soloManuale
              ? 'Quali dati chiede la modale «+», con quale etichetta e in che ordine.'
              : 'Quali dati compaiono aprendo la card (e nell’Excel), con etichetta e ordine. Nessuna selezione = tutti gli 11 di default.'}
          </p>
          <div className="space-y-1.5">
            {infoCampi.map((c, idx) => (c.chiave === 'coordinate' ? null : (
              <div key={c.chiave} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
                <input
                  type="text"
                  value={c.etichetta}
                  onChange={(e) => updateInfoEtichetta(c.chiave, e.target.value)}
                  title={`Etichetta per ${c.chiave}`}
                  className="min-w-[130px] flex-1 rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2.5 py-1.5 text-[13px] text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                />
                <span className="min-w-[130px] flex-1 truncate text-xs text-[var(--brand-text-muted)]">
                  vedrà: <b className="font-semibold text-[var(--brand-text-main)]">{c.etichetta.trim() || '…'}:</b> {valoreInfo(anteprimaVoce, c.chiave) || '—'}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => moveInfo(idx, -1)} disabled={idx === 0} title="Sposta su" className="rounded-[var(--radius-sm)] border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▲</button>
                  <button type="button" onClick={() => moveInfo(idx, 1)} disabled={idx === infoCampi.length - 1} title="Sposta giù" className="rounded-[var(--radius-sm)] border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▼</button>
                  <button type="button" onClick={() => toggleInfo(c.chiave)} title="Rimuovi" className="rounded-[var(--radius-sm)] border border-[var(--danger)] px-2 py-0.5 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">✕</button>
                </span>
              </div>
            )))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {INFO_CAMPI_DISPONIBILI.filter((d) => d.chiave !== 'coordinate' && !infoCampi.some((c) => c.chiave === d.chiave)).map((d) => (
              <button key={d.chiave} type="button" onClick={() => toggleInfo(d.chiave)}
                className="rounded-full border border-dashed border-[var(--brand-border-strong)] px-3 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-solid hover:border-[var(--brand-primary)] hover:text-[var(--primary-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
                ＋ {d.etichettaDefault}
              </button>
            ))}
          </div>
          {!soloManuale && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-[var(--brand-text-main)]">
              <input
                type="checkbox"
                checked={infoCampi.some((c) => c.chiave === 'coordinate')}
                onChange={() => toggleInfo('coordinate')}
                className="h-4 w-4 accent-[var(--brand-primary)]"
              />
              Mostra il link «Punto esatto» (coordinate)
            </label>
          )}
        </div>
      </CardBox>

      {/* Avanzate — tutto il resto, chiuso di default */}
      <SezioneAccordion
        title="Impostazioni avanzate"
        subtitle="Copertura attività, natura del flusso, nomi foto, archiviazione. Di solito non serve toccarle."
      >
        <div className="space-y-5">
          <div>
            <p className="text-[13px] font-semibold text-[var(--brand-text-main)]">Copertura attività</p>
            <p className="mb-2 mt-0.5 text-xs text-[var(--brand-text-muted)]">Dove questo flusso compare e per quali attività genera le azioni. Un flusso può coprire più attività dello stesso committente.</p>
            <select
              value={gruppoCommittente}
              onChange={(e) => cambiaGruppoCommittente(e.target.value as CommittenteFlusso | '')}
              className="w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2.5 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
              aria-label="Committente della copertura"
            >
              <option value="">— Non collegato —</option>
              {COMMITTENTI_FLUSSO.map((c) => (
                <option key={c} value={c}>{COMMITTENTE_FLUSSO_LABEL[c]}</option>
              ))}
            </select>
            {gruppoCommittente ? (
              <>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {gruppiDisponibili.map((g) => {
                    const attivo = gruppiAttivita.some((x) => chiaveTassonomia(x) === chiaveTassonomia(g));
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGruppo(g)}
                        aria-pressed={attivo}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                          attivo
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
                            : 'border-dashed border-[var(--brand-border-strong)] text-[var(--brand-text-muted)] hover:border-solid hover:border-[var(--brand-primary)] hover:text-[var(--primary-text)]'
                        }`}
                      >
                        {attivo ? '✓ ' : '＋ '}{g}
                      </button>
                    );
                  })}
                </div>
                {gruppiAttivita.length === 0 && (
                  <p className="mt-1.5 text-xs font-medium text-[var(--danger)]">Scegli almeno un&apos;attività: senza, il flusso resta tra i «Da sistemare».</p>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-xs text-[var(--brand-text-muted)]">Non collegato: il flusso resta visibile in panoramica tra i «Da sistemare».</p>
            )}
          </div>

          <div className="border-t border-[var(--brand-border)] pt-4">
            <p className="text-[13px] font-semibold text-[var(--brand-text-main)]">Natura del flusso</p>
            <p className="mb-2 mt-0.5 text-xs text-[var(--brand-text-muted)]">Modello manuale, tipo risanamento, task-via. Se non sai cosa sono, lasciali come stanno.</p>
            <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
              <input type="checkbox" checked={soloManuale} onChange={(e) => setSoloManuale(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]" />
              <span className="text-xs text-[var(--brand-text-muted)]">
                <b className="font-semibold text-[var(--brand-text-main)]">Modello manuale (+)</b> — usato dalla modale «+» dell&apos;operatore invece che dai rapportini pianificati.
              </span>
            </label>

            {soloManuale && !selectedTpl?.riservato_pi && (
              <div className="mb-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                  Committente del «+»<span className="text-[var(--danger)]"> *</span>
                </label>
                <select
                  value={committente}
                  onChange={(e) => setCommittente(e.target.value as Committente | '')}
                  className={`w-full rounded-[var(--radius-md)] border px-2.5 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)] ${committente ? 'border-[var(--brand-border)]' : 'border-[var(--warning)]'}`}
                >
                  <option value="">— Scegli il committente —</option>
                  {COMMITTENTI_PLUS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-[var(--brand-text-muted)]">Instrada la modale «+»: un solo modello attivo per committente.</p>
              </div>
            )}
            {selectedTpl?.riservato_pi && (
              <p className="mb-2 rounded-[var(--radius-md)] bg-[var(--brand-primary-soft)] px-3 py-2 text-xs text-[var(--primary-text)]">
                Riservato al modulo Pronto Intervento: non alimenta il «+» degli operatori.
              </p>
            )}

            {!soloManuale && (
              <>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Tipo rapportino</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as 'standard' | 'risanamento')}
                  className="mb-2 w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2.5 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary-soft)]"
                >
                  <option value="standard">Standard</option>
                  <option value="risanamento">Risanamento colonne</option>
                </select>
                <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                  <input type="checkbox" checked={taskVia} onChange={(e) => { setTaskVia(e.target.checked); if (e.target.checked) setTaskViaIbrido(false); }} className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]" />
                  <span className="text-xs text-[var(--brand-text-muted)]">
                    <b className="font-semibold text-[var(--brand-text-main)]">Task-via (solo via)</b> — i rapportini mostrano il contenitore indirizzo con il tasto <b>+</b>: l&apos;operatore crea gli interventi sotto la via.
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                  <input type="checkbox" checked={taskViaIbrido} onChange={(e) => { setTaskViaIbrido(e.target.checked); if (e.target.checked) setTaskVia(false); }} className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]" />
                  <span className="text-xs text-[var(--brand-text-muted)]">
                    <b className="font-semibold text-[var(--brand-text-main)]">Ibrido (classiche + BONIFICHE EXTRA)</b> — convivono attività classiche e voci BONIFICHE EXTRA, che diventano contenitori a sola via col tasto <b>+</b>. Pensato per Italgas.
                  </span>
                </label>
              </>
            )}
          </div>

          {haCampiFoto && (
            <div className="border-t border-[var(--brand-border)] pt-4">
              <p className="text-[13px] font-semibold text-[var(--brand-text-main)]">Foto — priorità nome file</p>
              <p className="mb-2 mt-0.5 text-xs text-[var(--brand-text-muted)]">
                Le foto vengono rinominate come <code className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-1.5 py-px">&lt;identificativo&gt;_&lt;tipo foto&gt;</code>: il primo campo non vuoto della lista. Lista vuota = PDR → Matricola → ODS/ODL → Indirizzo.
              </p>
              <div className="space-y-1.5">
                {fotoIdPriority.map((chiave, idx) => {
                  const def = FOTO_ID_CAMPI.find((d) => d.chiave === chiave);
                  return (
                    <div key={chiave} className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2">
                      <span className="flex-1 text-[13px] font-medium text-[var(--brand-text-main)]">{idx + 1}. {def?.etichetta ?? chiave}</span>
                      <button type="button" onClick={() => moveFotoId(idx, -1)} disabled={idx === 0} title="Sposta su" className="rounded-[var(--radius-sm)] border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▲</button>
                      <button type="button" onClick={() => moveFotoId(idx, 1)} disabled={idx === fotoIdPriority.length - 1} title="Sposta giù" className="rounded-[var(--radius-sm)] border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">▼</button>
                      <button type="button" onClick={() => toggleFotoId(chiave)} className="rounded-[var(--radius-sm)] border border-[var(--danger)] px-2 py-0.5 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">Rimuovi</button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FOTO_ID_CAMPI.filter((d) => !fotoIdPriority.includes(d.chiave)).map((d) => (
                  <button key={d.chiave} type="button" onClick={() => toggleFotoId(d.chiave)}
                    className="rounded-full border border-dashed border-[var(--brand-border-strong)] px-3 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-solid hover:border-[var(--brand-primary)] hover:text-[var(--primary-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">
                    ＋ {d.etichetta}
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3">
                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima nome file (primo campo foto)</p>
                <code className="text-sm text-[var(--brand-text-main)]">{anteprimaNomeFoto}</code>
              </div>
            </div>
          )}

          {!isNew && selectedTpl && (
            <div className="border-t border-[var(--brand-border)] pt-4">
              <p className="text-[13px] font-semibold text-[var(--brand-text-main)]">Archiviazione</p>
              <p className="mb-2 mt-0.5 max-w-[65ch] text-xs text-[var(--brand-text-muted)]">
                Il flusso esce dall&apos;uso senza sparire: i rapportini già generati non cambiano e puoi riattivarlo quando vuoi.
                L&apos;eliminazione definitiva resta possibile, ma l&apos;archiviazione è quasi sempre la scelta giusta.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleArchivia}
                  className="rounded-[var(--radius-md)] border border-[var(--brand-border-strong)] px-4 py-2 text-sm font-medium text-[var(--brand-text-main)] transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  ▣ Archivia flusso
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-[var(--radius-md)] border border-[var(--danger)] px-4 py-2 text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--danger-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  Elimina per sempre
                </button>
              </div>
            </div>
          )}
        </div>
      </SezioneAccordion>
    </div>
  );

  /* ── Render: colonna telefono ─────────────────────────────────────────── */

  const colonnaTelefono = (isEditing || gruppoScoperto) && (
    <aside className="w-full shrink-0 xl:w-[340px]">
      <div className="xl:sticky xl:top-4">
        <p className="mb-2 flex items-center gap-2 text-xs text-[var(--brand-text-muted)]">
          Telefono dell&apos;operatore
          {gruppoScoperto
            ? <span className="ml-auto"><Pill tone="warn">com&apos;è adesso</Pill></span>
            : <span className="ml-auto"><Pill tone="ok">anteprima fedele</Pill></span>}
        </p>
        <Telefono
          campi={campi}
          infoCampi={infoCampi}
          titoloCampi={titoloCampi}
          soloManuale={soloManuale}
          coordinataAbilitata={infoCampi.some((c) => c.chiave === 'coordinate')}
          scoperto={gruppoScoperto}
          nomeAttivita={gruppoVista?.gruppo}
        />
        {isNew && <ChecklistVerifica campi={campi} titoloCampi={titoloCampi} />}
      </div>
    </aside>
  );

  /* ── Layout ───────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {rail}

      {vista.t === 'panoramica' ? (
        panoramica
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-6 xl:flex-row">
          {isEditing ? editor : (
            <div className="min-w-0 flex-1">
              {gruppoVista && (
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-[var(--brand-text-main)]">{gruppoVista.gruppo}</h2>
                  <p className="text-[13px] text-[var(--brand-text-muted)]">{COMMITTENTE_FLUSSO_LABEL[gruppoVista.committente]} · <b className="font-medium text-[var(--warning)]">nessuna azione configurata</b></p>
                </div>
              )}
              {avvioScoperta}
            </div>
          )}
          {colonnaTelefono}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 rounded-[var(--radius-lg)] border px-4 py-3 text-sm font-medium shadow-[var(--shadow-lg)] ${
            feedback.type === 'success'
              ? 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]'
              : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          }`}
        >
          {feedback.type === 'success' ? '✓ ' : '✗ '}{feedback.message}
        </div>
      )}
    </div>
  );
}
