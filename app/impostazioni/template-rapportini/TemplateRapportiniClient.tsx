'use client';
import { useEffect, useRef, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { nomeFotoFile, FOTO_ID_CAMPI, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
import {
  INFO_CAMPI_DISPONIBILI,
  partitionInfoCampi,
  resolveInfoCampi,
  titoloVoce,
  type InfoChiave,
  type TemplateInfoCampo,
} from '@/utils/rapportini/infoCampi';
import { VoceTitolo, VoceHeaderInfo, VoceDettagli, VoceCampi } from '@/components/modules/rapportini/VoceCard';
import { RigaVoceCard, type RigaVoce } from '@/components/modules/rapportini/RapportinoLista';
import { SAMPLE_VOCE_INFO, sampleRisposte } from '@/utils/rapportini/sampleVoce';
import SchedeTipo from './SchedeTipo';
import {
  schedaDiTemplate,
  filtraTemplatePerScheda,
  erroreCommittenteManuale,
  type SchedaTemplate,
} from '@/lib/rapportini/templateScheda';

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
  tipo?: 'standard' | 'risanamento';
};

type Props = { initial: Template[] };

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

const TIPO_LABELS: Record<TemplateCampo['tipo'], string> = {
  crocetta: 'Crocetta',
  testo: 'Testo libero',
  select: 'Selezione',
  numero: 'Numero',
  foto: 'Foto',
};

export default function TemplateRapportiniClient({ initial }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [nome, setNome] = useState('');
  const [committente, setCommittente] = useState<Committente | ''>('');
  const [scheda, setScheda] = useState<SchedaTemplate>('classici');
  const soloManuale = scheda === 'manuali';
  const [tipo, setTipo] = useState<'standard' | 'risanamento'>('standard');
  const [campi, setCampi] = useState<TemplateCampo[]>([]);
  const [infoCampi, setInfoCampi] = useState<TemplateInfoCampo[]>([]);
  const [titoloCampi, setTitoloCampi] = useState<InfoChiave[]>([]);
  const [fotoIdPriority, setFotoIdPriority] = useState<FotoIdCampo[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  // Stato auto-save per i template esistenti (i nuovi si creano con "Crea template").
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Salta l'auto-save sul primo render dopo un load/startNew (non è una modifica utente).
  const skipAutosave = useRef(true);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function showFeedback(type: 'success' | 'error', message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  }

  function loadTemplate(tpl: Template) {
    skipAutosave.current = true;
    setAutoState('idle');
    setIsNew(false);
    setSelectedId(tpl.id);
    setNome(tpl.nome);
    setCommittente(tpl.committente ?? '');
    setScheda(schedaDiTemplate(tpl));
    setTipo(tpl.tipo ?? 'standard');
    setCampi(tpl.campi.map((c) => ({ ...c, opzioni: c.opzioni ?? [] })));
    setInfoCampi(resolveInfoCampi(tpl.info_campi));
    setTitoloCampi(tpl.titolo_campi ?? []);
    setFotoIdPriority(tpl.foto_id_priority ?? []);
  }

  function startNew() {
    skipAutosave.current = true;
    setAutoState('idle');
    setIsNew(true);
    setSelectedId(null);
    setNome('');
    setCommittente('');
    setTipo('standard');
    setCampi([]);
    setInfoCampi([]);
    setTitoloCampi([]);
    setFotoIdPriority([]);
  }

  function cambiaScheda(s: SchedaTemplate) {
    setScheda(s);
    setSelectedId(null);
    setIsNew(false);
  }

  async function reloadTemplates() {
    const res = await fetch('/api/admin/rapportino-template');
    if (res.ok) {
      const data: Template[] = await res.json();
      setTemplates(data);
    }
  }

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

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!nome.trim()) { showFeedback('error', 'Il nome del template è obbligatorio'); return; }
    if (campi.length === 0) { showFeedback('error', 'Aggiungi almeno un campo'); return; }
    for (const c of campi) {
      if (!c.etichetta.trim()) { showFeedback('error', 'Tutti i campi devono avere un\'etichetta'); return; }
    }

    const errComm = erroreCommittenteManuale({ solo_manuale: soloManuale, committente: committente || null });
    if (errComm) { showFeedback('error', errComm); return; }

    setSaving(true);
    try {
      const payload = {
        nome: nome.trim(),
        committente: committente || null,
        solo_manuale: soloManuale,
        tipo,
        campi: campi.map((c, i) => ({
          ...c,
          ordine: i + 1,
          opzioni: c.tipo === 'select' ? (c.opzioni ?? []).map((s) => s.trim()).filter(Boolean) : undefined,
        })),
        info_campi: infoCampi.map((c, i) => ({ ...c, ordine: i + 1 })),
        titolo_campi: titoloCampi,
        foto_id_priority: fotoIdPriority,
        active: true,
        ...(isNew ? {} : { id: selectedId }),
      };

      const res = await fetch('/api/admin/rapportino-template', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante il salvataggio'); return; }

      showFeedback('success', isNew ? 'Template creato' : 'Template aggiornato');
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
    if (!confirm(`Confermi di eliminare il template "${tpl?.nome}"?`)) return;

    const res = await fetch(`/api/admin/rapportino-template?id=${selectedId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { showFeedback('error', json.error ?? 'Errore durante l\'eliminazione'); return; }

    showFeedback('success', 'Template eliminato');
    await reloadTemplates();
    setSelectedId(null);
    setIsNew(false);
    setNome('');
    setCampi([]);
  }

  // ── Auto-save (template esistenti, con debounce) ─────────────────────────────
  useEffect(() => {
    // Salta il run dovuto a load/startNew/mount: non è una modifica dell'utente.
    if (skipAutosave.current) { skipAutosave.current = false; return; }
    if (isNew || !selectedId) return; // i nuovi si salvano con "Crea template"
    const valido =
      nome.trim() !== '' && campi.length > 0 && campi.every((c) => c.etichetta.trim() !== '');
    const committenteOk = !erroreCommittenteManuale({ solo_manuale: soloManuale, committente: committente || null });
    if (!valido || !committenteOk) { setAutoState('idle'); return; }

    setAutoState('saving');
    const id = selectedId;
    const timer = setTimeout(async () => {
      try {
        const payload = {
          id,
          nome: nome.trim(),
          committente: committente || null,
          solo_manuale: soloManuale,
          tipo,
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
        const res = await fetch('/api/admin/rapportino-template', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setAutoState(res.ok ? 'saved' : 'error');
      } catch {
        setAutoState('error');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [nome, committente, scheda, soloManuale, tipo, campi, infoCampi, titoloCampi, fotoIdPriority, isNew, selectedId]);

  // Nessun template selezionato all'apertura: l'utente sceglie a mano.

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedTpl = templates.find((t) => t.id === selectedId);
  const templatesVisibili = filtraTemplatePerScheda(templates, scheda);
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

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ─── COLONNA SINISTRA: Lista template ───────────────────────────────── */}
      <div className="flex max-w-sm flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--brand-text-main)]">Template rapportini</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-xl bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90"
          >
            + Nuovo
          </button>
        </div>

        <SchedeTipo attiva={scheda} onChange={cambiaScheda} />

        {templatesVisibili.length === 0 && !isNew ? (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
            {scheda === 'manuali' ? 'Nessun template per interventi manuali. Creane uno.' : 'Nessun template classico. Creane uno.'}
          </div>
        ) : (
          <div className="space-y-2">
            {isNew && (
              <div className="cursor-pointer rounded-2xl border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] p-4">
                <p className="font-semibold text-[var(--brand-primary)]">Nuovo template…</p>
              </div>
            )}
            {templatesVisibili.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => loadTemplate(tpl)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  selectedId === tpl.id && !isNew
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]'
                    : 'border-[var(--brand-border)] bg-[var(--brand-surface)] hover:border-[var(--brand-primary)]'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-semibold text-[var(--brand-text-main)]">{tpl.nome}</span>
                  {tpl.is_default && (
                    <span className="rounded-full bg-[var(--brand-primary)] px-2 py-0.5 text-xs font-bold text-[oklch(0.16_0.06_245)]">
                      default
                    </span>
                  )}
                  {!tpl.active && (
                    <span className="rounded-full border border-[var(--brand-border)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                      inattivo
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--brand-text-muted)]">
                  {tpl.campi?.length ?? 0} campi
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── COLONNA DESTRA: Editor ──────────────────────────────────────────── */}
      <div className="flex-1 space-y-4">
        {!isEditing ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
            <div className="text-center">
              <div className="mb-3 text-4xl">📋</div>
              <p className="text-sm text-[var(--brand-text-muted)]">
                Seleziona un template per modificarlo o creane uno nuovo
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Nome template ─────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-4 font-semibold text-[var(--brand-text-main)]">Nome template</h3>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                placeholder="es. Rapportino standard"
              />
            </div>

            {/* ── Committente ───────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Committente</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Associa il template a un committente per gli interventi manuali. &quot;Nessuno&quot; = template generico (Standard).
              </p>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">Tipo template</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'standard' | 'risanamento')}
                className="mb-4 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
              >
                <option value="standard">Standard</option>
                <option value="risanamento">Risanamento colonne</option>
              </select>
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
            </div>

            {/* ── Card nella lista interventi ──────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Card nella lista interventi</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Il titolo di ogni voce userà il <b>primo campo non vuoto</b> di questa lista (in ordine).
                Se tutti vuoti → &quot;Voce N&quot;. Lista vuota = comportamento storico (Nominativo, poi PDR).
              </p>

              <div className="space-y-2">
                {titoloCampi.length === 0 && (
                  <p className="text-xs text-[var(--brand-text-muted)]">Nessun campo selezionato: titolo storico (Nominativo → PDR → &quot;Voce N&quot;).</p>
                )}
                {titoloCampi.map((chiave, idx) => {
                  const def = INFO_CAMPI_DISPONIBILI.find((d) => d.chiave === chiave);
                  return (
                    <div key={chiave} className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                      <span className="flex-1 text-sm font-medium text-[var(--brand-text-main)]">{idx + 1}. {def?.etichettaDefault ?? chiave}</span>
                      <span className="w-28 shrink-0 text-xs text-[var(--brand-text-muted)]">{chiave}</span>
                      <button type="button" onClick={() => moveTitolo(idx, -1)} disabled={idx === 0}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                      <button type="button" onClick={() => moveTitolo(idx, 1)} disabled={idx === titoloCampi.length - 1}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                      <button type="button" onClick={() => toggleTitolo(chiave)}
                        className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">Rimuovi</button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {INFO_CAMPI_DISPONIBILI.filter((d) => !titoloCampi.includes(d.chiave)).map((d) => (
                  <button key={d.chiave} type="button" onClick={() => toggleTitolo(d.chiave)}
                    className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
                    ＋ {d.etichettaDefault}
                  </button>
                ))}
              </div>
              <AnteprimaBox>
                <RigaVoceCard riga={anteprimaRiga} onApri={() => {}} />
              </AnteprimaBox>
            </div>

            {/* ── Dettaglio card ────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Dettaglio card</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Indirizzo e fascia oraria arrivano dai dati importati (non configurabili). Qui attivi la coordinata &quot;Punto esatto&quot;.
              </p>
              <label className="flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
                <input
                  type="checkbox"
                  checked={infoCampi.some((c) => c.chiave === 'coordinate')}
                  onChange={() => toggleInfo('coordinate')}
                  className="h-4 w-4 accent-[var(--brand-primary)]"
                />
                Mostra coordinate (link &quot;Punto esatto&quot;)
              </label>
              <AnteprimaBox>
                <VoceTitolo voce={anteprimaVoce} titoloCampi={titoloCampi} indice={0} />
                <VoceHeaderInfo voce={anteprimaVoce} coordinataAbilitata={infoCampi.some((c) => c.chiave === 'coordinate')} />
              </AnteprimaBox>
            </div>

            {/* ── Dettaglio anagrafica ──────────────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Dettaglio anagrafica</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Scegli quali dati del DB compaiono nel rapportino e nell&apos;Excel, in che ordine e con quale etichetta.
                Nessuna selezione = mostra tutti gli 11 campi di default.
              </p>

              <div className="space-y-2">
                {infoCampi.map((c, idx) => (c.chiave === 'coordinate' ? null : (
                  <div key={c.chiave} className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
                    <input
                      type="text"
                      value={c.etichetta}
                      onChange={(e) => updateInfoEtichetta(c.chiave, e.target.value)}
                      className="flex-1 rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                    />
                    <span className="w-28 shrink-0 text-xs text-[var(--brand-text-muted)]">{c.chiave}</span>
                    <button type="button" onClick={() => moveInfo(idx, -1)} disabled={idx === 0}
                      className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta su">▲</button>
                    <button type="button" onClick={() => moveInfo(idx, 1)} disabled={idx === infoCampi.length - 1}
                      className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30" title="Sposta giù">▼</button>
                    <button type="button" onClick={() => toggleInfo(c.chiave)}
                      className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]">Rimuovi</button>
                  </div>
                )))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {INFO_CAMPI_DISPONIBILI.filter((d) => d.chiave !== 'coordinate' && !infoCampi.some((c) => c.chiave === d.chiave)).map((d) => (
                  <button key={d.chiave} type="button" onClick={() => toggleInfo(d.chiave)}
                    className="rounded-lg border border-dashed border-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]">
                    ＋ {d.etichettaDefault}
                  </button>
                ))}
              </div>
              <AnteprimaBox>
                <VoceDettagli voce={anteprimaVoce} dettaglio={anteprimaDettaglio} />
              </AnteprimaBox>
            </div>

            {/* ── Lista azioni da fare ─────────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
              <h3 className="mb-4 font-semibold text-[var(--brand-text-main)]">Lista azioni da fare</h3>

              {campi.length === 0 && (
                <p className="mb-4 text-sm text-[var(--brand-text-muted)]">Nessun campo. Aggiungine uno.</p>
              )}

              <div className="space-y-3">
                {campi.map((campo, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-4"
                  >
                    {/* Row 1: etichetta + tipo */}
                    <div className="mb-3 flex gap-3">
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Etichetta
                        </label>
                        <input
                          type="text"
                          value={campo.etichetta}
                          onChange={(e) => updateCampo(idx, { etichetta: e.target.value })}
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                          placeholder="es. Firma tecnico"
                        />
                        {campo.chiave && (
                          <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">chiave: {campo.chiave}</p>
                        )}
                      </div>
                      <div className="w-40">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Tipo
                        </label>
                        <select
                          value={campo.tipo}
                          onChange={(e) => updateCampo(idx, { tipo: e.target.value as TemplateCampo['tipo'] })}
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none"
                        >
                          {(Object.keys(TIPO_LABELS) as TemplateCampo['tipo'][]).map((t) => (
                            <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Row 2: opzioni (solo se tipo=select) */}
                    {campo.tipo === 'select' && (
                      <div className="mb-3">
                        <label className="mb-1 block text-xs font-medium text-[var(--brand-text-muted)]">
                          Opzioni (una per riga)
                        </label>
                        <textarea
                          rows={3}
                          value={(campo.opzioni ?? []).join('\n')}
                          onChange={(e) =>
                            updateCampo(idx, { opzioni: e.target.value.split('\n') })
                          }
                          className="w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                          placeholder={'SI\nNO'}
                        />
                      </div>
                    )}

                    {/* Row 2b: scope + flag obbligatoria (solo se tipo=foto) */}
                    {campo.tipo === 'foto' && (
                      <div className="mb-3 space-y-2">
                        {tipo === 'risanamento' && (
                          <div>
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
                        {!(tipo === 'risanamento' && (campo.scope_foto ?? 'misuratore') === 'accessoria') && (
                          <label className="flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
                            <input
                              type="checkbox"
                              checked={campo.obbligatoria === true}
                              onChange={(e) => updateCampo(idx, { obbligatoria: e.target.checked })}
                              className="h-4 w-4 accent-[var(--brand-primary)]"
                            />
                            Foto obbligatoria
                          </label>
                        )}
                      </div>
                    )}

                    {/* Row 2c: obbligatoria (campi non-foto, solo template manuale) */}
                    {soloManuale && campo.tipo !== 'foto' && (
                      <label className="mb-3 flex items-center gap-2 text-sm text-[var(--brand-text-main)]">
                        <input
                          type="checkbox"
                          checked={campo.obbligatoria === true}
                          onChange={(e) => updateCampo(idx, { obbligatoria: e.target.checked })}
                          className="h-4 w-4 accent-[var(--brand-primary)]"
                        />
                        Obbligatoria
                      </label>
                    )}

                    {/* Row 3: azioni */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveCampo(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30"
                        title="Sposta su"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCampo(idx, 1)}
                        disabled={idx === campi.length - 1}
                        className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-text-muted)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-30"
                        title="Sposta giù"
                      >
                        ▼
                      </button>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => removeCampo(idx)}
                        className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                      >
                        Rimuovi
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addCampo}
                className="mt-4 rounded-lg border border-dashed border-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]"
              >
                ＋ Aggiungi campo
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
            </div>

            {/* ── Priorità nome foto (solo se ci sono campi foto) ───────────────── */}
            {haCampiFoto && (
              <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
                <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Priorità nome foto</h3>
                <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                  Le foto vengono rinominate come <b>&lt;identificativo&gt;_&lt;tipo foto&gt;</b>. Scegli quale
                  identificativo usare (il <b>primo non vuoto</b> della lista, in ordine).
                  Lista vuota = ordine predefinito: PDR → Matricola → ODS/ODL → Indirizzo.
                </p>

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
                        <span className="w-28 shrink-0 text-xs text-[var(--brand-text-muted)]">{chiave}</span>
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

                <div className="mt-4 flex flex-wrap gap-2">
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
              </div>
            )}

            {/* ── Azioni ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
              {isNew ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Creazione…' : 'Crea template'}
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
              {!isNew && selectedTpl && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-lg border border-[var(--danger)] px-4 py-2 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
                >
                  Elimina template
                </button>
              )}
            </div>
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

