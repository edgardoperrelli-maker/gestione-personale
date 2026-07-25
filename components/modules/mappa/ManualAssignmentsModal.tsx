/* Hallmark · redesign: Cockpit-aligned · tone: utilitarian · anchor hue: sapphire 260 */
'use client';
import { useMemo, useState } from 'react';
import { Check, Home, Lock, LockOpen, MapPin, Pin, Plus, Settings2, Target, Wrench } from 'lucide-react';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Dialog from '@/components/ui/Dialog';
import Select from '@/components/ui/Select';
import type { ManualRule } from '@/utils/routing/manualAssignments';
import type { Task } from '@/utils/routing/types';

export type OperatorLite = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  operators: OperatorLite[];
  tasks: Task[];
  rules: ManualRule[];
  locks: Record<string, boolean>;
  manualiLiberi: Record<string, boolean>;
  onChangeRules: (rules: ManualRule[]) => void;
  onChangeLocks: (locks: Record<string, boolean>) => void;
  onChangeManualiLiberi: (manualiLiberi: Record<string, boolean>) => void;
  onDistribute: () => void;
};

/** Etichetta di un filtro nella riga-regola: icona + testo, stessa geometria per tutti. */
const FILTRO = 'inline-flex items-center gap-1 text-xs text-[var(--brand-text-muted)]';

/**
 * Larghezza del pannello. Il primitivo `Dialog` monta `max-w-lg` (512px) nel proprio
 * `panelShape`, e questa è una plancia di lavoro: serve molto più spazio. Una `max-w-*`
 * passata da fuori cadrebbe nello stesso gruppo di utility, dove il vincitore lo decide
 * l'ordine di emissione del CSS e non quello dell'attributo — quindi l'override è marcato
 * `!important` col suffisso di Tailwind v4, che è deterministico. Misurato a schermo.
 */
const LARGHEZZA_PANNELLO = 'max-w-[min(1280px,95vw)]!';

