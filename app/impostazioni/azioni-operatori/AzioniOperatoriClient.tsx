'use client';
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
  COMMITTENTE_FLUSSO_LABEL,
  type CommittenteFlusso,
  type TassonomiaGruppoRiga,
} from '@/lib/rapportini/flussiGruppo';

const SCOPE_FOTO: { v: 'misuratore' | 'fase' | 'accessoria'; label: string }[] = [
  { v: 'misuratore', label: 'Misuratore (prima/dopo)' },
  { v: 'fase', label: 'Fase lavorazione' },
  { v: 'accessoria', label: 'Accessoria opzionale' },
];

type Committente = 'acea' | 'italgas' | 'altro' | 'lim_massive';

type Template = {
  id: string;
  nome: string;
  committente?: Committente | null;
  campi: TemplateCampo[];
  info_campi?: TemplateInfoCampo[];
  titolo_campi?: InfoChiave[];
  foto_id_priority?: FotoIdCampo[];
  is_default: boolean;
  active: boolean;
  solo_manuale?: boolean;
  task_via?: boolean;
  task_via_ibrido?: boolean;
  tipo?: 'standard' | 'risanamento';
  gruppo_committente?: string | null;
  gruppi_attivita?: string[] | null;
  updated_at?: string;
};

type Props = { initial: Template[]; tassonomia: TassonomiaGruppoRiga[] };

type Feedback = { type: 'success' | 'error'; message: string };

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function newCampo(n: number): TemplateCampo {
  return { chiave: `campo_${n}`, etichetta: '', tipo: 'testo', ordine: n };
}

function AnteprimaBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima</p>
      <div className="mx-auto max-w-[420px] rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
        {children}
      </div>
    </div>
  );
}

/** Blocco tematico dentro "Impostazioni avanzate": titolo + contenuto, separati da una riga. */
function BloccoAvanzato({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--brand-border)] pt-4 first:border-t-0 first:pt-0">
      <p className="text-sm font-semibold text-[var(--brand-text-main)]">{title}</p>
      {hint && <p className="mb-3 mt-0.5 text-xs text-[var(--brand-text-muted)]">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}

/** Etichette semplici, pensate per il backoffice. */
const TIPO_LABELS: Record<TemplateCampo['tipo'], string> = {
  crocetta: 'Casella da spuntare',
  testo: 'Testo libero',
  select: 'Scelta da elenco',
  numero: 'Numero',
  foto: 'Foto',
  ora: 'Ora',
};

/** Riassunto del flusso nelle liste: n azioni + natura. */
function sottotitoloFlusso(t: Template): string {
  const parti = [`${t.campi?.length ?? 0} azioni`];
  if (t.solo_manuale) parti.push('manuale (+)');
  if (t.task_via) parti.push('task-via');
  if (t.task_via_ibrido) parti.push('ibrido task-via');
  if (t.tipo === 'risanamento') parti.push('risanamento');
  return parti.join(' · ');
}