export default function ManualAssignmentsModal(p: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

  const capValues = useMemo(
    () => Array.from(new Set(p.tasks.map((t) => (t.cap ?? '').trim()).filter(Boolean))).sort(),
    [p.tasks],
  );
  const attValues = useMemo(
    () => Array.from(new Set(p.tasks.map((t) => (t.attivita ?? '').trim()).filter(Boolean))).sort(),
    [p.tasks],
  );

  const pinnedStaffIds = new Set(p.rules.map((r) => r.staffId));

  return (
    <Dialog
      open={p.open}
      onClose={p.onClose}
      className={LARGHEZZA_PANNELLO}
      title={
        <span className="inline-flex items-center gap-2">
          <Pin className="h-4 w-4 shrink-0 text-[var(--primary-text)]" strokeWidth={2} aria-hidden />
          Assegnazioni manuali
        </span>
      }
      footer={
        <>
          <span className="mr-auto self-center text-xs text-[var(--brand-text-muted)]">
            <span className="font-mono tabular-nums">{p.rules.length}</span> regole attive
          </span>
          <Button variant="outline" size="sm" onClick={p.onClose}>
            Chiudi
          </Button>
          <Button variant="primary" size="sm" onClick={p.onDistribute}>
            <Settings2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Distribuisci
          </Button>
        </>
      }
    >
      <div>
        {/* Il sottotitolo coi conteggi sta nel corpo e non nella testa: `Dialog` espone un
            solo slot per il titolo, e infilarci due righe avrebbe sformato l'header di
            tutte le modali dell'app. */}
        <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
          <span className="font-mono tabular-nums">{p.rules.length}</span> regole ·{' '}
          <span className="font-mono tabular-nums">{pinnedStaffIds.size}</span> operatori pinnati
        </p>

        <Button variant="primary" size="sm" className="mb-4" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Nuova regola
        </Button>

        <div className="space-y-2">
          {p.rules.map((r) => {
            const op = p.operators.find((o) => o.id === r.staffId);
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--brand-text-main)]">{op?.name ?? r.staffId}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {r.filtroOds.length > 0 && (
                      <span className={FILTRO}>
                        <Target className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="font-mono tabular-nums">{r.filtroOds.length}</span> ODS
                      </span>
                    )}
                    {r.filtroIndirizzo.length > 0 && (
                      <span className={FILTRO}>
                        <Home className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="font-mono tabular-nums">{r.filtroIndirizzo.length}</span> indirizzo
                      </span>
                    )}
                    {r.filtroCap.length > 0 && (
                      <span className={FILTRO}>
                        <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="font-mono tabular-nums">{r.filtroCap.join(', ')}</span>
                      </span>
                    )}
                    {r.filtroAttivita.length > 0 && (
                      <span className={FILTRO}>
                        <Wrench className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                        {r.filtroAttivita.join(', ')}
                      </span>
                    )}
                    <span className={FILTRO}>
                      {r.maxInterventi == null ? (
                        'illimitato'
                      ) : (
                        <>
                          max <span className="font-mono tabular-nums">{r.maxInterventi}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => p.onChangeRules(p.rules.filter((x) => x.id !== r.id))}
                >
                  Elimina
                </Button>
              </div>
            );
          })}
        </div>

        <h3 className="mb-2 mt-6 text-base font-semibold text-[var(--brand-text-main)]">
          Operatori · lucchetto · corsia
        </h3>
        <div className="space-y-2">
          {p.operators.map((o) => {
            const aperto = p.locks[o.id] !== false;
            const liberi = p.manualiLiberi[o.id] === true;
            const pinned = pinnedStaffIds.has(o.id);
            return (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2"
                style={{ opacity: pinned ? 1 : 0.6 }}
              >
                <span className="min-w-0 truncate text-sm font-medium text-[var(--brand-text-main)]">
                  {o.name}
                  {pinned ? '' : ' · automatico'}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => p.onChangeManualiLiberi({ ...p.manualiLiberi, [o.id]: !liberi })}
                    aria-pressed={liberi}
                    title="Interventi manuali liberi: saltano l'approvazione della torre"
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                      liberi
                        ? 'bg-[var(--status-ok-soft)] text-[var(--status-ok)]'
                        : 'bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]'
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: liberi ? 'var(--status-ok)' : 'var(--status-idle)' }}
                      aria-hidden
                    />
                    {liberi ? 'Liberi' : 'Approva'}
                  </button>
                  {pinned && (
                    /* Aperto/chiuso su `--status-ok` / `--status-warn`: erano quattro `oklch()`
                       cablati, verde e magenta. Il magenta è vietato come accento (§3), e
                       "chiuso" non è un errore ma una restrizione voluta — l'ambra lo dice,
                       il rosso avrebbe detto che qualcosa è andato storto. */
                    <button
                      type="button"
                      onClick={() => p.onChangeLocks({ ...p.locks, [o.id]: !aperto })}
                      aria-pressed={!aperto}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
                        aperto
                          ? 'bg-[var(--status-ok-soft)] text-[var(--status-ok)]'
                          : 'bg-[var(--status-warn-soft)] text-[var(--status-warn)]'
                      }`}
                    >
                      {aperto ? (
                        <LockOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      ) : (
                        <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      )}
                      {aperto ? 'Aperto' : 'Chiuso'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {wizardOpen && (
          <RuleWizard
            operators={p.operators}
            tasks={p.tasks}
            capValues={capValues}
            attValues={attValues}
            onCancel={() => setWizardOpen(false)}
            onCreate={(rule) => {
              p.onChangeRules([...p.rules, rule]);
              setWizardOpen(false);
            }}
          />
        )}
      </div>
    </Dialog>
  );
}

function chips(s: string): string[] {
  return s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
}

/** Etichetta di campo del wizard: 12px, peso 500 come le label del sistema (§4). */
const LABEL = 'mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--brand-text-muted)]';

/**
 * Creazione di una regola. Resta markup a mano e NON passa dal primitivo `Dialog`: è
 * annidata nel corpo della modale principale, e due `Dialog` sovrapposti si contenderebbero
 * focus-trap ed Escape (premere ESC chiuderebbe quella sbagliata). Il guscio è comunque
 * tokenizzato — `var(--overlay)`, `--radius-xl`, `--shadow-lg` — e i controlli sono primitivi.
 */
function RuleWizard(props: {
  operators: OperatorLite[]; tasks: Task[]; capValues: string[]; attValues: string[];
  onCancel: () => void; onCreate: (rule: ManualRule) => void;
}) {
  const [staffId, setStaffId] = useState('');
  const [ods, setOds] = useState(''); const [indirizzo, setIndirizzo] = useState('');
  const [cap, setCap] = useState(''); const [att, setAtt] = useState('');
  const [maxX, setMaxX] = useState('');

  const rule: ManualRule = {
    id: crypto.randomUUID(), staffId,
    filtroOds: chips(ods), filtroIndirizzo: chips(indirizzo),
    filtroCap: chips(cap), filtroAttivita: chips(att),
    maxInterventi: maxX.trim() ? Math.max(1, parseInt(maxX, 10) || 1) : null, ordine: 0,
  };
  const valid = staffId && (rule.filtroOds.length || rule.filtroIndirizzo.length || rule.filtroCap.length || rule.filtroAttivita.length);

  return (
    <div className="fixed inset-0 z-[2001] flex items-center justify-center bg-[var(--overlay)] p-4" role="dialog" aria-modal aria-label="Nuova regola">
      <div className="max-h-[90dvh] w-[min(720px,94vw)] overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 text-[var(--brand-text-main)] shadow-[var(--shadow-lg)]">
        <h3 className="mb-4 text-base font-semibold">Nuova regola</h3>

        <label className={LABEL} htmlFor="regola-operatore">Operatore</label>
        <Select id="regola-operatore" value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mb-3">
          <option value="">— seleziona —</option>
          {props.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>

        <label className={LABEL} htmlFor="regola-ods">
          <Target className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          ODS (separati da virgola)
        </label>
        <Input id="regola-ods" value={ods} onChange={(e) => setOds(e.target.value)} className="mb-3" placeholder="ODS-10231, ODS-10244" />

        <label className={LABEL} htmlFor="regola-indirizzo">
          <Home className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          Indirizzo (fallback ODS)
        </label>
        <Input id="regola-indirizzo" value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} className="mb-3" placeholder="Via Roma 12, Frascati" />

        <label className={LABEL} htmlFor="regola-cap">
          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          CAP
        </label>
        <Input id="regola-cap" value={cap} onChange={(e) => setCap(e.target.value)} className="mb-1" placeholder="00044, 00045" />
        <p className="mb-3 text-[11px] text-[var(--brand-text-muted)]">Dal dataset: {props.capValues.slice(0, 8).join(' · ') || '—'}</p>

        <label className={LABEL} htmlFor="regola-attivita">
          <Wrench className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          Attività
        </label>
        <Input id="regola-attivita" value={att} onChange={(e) => setAtt(e.target.value)} className="mb-1" placeholder="S-AI-051" />
        <p className="mb-3 text-[11px] text-[var(--brand-text-muted)]">Dal dataset: {props.attValues.slice(0, 8).join(' · ') || '—'}</p>

        <label className={LABEL} htmlFor="regola-max">Tetto X (max interventi, opzionale)</label>
        <Input id="regola-max" value={maxX} onChange={(e) => setMaxX(e.target.value)} type="number" min={1} className="mb-4 w-40" placeholder="30" />

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={props.onCancel}>Annulla</Button>
          <Button variant="primary" size="sm" disabled={!valid} onClick={() => props.onCreate(rule)}>
            <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Crea regola
          </Button>
        </div>
      </div>
    </div>
  );
}