export default function AzioniOperatoriClient({ initial, tassonomia }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [committenteSel, setCommittenteSel] = useState<CommittenteFlusso | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [nome, setNome] = useState('');
  const [committente, setCommittente] = useState<Committente | ''>('');
  const [soloManuale, setSoloManuale] = useState(false);
  const [tipo, setTipo] = useState<'standard' | 'risanamento'>('standard');
  // Flag "task-via" (solo via): i rapportini generati con questo flusso mostrano il contenitore + "+".
  const [taskVia, setTaskVia] = useState(false);
  // Flag "ibrido": attività classiche + voci BONIFICHE EXTRA (task-via) nello stesso rapportino.
  const [taskViaIbrido, setTaskViaIbrido] = useState(false);
  // Collegamento al flowchart: committente della gerarchia + gruppi attività coperti dal flusso.
  const [gruppoCommittente, setGruppoCommittente] = useState<CommittenteFlusso | ''>('');
  const [gruppiAttivita, setGruppiAttivita] = useState<string[]>([]);
  const [campi, setCampi] = useState<TemplateCampo[]>([]);
  const [infoCampi, setInfoCampi] = useState<TemplateInfoCampo[]>([]);
  const [titoloCampi, setTitoloCampi] = useState<InfoChiave[]>([]);
  const [fotoIdPriority, setFotoIdPriority] = useState<FotoIdCampo[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Stato auto-save per i flussi esistenti (i nuovi si creano con "Crea flusso").
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Salta l'auto-save sul primo render dopo un load/startNew (non è una modifica utente).
  const skipAutosave = useRef(true);
  // "Version token" del flusso caricato (updated_at): inviato a ogni salvataggio per il lock
  // ottimistico. Se il DB è cambiato altrove (SQL/altra sessione) il salvataggio torna 409 e
  // l'editor ricarica invece di sovrascrivere con lo stato vecchio.
  const baseUpdatedAt = useRef<string | null>(null);
  // "Latest ref" al gestore conflitti: usato dall'auto-save senza metterlo nelle deps dell'effetto
  // (lo azzererebbe il debounce a ogni render).
  const conflictHandlerRef = useRef<(id: string) => void | Promise<void>>(() => {});

  // Albero del flowchart: COMMITTENTE → GRUPPO ATTIVITA' → flussi collegati.
  const albero = useMemo(() => buildAlberoFlussi(tassonomia, templates), [tassonomia, templates]);
  const nodoSel = albero.committenti.find((c) => c.committente === committenteSel) ?? null;

  // ── Helpers ────────────────────────────────────────────────────────────────

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
  } = {}) {
    skipAutosave.current = true;
    baseUpdatedAt.current = null;
    setAutoState('idle');
    setIsNew(true);
    setSelectedId(null);
    setNome(preset.nome ?? '');
    setCommittente(preset.committente ?? '');
    setSoloManuale(preset.soloManuale ?? false);
    setTipo('standard');
    setTaskVia(false);
    setTaskViaIbrido(false);
    setGruppoCommittente(preset.gruppoCommittente ?? '');
    setGruppiAttivita(preset.gruppiAttivita ?? []);
    setCampi([]);
    setInfoCampi([]);
    setTitoloCampi([]);
    setFotoIdPriority([]);
  }

  function chiudiEditor() {
    skipAutosave.current = true;
    setSelectedId(null);
    setIsNew(false);
  }

  function apriCommittente(c: CommittenteFlusso | null) {
    setCommittenteSel(c);
    chiudiEditor();
  }

  async function reloadTemplates() {
    const res = await fetch('/api/admin/rapportino-template');
    if (res.ok) {
      const data: Template[] = await res.json();
      setTemplates(data);
    }
  }

  // Conflitto di concorrenza (409): il flusso è stato cambiato altrove (SQL/altra sessione).
  // Ricarica dal DB la versione aggiornata invece di sovrascriverla con lo stato vecchio.
  async function handleConflict(id: string) {
    const res = await fetch('/api/admin/rapportino-template');
    if (!res.ok) return;
    const data: Template[] = await res.json();
    setTemplates(data);
    const tpl = data.find((t) => t.id === id);
    if (tpl) loadTemplate(tpl); // resetta stato + baseUpdatedAt + skipAutosave
    showFeedback('error', 'Flusso modificato altrove: ho ricaricato la versione aggiornata. Riapplica le tue modifiche.');
  }
  conflictHandlerRef.current = handleConflict;

  // ── Campo operations ───────────────────────────────────────────────────────

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

  // ── Info helpers ───────────────────────────────────────────────────────────

  function toggleInfo(chiave: InfoChiave) {
    setInfoCampi((prev) => {
      if (prev.some((c) => c.chiave === chiave)) {
        return prev.filter((c) => c.chiave !== chiave).map((c, i) => ({ ...c, ordine: i + 1 }));
      }
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
    setFotoIdPriority((prev) =>
      prev.includes(chiave) ? prev.filter((c) => c !== chiave) : [...prev, chiave],
    );
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

  // ── Collegamento al gruppo attività ────────────────────────────────────────

  /** Gruppi proponibili per il committente scelto nell'editor (albero + eventuali già selezionati). */
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
    setGruppiAttivita([]); // i gruppi appartengono al committente: cambiandolo si riparte
  }

  // ── Save ───────────────────────────────────────────────────────────────────

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
      active: true,
    };
  }

  async function handleSave() {
    if (!nome.trim()) { showFeedback('error', 'Il nome del flusso è obbligatorio'); return; }
    if (campi.length === 0) { showFeedback('error', 'Aggiungi almeno un\'azione'); return; }
    for (const c of campi) {
      if (!c.etichetta.trim()) { showFeedback('error', 'Tutte le azioni devono avere un\'etichetta'); return; }
    }

    const errComm = erroreCommittenteManuale({ solo_manuale: soloManuale, committente: committente || null });
    if (errComm) { showFeedback('error', errComm); return; }

    setSaving(true);
    try {
      const payload = {
        ...payloadCorrente(),
        ...(isNew ? {} : { id: selectedId, expected_updated_at: baseUpdatedAt.current }),
      };

      const res = await fetch('/api/admin/rapportino-template', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.status === 409 && selectedId) { await handleConflict(selectedId); return; }
      if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante il salvataggio'); return; }

      if (typeof json.updated_at === 'string') baseUpdatedAt.current = json.updated_at;
      showFeedback('success', isNew ? 'Flusso creato' : 'Flusso aggiornato');
      await reloadTemplates();

      if (isNew && json.id) {
        // Passaggio nuovo → esistente: non far scattare un auto-save immediato.
        skipAutosave.current = true;
        setIsNew(false);
        setSelectedId(json.id);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!selectedId) return;
    const tpl = templates.find((t) => t.id === selectedId);
    if (!confirm(`Confermi di eliminare il flusso "${tpl?.nome}"?`)) return;

    const res = await fetch(`/api/admin/rapportino-template?id=${selectedId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante l\'eliminazione'); return; }

    showFeedback('success', 'Flusso eliminato');
    await reloadTemplates();
    chiudiEditor();
    setNome('');
    setCampi([]);
  }

  // ── Auto-save (flussi esistenti, con debounce) ───────────────────────────────
  useEffect(() => {
    // Salta il run dovuto a load/startNew/mount: non è una modifica dell'utente.
    if (skipAutosave.current) { skipAutosave.current = false; return; }
    if (isNew || !selectedId) return; // i nuovi si salvano con "Crea flusso"
    const valido =
      nome.trim() !== '' && campi.length > 0 && campi.every((c) => c.etichetta.trim() !== '');
    const committenteOk = !erroreCommittenteManuale({ solo_manuale: soloManuale, committente: committente || null });
    if (!valido || !committenteOk) { setAutoState('idle'); return; }

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
        // Conflitto: il flusso è cambiato altrove (SQL/altra sessione) → NON sovrascrivere, ricarica.
        if (res.status === 409) { setAutoState('idle'); await conflictHandlerRef.current(id); return; }
        const json = await res.json().catch(() => ({} as { updated_at?: string }));
        if (res.ok && typeof json.updated_at === 'string') baseUpdatedAt.current = json.updated_at;
        setAutoState(res.ok ? 'saved' : 'error');
        if (res.ok) await reloadTemplates(); // l'albero a sinistra segue i collegamenti modificati
      } catch {
        setAutoState('error');
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, committente, soloManuale, tipo, taskVia, taskViaIbrido, gruppoCommittente, gruppiAttivita, campi, infoCampi, titoloCampi, fotoIdPriority, isNew, selectedId]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedTpl = templates.find((t) => t.id === selectedId);
  const isEditing = isNew || selectedTpl != null;

  const anteprimaDettaglio = partitionInfoCampi(infoCampi).dettaglio;
  const anteprimaVoce = { ...SAMPLE_VOCE_INFO, risposte: sampleRisposte(campi) };
  const anteprimaRiga: RigaVoce = {
    index: 0,
    titolo: titoloVoce(anteprimaVoce, titoloCampi, 0),
    sub: [SAMPLE_VOCE_INFO.via, SAMPLE_VOCE_INFO.comune].filter(Boolean).join(' · '),
    attivita: SAMPLE_VOCE_INFO.attivita,
    fascia: SAMPLE_VOCE_INFO.fascia_oraria,
    stato: 'da_fare',
  };

  const haCampiFoto = campi.some((c) => c.tipo === 'foto');
  const etichettaFotoEsempio = campi.find((c) => c.tipo === 'foto')?.etichetta?.trim() || 'Foto contatore';
  const anteprimaNomeFoto = nomeFotoFile(
    etichettaFotoEsempio,
    { pdr: '12345', matricola: 'M-678', odl: 'ODL-900', indirizzo: 'Via Roma 1' },
    'jpg',
    fotoIdPriority,
  );

  /** Riga leggibile del collegamento corrente, per l'header dell'editor. */
  const collegamentoLabel = gruppoCommittente && gruppiAttivita.length > 0
    ? `${COMMITTENTE_FLUSSO_LABEL[gruppoCommittente as CommittenteFlusso].toUpperCase()} → ${gruppiAttivita.join(' · ')}`
    : null;

  const cardFlusso = (t: Template) => (
    <div
      key={t.id}
      onClick={(e) => { e.stopPropagation(); loadTemplate(t); }}
      className={`cursor-pointer rounded-xl border p-3 transition ${
        selectedId === t.id && !isNew
          ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]'
          : 'border-[var(--brand-border)] bg-[var(--brand-surface)] hover:border-[var(--brand-primary)]'
      }`}
    >
      <p className="text-sm font-semibold text-[var(--brand-text-main)]">{t.nome}</p>
      <p className="text-xs text-[var(--brand-text-muted)]">{sottotitoloFlusso(t)}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ─── COLONNA SINISTRA: Committente → Gruppo attività → flussi ────────── */}
      <div className="flex w-full max-w-md flex-col gap-4">
        {committenteSel === null ? (
          <>
            <div>
              <h2 className="text-xl font-bold text-[var(--brand-text-main)]">Azioni operatori</h2>
              <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
                Scegli il committente, poi il gruppo attività: dentro trovi le azioni che l&apos;operatore compila.
              </p>
            </div>

            <div className="space-y-2">
              {albero.committenti.map((c) => {
                const flussiCollegati = new Set(c.gruppi.flatMap((g) => g.flussi.map((t) => t.id))).size;
                return (
                  <div
                    key={c.committente}
                    onClick={() => apriCommittente(c.committente)}
                    className="cursor-pointer rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 transition hover:border-[var(--brand-primary)]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold uppercase text-[var(--brand-text-main)]">{c.label}</span>
                      <span aria-hidden className="text-[var(--brand-text-muted)]">›</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
                      {c.gruppi.length} gruppi attività · {flussiCollegati} flussi
                      {c.manuali.length > 0 ? ` · ${c.manuali.length} manuali` : ''}
                    </p>
                  </div>
                );
              })}
            </div>

            {albero.nonCollegati.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">
                  Flussi non collegati
                </h3>
                <p className="mb-2 text-xs text-[var(--brand-text-muted)]">
                  Aprili e collegali a un gruppo da &quot;Impostazioni avanzate&quot;.
                </p>
                <div className="space-y-2">{albero.nonCollegati.map((t) => cardFlusso(t as Template))}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <button
                type="button"
                onClick={() => apriCommittente(null)}
                className="text-sm font-semibold text-[var(--brand-primary)] transition hover:opacity-80"
              >
                ← Tutti i committenti
              </button>
              <h2 className="mt-1 text-xl font-bold uppercase text-[var(--brand-text-main)]">
                {COMMITTENTE_FLUSSO_LABEL[committenteSel]}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
                Tocca un gruppo per aprire le sue azioni.
              </p>
            </div>

            <div className="space-y-2">
              {nodoSel?.gruppi.map((g) => {
                const unico = g.flussi.length === 1;
                return (
                  <div
                    key={g.gruppo}
                    onClick={unico ? () => loadTemplate(g.flussi[0] as Template) : undefined}
                    className={`rounded-2xl border bg-[var(--brand-surface)] p-4 transition ${
                      unico ? 'cursor-pointer hover:border-[var(--brand-primary)]' : ''
                    } ${
                      unico && selectedId === g.flussi[0].id && !isNew
                        ? 'border-[var(--brand-primary)]'
                        : 'border-[var(--brand-border)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--brand-text-main)]">{g.gruppo}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startNew({ nome: g.gruppo, gruppoCommittente: committenteSel, gruppiAttivita: [g.gruppo] });
                          }}
                          title="Crea un nuovo flusso collegato a questo gruppo"
                          className="rounded-lg border border-dashed border-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]"
                        >
                          ＋
                        </button>
                        {unico && <span aria-hidden className="text-[var(--brand-text-muted)]">›</span>}
                      </span>
                    </div>
                    {unico ? (
                      <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
                        {g.flussi[0].id === selectedId && !isNew ? 'Aperto qui a fianco · ' : ''}
                        {(g.flussi[0] as Template).nome} — {sottotitoloFlusso(g.flussi[0] as Template)}
                      </p>
                    ) : g.flussi.length === 0 ? (
                      <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
                        Nessun flusso: creane uno con ＋ (nome e collegamento sono già pronti).
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">{g.flussi.map((t) => cardFlusso(t as Template))}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">
                  Interventi manuali (+)
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    startNew({
                      soloManuale: true,
                      committente: committenteSel === 'acqualatina' ? '' : committenteSel,
                    })
                  }
                  className="rounded-lg border border-dashed border-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]"
                >
                  ＋ Modello manuale
                </button>
              </div>
              {nodoSel && nodoSel.manuali.length > 0 ? (
                <div className="space-y-2">{nodoSel.manuali.map((t) => cardFlusso(t as Template))}</div>
              ) : (
                <p className="text-xs text-[var(--brand-text-muted)]">
                  Nessun modello per il &quot;+&quot; dell&apos;operatore su questo committente.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── COLONNA DESTRA: Editor azioni ───────────────────────────────────── */}
      <div className="flex-1 space-y-4">
        {!isEditing ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
            <div className="text-center">
              <div className="mb-3 text-4xl">🧭</div>
              <p className="text-sm text-[var(--brand-text-muted)]">
                {committenteSel === null
                  ? 'Scegli un committente, poi il gruppo attività: qui trovi le azioni del flusso.'
                  : 'Tocca un gruppo per aprire le sue azioni.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Header: nome + collegamento + stato salvataggio ─────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="min-w-[220px] flex-1 rounded-lg border border-[var(--brand-border)] px-3 py-2 text-base font-semibold text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                  placeholder="Nome del flusso (es. DUNNING)"
                />
                {isNew ? (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? 'Creazione…' : 'Crea flusso'}
                  </button>
                ) : (
                  <span
                    aria-live="polite"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                      autoState === 'saved'
                        ? 'border-transparent bg-[var(--success-soft)] text-[var(--success)]'
                        : autoState === 'error'
                          ? 'border-transparent bg-[var(--danger-soft)] text-[var(--danger)]'
                          : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]'
                    }`}
                  >
                    {autoState === 'saving' && (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
                    )}
                    {autoState === 'saving'
                      ? 'Salvataggio…'
                      : autoState === 'saved'
                        ? 'Salvato ✓'
                        : autoState === 'error'
                          ? 'Non salvato — riprova'
                          : 'Le modifiche si salvano da sole'}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
                {soloManuale
                  ? 'Modello per il "+" dell\'operatore (interventi manuali).'
                  : collegamentoLabel
                    ? <>Si usa per: <b className="text-[var(--brand-text-main)]">{collegamentoLabel}</b></>
                    : 'Non collegato a un gruppo attività (si collega da Impostazioni avanzate).'}
              </p>
            </div>

            {/* ── Azioni per l'operatore — il cuore del modulo ────────────────── */}
            <SezioneAccordion
              title="Azioni per l'operatore"
              subtitle="Cosa compila sul campo, nell'ordine in cui lo vede. Spunta «Obbligatoria» per bloccare l'invio senza risposta."
              defaultOpen
            >
              {campi.length === 0 && (
                <p className="mb-4 text-sm text-[var(--brand-text-muted)]">Nessuna azione. Aggiungine una.</p>
              )}

              <div className="space-y-2">
                {campi.map((campo, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex shrink-0 flex-col">
                        <button type="button" onClick={() => moveCampo(idx, -1)} disabled={idx === 0}
                          className="rounded-t-lg border border-b-0 border-[var(--brand-border)] px-1.5 text-[10px] leading-4 text-[var(--brand-text-muted)] transition hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                        <button type="button" onClick={() => moveCampo(idx, 1)} disabled={idx === campi.length - 1}
                          className="rounded-b-lg border border-[var(--brand-border)] px-1.5 text-[10px] leading-4 text-[var(--brand-text-muted)] transition hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                      </div>
                      <input
                        type="text"
                        value={campo.etichetta}
                        onChange={(e) => updateCampo(idx, { etichetta: e.target.value })}
                        className="min-w-[160px] flex-1 rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                        placeholder="Cosa deve fare? es. Foto contatore"
                      />
                      <select
                        value={campo.tipo}
                        onChange={(e) => updateCampo(idx, { tipo: e.target.value as TemplateCampo['tipo'] })}
                        title="Tipo di risposta"
                        className="w-44 rounded-lg border border-[var(--brand-border)] px-2 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
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
                        className="shrink-0 rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                      >
                        ✕
                      </button>
                    </div>

                    {campo.tipo === 'select' && (
                      <div className="mt-2">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Scelte possibili (una per riga)
                        </label>
                        <textarea
                          rows={3}
                          value={(campo.opzioni ?? []).join('\n')}
                          onChange={(e) => updateCampo(idx, { opzioni: e.target.value.split('\n') })}
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                          placeholder={'SI\nNO'}
                        />
                      </div>
                    )}

                    {campo.tipo === 'foto' && tipo === 'risanamento' && (
                      <div className="mt-2">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">Sezione foto</label>
                        <select
                          value={campo.scope_foto ?? 'misuratore'}
                          onChange={(e) => {
                            const scope = e.target.value as 'misuratore' | 'fase' | 'accessoria';
                            // Accessoria = sempre opzionale; uscendo riporta obbligatoria al neutro (undefined), non 'false' residuo.
                            updateCampo(idx, scope === 'accessoria' ? { scope_foto: scope, obbligatoria: false } : { scope_foto: scope, obbligatoria: undefined });
                          }}
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                        >
                          {SCOPE_FOTO.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addCampo}
                className="mt-4 rounded-lg border border-dashed border-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]"
              >
                ＋ Aggiungi azione
              </button>

              {tipo === 'risanamento' && campi.some((c) => c.tipo === 'foto') && (
                <div className="mt-4 rounded-xl border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3 text-xs">
                  <p className="mb-2 font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima sezioni foto</p>
                  {SCOPE_FOTO.map((s) => {
                    const slots = campi.filter((c) => c.tipo === 'foto' && (c.scope_foto ?? 'misuratore') === s.v);
                    if (slots.length === 0) return null;
                    return (
                      <div key={s.v} className="mb-1">
                        <span className="font-medium text-[var(--brand-text-main)]">{s.label}{s.v !== 'misuratore' ? ' (più foto)' : ''}:</span>{' '}
                        <span className="text-[var(--brand-text-muted)]">
                          {slots.map((c) => `${c.etichetta || '(senza nome)'}${s.v !== 'accessoria' && c.obbligatoria ? ' *' : ''}`).join(', ')}
                        </span>
                      </div>
                    );
                  })}
                  <p className="mt-1 text-[var(--brand-text-subtle)]">* obbligatoria · (più foto) = l&apos;operatore può caricarne diverse</p>
                </div>
              )}

              <AnteprimaBox>
                <VoceCampi campi={campi} voce={anteprimaVoce} disabilitato onChange={() => {}} />
              </AnteprimaBox>
            </SezioneAccordion>

            {/* ── Anteprima del task — titolo e dettagli della card, semplice come le azioni ── */}
            <SezioneAccordion
              title={soloManuale ? 'Anagrafica da compilare (+)' : 'Anteprima del task nel rapportino'}
              subtitle={soloManuale
                ? 'I dati che l\'operatore compila creando l\'intervento dal «+», con etichetta e ordine.'
                : 'Come l\'operatore vede il task: cosa fa da titolo della card e quali dati compaiono aprendola.'}
              defaultOpen
            >
              {!soloManuale && (
                <div className="mb-6">
                  <p className="text-sm font-semibold text-[var(--brand-text-main)]">Titolo della card</p>
                  <p className="mb-3 mt-0.5 text-xs text-[var(--brand-text-muted)]">
                    Si usa il primo dato non vuoto, nell&apos;ordine della lista. Lista vuota = Nominativo, poi PDR.
                  </p>
                  {/* Riga live: il titolo che risulta ADESSO dalla configurazione (dati d'esempio). */}
                  <div className="mb-3 rounded-xl border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] px-3 py-2 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-primary)]">L&apos;operatore leggerà: </span>
                    <span className="font-semibold text-[var(--brand-text-main)]">«{anteprimaRiga.titolo}»</span>
                  </div>
                  <div className="space-y-2">
                    {titoloCampi.map((chiave, idx) => {
                      const def = INFO_CAMPI_DISPONIBILI.find((d) => d.chiave === chiave);
                      const esempio = valoreInfo(anteprimaVoce, chiave);
                      // Col set d'esempio è "usato" il primo campo con valore: gli altri sono riserve.
                      const usato = idx === titoloCampi.findIndex((k) => valoreInfo(anteprimaVoce, k) !== '');
                      return (
                        <div key={chiave} className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${usato ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)]'}`}>
                          <span className="text-sm font-medium text-[var(--brand-text-main)]">{idx + 1}. {def?.etichettaDefault ?? chiave}</span>
                          <span className="min-w-[120px] flex-1 truncate text-xs text-[var(--brand-text-muted)]">
                            es. {esempio || '—'}{usato ? ' ← fa da titolo' : ''}
                          </span>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            <button type="button" onClick={() => moveTitolo(idx, -1)} disabled={idx === 0}
                              className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                            <button type="button" onClick={() => moveTitolo(idx, 1)} disabled={idx === titoloCampi.length - 1}
                              className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                            <button type="button" onClick={() => toggleTitolo(chiave)} title="Rimuovi"
                              className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">✕</button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {INFO_CAMPI_DISPONIBILI.filter((d) => d.chiave !== 'coordinate' && !titoloCampi.includes(d.chiave)).map((d) => (
                      <button key={d.chiave} type="button" onClick={() => toggleTitolo(d.chiave)}
                        className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
                        ＋ {d.etichettaDefault}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-[var(--brand-text-main)]">
                  {soloManuale ? 'Dati da compilare' : 'Dettagli mostrati sul task'}
                </p>
                <p className="mb-3 mt-0.5 text-xs text-[var(--brand-text-muted)]">
                  {soloManuale
                    ? 'Quali dati chiede la modale «+», con quale etichetta e in che ordine.'
                    : 'Quali dati del task compaiono aprendo la card (e nell\'Excel), con quale etichetta e in che ordine. Nessuna selezione = tutti gli 11 di default.'}
                </p>
                <div className="space-y-2">
                  {infoCampi.map((c, idx) => (c.chiave === 'coordinate' ? null : (
                    <div key={c.chiave} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                      <input
                        type="text"
                        value={c.etichetta}
                        onChange={(e) => updateInfoEtichetta(c.chiave, e.target.value)}
                        title={`Etichetta per ${c.chiave}`}
                        className="min-w-[140px] flex-1 rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                      />
                      {/* Resa dinamica: come la vedrà l'operatore (etichetta: valore d'esempio). */}
                      <span className="min-w-[140px] flex-1 truncate text-xs text-[var(--brand-text-muted)]">
                        vedrà: <b className="text-[var(--brand-text-main)]">{c.etichetta.trim() || '…'}:</b> {valoreInfo(anteprimaVoce, c.chiave) || '—'}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => moveInfo(idx, -1)} disabled={idx === 0}
                          className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                        <button type="button" onClick={() => moveInfo(idx, 1)} disabled={idx === infoCampi.length - 1}
                          className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                        <button type="button" onClick={() => toggleInfo(c.chiave)} title="Rimuovi"
                          className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">✕</button>
                      </span>
                    </div>
                  )))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {INFO_CAMPI_DISPONIBILI.filter((d) => d.chiave !== 'coordinate' && !infoCampi.some((c) => c.chiave === d.chiave)).map((d) => (
                    <button key={d.chiave} type="button" onClick={() => toggleInfo(d.chiave)}
                      className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
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

              <AnteprimaBox>
                {!soloManuale && (
                  <>
                    <RigaVoceCard riga={anteprimaRiga} onApri={() => {}} />
                    <div className="my-3 border-t border-dashed border-[var(--brand-border)]" />
                  </>
                )}
                <VoceTitolo voce={anteprimaVoce} titoloCampi={titoloCampi} indice={0} />
                {!soloManuale && (
                  <VoceHeaderInfo voce={anteprimaVoce} coordinataAbilitata={infoCampi.some((c) => c.chiave === 'coordinate')} />
                )}
                <VoceDettagli voce={anteprimaVoce} dettaglio={anteprimaDettaglio} />
              </AnteprimaBox>
            </SezioneAccordion>

            {/* ── Impostazioni avanzate — tutto il resto, chiuso di default ───── */}
            <SezioneAccordion
              title="Impostazioni avanzate"
              subtitle="Collegamento al gruppo, natura del flusso, nomi foto, eliminazione. Di solito non serve toccarle."
            >
              <div className="space-y-4">
                <BloccoAvanzato
                  title="Collegamento al gruppo attività"
                  hint="Dove questo flusso compare nel modulo (Committente → Gruppo). Un flusso può coprire più gruppi."
                >
                  <select
                    value={gruppoCommittente}
                    onChange={(e) => cambiaGruppoCommittente(e.target.value as CommittenteFlusso | '')}
                    className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                  >
                    <option value="">— Non collegato —</option>
                    {albero.committenti.map((c) => (
                      <option key={c.committente} value={c.committente}>{c.label}</option>
                    ))}
                  </select>
                  {gruppoCommittente ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {gruppiDisponibili.map((g) => {
                          const attivo = gruppiAttivita.some((x) => chiaveTassonomia(x) === chiaveTassonomia(g));
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => toggleGruppo(g)}
                              aria-pressed={attivo}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                attivo
                                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
                                  : 'border-dashed border-[var(--brand-border)] text-[var(--brand-text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]'
                              }`}
                            >
                              {attivo ? '✓ ' : '＋ '}{g}
                            </button>
                          );
                        })}
                      </div>
                      {gruppiAttivita.length === 0 && (
                        <p className="mt-2 text-xs text-[var(--danger)]">
                          Scegli almeno un gruppo: senza gruppo il flusso resta tra i non collegati.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
                      Non collegato: il flusso resta visibile nella sezione &quot;Flussi non collegati&quot;.
                    </p>
                  )}
                </BloccoAvanzato>

                <BloccoAvanzato
                  title="Natura del flusso"
                  hint="Modello manuale, tipo risanamento, task-via. Se non sai cosa sono, lasciali come stanno."
                >
                  <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                    <input
                      type="checkbox"
                      checked={soloManuale}
                      onChange={(e) => setSoloManuale(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
                    />
                    <span className="text-xs text-[var(--brand-text-muted)]">
                      <b className="text-[var(--brand-text-main)]">Modello manuale (+)</b> — usato dalla modale &quot;+&quot; dell&apos;operatore invece che dai rapportini pianificati.
                    </span>
                  </label>

                  {!soloManuale && (
                    <>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Tipo rapportino</label>
                      <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value as 'standard' | 'risanamento')}
                        className="mb-3 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                      >
                        <option value="standard">Standard</option>
                        <option value="risanamento">Risanamento colonne</option>
                      </select>
                    </>
                  )}

                  {/* Il committente instrada SOLO la modale "+" (risolviTemplateCommittente gira
                      sui soli solo_manuale): per i flussi classici è una funzione morta → niente select. */}
                  {soloManuale && (
                    <>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Committente del &quot;+&quot;<span className="text-[var(--danger)]"> *</span>
                      </label>
                      <select
                        value={committente}
                        onChange={(e) => setCommittente(e.target.value as Committente | '')}
                        className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                      >
                        <option value="">— Nessuno —</option>
                        <option value="acea">Acea</option>
                        <option value="italgas">Italgas</option>
                        <option value="altro">Altro</option>
                        <option value="lim_massive">Limitazioni massive</option>
                      </select>
                      <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
                        Instrada la modale &quot;+&quot; dell&apos;operatore: il committente scelto carica le azioni di questo modello.
                      </p>
                    </>
                  )}

                  {!soloManuale && (
                    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                      <input
                        type="checkbox"
                        checked={taskVia}
                        onChange={(e) => { setTaskVia(e.target.checked); if (e.target.checked) setTaskViaIbrido(false); }}
                        className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
                      />
                      <span className="text-xs text-[var(--brand-text-muted)]">
                        <b className="text-[var(--brand-text-main)]">Task-via (solo via)</b> — i rapportini generati con questo flusso mostrano il contenitore indirizzo con il tasto <b>+</b>: l&apos;operatore crea gli interventi sotto la via. Lascia disattivo per i flussi normali.
                      </span>
                    </label>
                  )}

                  {!soloManuale && (
                    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                      <input
                        type="checkbox"
                        checked={taskViaIbrido}
                        onChange={(e) => { setTaskViaIbrido(e.target.checked); if (e.target.checked) setTaskVia(false); }}
                        className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
                      />
                      <span className="text-xs text-[var(--brand-text-muted)]">
                        <b className="text-[var(--brand-text-main)]">Ibrido (classiche + BONIFICHE EXTRA)</b> — nello stesso rapportino convivono le attività classiche (con il loro esito) e le voci con attività <b>BONIFICHE EXTRA</b>, che diventano contenitori a sola via con il tasto <b>+</b>. Le altre voci restano normali. Pensato per Italgas.
                      </span>
                    </label>
                  )}
                </BloccoAvanzato>

                {haCampiFoto && (
                  <BloccoAvanzato
                    title="Foto — priorità nome file"
                    hint="Le foto vengono rinominate come <identificativo>_<tipo foto>: il primo campo non vuoto della lista. Lista vuota = PDR → Matricola → ODS/ODL → Indirizzo."
                  >
                    <div className="space-y-2">
                      {fotoIdPriority.length === 0 && (
                        <p className="text-xs text-[var(--brand-text-muted)]">
                          Nessun identificativo selezionato: ordine predefinito (PDR → Matricola → ODS/ODL → Indirizzo).
                        </p>
                      )}
                      {fotoIdPriority.map((chiave, idx) => {
                        const def = FOTO_ID_CAMPI.find((d) => d.chiave === chiave);
                        return (
                          <div key={chiave} className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                            <span className="flex-1 text-sm font-medium text-[var(--brand-text-main)]">{idx + 1}. {def?.etichetta ?? chiave}</span>
                            <button type="button" onClick={() => moveFotoId(idx, -1)} disabled={idx === 0}
                              className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                            <button type="button" onClick={() => moveFotoId(idx, 1)} disabled={idx === fotoIdPriority.length - 1}
                              className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                            <button type="button" onClick={() => toggleFotoId(chiave)}
                              className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">Rimuovi</button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {FOTO_ID_CAMPI.filter((d) => !fotoIdPriority.includes(d.chiave)).map((d) => (
                        <button key={d.chiave} type="button" onClick={() => toggleFotoId(d.chiave)}
                          className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
                          ＋ {d.etichetta}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-dashed border-[var(--brand-primary)] bg-[var(--brand-surface-muted)] p-3">
                      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--brand-text-subtle)]">Anteprima nome file (primo campo foto)</p>
                      <code className="text-sm text-[var(--brand-text-main)]">{anteprimaNomeFoto}</code>
                    </div>
                  </BloccoAvanzato>
                )}

                {!isNew && selectedTpl && (
                  <BloccoAvanzato title="Eliminazione" hint="Rimuove il flusso per sempre. I rapportini già generati non vengono toccati.">
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="rounded-lg border border-[var(--danger)] px-4 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                    >
                      Elimina flusso
                    </button>
                  </BloccoAvanzato>
                )}
              </div>
            </SezioneAccordion>
          </>
        )}
      </div>

      {/* ─── FEEDBACK TOAST ──────────────────────────────────────────────────── */}
      {feedback && (
        <div
          className={`fixed bottom-4 right-4 rounded-lg px-4 py-3 text-sm font-semibold transition ${
            feedback.type === 'success'
              ? 'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]'
              : 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]'
          }`}
        >
          {feedback.type === 'success' ? '✓ ' : '✗ '}{feedback.message}
        </div>
      )}
    </div>
  );
}
