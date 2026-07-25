/* Hallmark · redesign: Cockpit-aligned · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Play, RotateCw, TriangleAlert } from 'lucide-react';
import type { RegolaMappa } from '@/lib/agente/decisione';
import { GIORNI_LABEL, formattaContatto, type AgenteConfigRow, type AgenteRunRow, type AgenteFileColonneRow } from '@/lib/agente/uiTypes';
import { AvvisiSyncBanner } from './AvvisiSyncBanner';
import ObjectHeader from '@/components/ui/ObjectHeader';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/Input';
import { Card, CardContent } from '@/components/Card';
import { opzioniAceaTarget, opzioniComuneGiro, TARGET_DUNNING, TARGET_TUTTI } from '@/lib/agente/comuni';
import { StoricoCard } from './StoricoCard';
import { ColonneCard } from './ColonneCard';

export type AgenteClientProps = {
  config: AgenteConfigRow;
  runs: AgenteRunRow[];
  files: AgenteFileColonneRow[];
  stato: { online: boolean; allerta: string | null };
  minutiDaContatto: number | null;
  forzaGiro: boolean;
  forzaScan: boolean;
  forzaAcea: boolean;
  forzaAceaSal: boolean;
  /** Avvisi salute OneDrive dall'ultimo tick (copie orfane, OneDrive spento, esche in Download). */
  avvisiSync: string[];
  /** Istante dell'ultima consegna degli avvisi (tick). */
  avvisiSyncIl: string | null;
};

/** Forma modificabile della config nel form (sottoinsieme salvabile). */
export type ConfigForm = {
  enabled: boolean;
  giorni: number[];
  ora: string;
  dry_run: boolean;
  finestra_giorni: number;
  mappatura: RegolaMappa[];
  esito_positivo: string;
  esito_negativo: string;
};

export default function AgenteClient({ config, runs, files, stato, minutiDaContatto, forzaGiro, forzaScan, forzaAcea, forzaAceaSal, avvisiSync, avvisiSyncIl }: AgenteClientProps) {
  const router = useRouter();
  const [form, setForm] = useState<ConfigForm>({
    enabled: config.enabled,
    giorni: [...config.giorni].sort((a, b) => a - b),
    ora: config.ora,
    dry_run: config.dry_run,
    finestra_giorni: config.finestra_giorni,
    mappatura: config.mappatura,
    esito_positivo: config.esito_positivo,
    esito_negativo: config.esito_negativo,
  });
  const [salvando, setSalvando] = useState(false);
  const [esitoSalva, setEsitoSalva] = useState<{ ok: boolean; msg: string } | null>(null);
  const [arming, setArming] = useState(false);
  const [armMsg, setArmMsg] = useState<string | null>(null);
  const [aceaArming, setAceaArming] = useState(false);
  const [aceaMsg, setAceaMsg] = useState<string | null>(null);
  const [aceaTarget, setAceaTarget] = useState<string>(TARGET_DUNNING);
  const [giroComune, setGiroComune] = useState<string>(TARGET_TUTTI);
  const [salArming, setSalArming] = useState(false);
  const [salMsg, setSalMsg] = useState<string | null>(null);

  // I comuni sono i file master già scansionati dall'agente (LABICO.xlsx → LABICO):
  // un comune nuovo compare da solo, senza toccare il codice.
  const targetOpzioni = useMemo(() => opzioniAceaTarget(files), [files]);
  const comuneOpzioni = useMemo(() => opzioniComuneGiro(files), [files]);

  async function aggiornaStatoAcea() {
    setAceaArming(true); setAceaMsg(null);
    try {
      const res = await fetch('/api/admin/agente/acea-stato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: aceaTarget }),
      });
      const j = await res.json().catch(() => ({}));
      setAceaMsg(res.ok ? 'Richiesta inviata: parte al prossimo contatto dell\'agente.' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setAceaMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setAceaArming(false);
    }
  }

  async function leggiSal() {
    setSalArming(true); setSalMsg(null);
    try {
      const res = await fetch('/api/admin/agente/acea-sal', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      setSalMsg(res.ok ? 'Richiesta inviata: parte al prossimo contatto dell\'agente.' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setSalMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setSalArming(false);
    }
  }

  async function eseguiOra() {
    setArming(true); setArmMsg(null);
    try {
      const res = await fetch('/api/admin/agente/esegui-ora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comune: giroComune }),
      });
      const j = await res.json().catch(() => ({}));
      setArmMsg(res.ok ? 'Giro armato: parte al prossimo contatto dell\'agente (entro l\'ora).' : `Errore: ${j.error ?? res.status}`);
    } catch (e) {
      setArmMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setArming(false);
    }
  }

  function patch(p: Partial<ConfigForm>) {
    setForm((prev) => ({ ...prev, ...p }));
    setEsitoSalva(null);
  }

  function toggleGiorno(iso: number) {
    setForm((prev) => {
      const has = prev.giorni.includes(iso);
      const giorni = (has ? prev.giorni.filter((g) => g !== iso) : [...prev.giorni, iso]).sort((a, b) => a - b);
      return { ...prev, giorni };
    });
    setEsitoSalva(null);
  }

  async function salva(override?: Partial<ConfigForm>) {
    setSalvando(true);
    setEsitoSalva(null);
    try {
      const payload = override ? { ...form, ...override } : form;
      const res = await fetch('/api/admin/agente/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => ({}))) as { errore?: string; error?: string };
      if (res.ok) {
        setEsitoSalva({ ok: true, msg: 'Impostazioni salvate.' });
        router.refresh();
      } else {
        setEsitoSalva({ ok: false, msg: j.errore ?? j.error ?? `Errore ${res.status}.` });
      }
    } catch {
      setEsitoSalva({ ok: false, msg: 'Errore di rete nel salvataggio.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      <ObjectHeader title="Agente" sub="Pianificazione e feedback del sync limitazioni massive." />

      {/* Card Pianificazione */}
      <Card animated={false}>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Pianificazione</h2>
            <button
              type="button"
              onClick={() => patch({ enabled: !form.enabled })}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              style={{
                backgroundColor: form.enabled ? 'var(--success-soft)' : 'var(--brand-surface-muted)',
                color: form.enabled ? 'var(--success)' : 'var(--brand-text-muted)',
              }}
              aria-pressed={form.enabled}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: form.enabled ? 'var(--status-ok)' : 'var(--status-idle)' }} />
              {form.enabled ? 'Acceso' : 'Spento'}
            </button>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Giorni</span>
            <div className="flex flex-wrap gap-1.5">
              {GIORNI_LABEL.map((lbl, i) => {
                const iso = i + 1; // 1=Lun..7=Dom
                const on = form.giorni.includes(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => toggleGiorno(iso)}
                    className="rounded-[var(--radius-md)] border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                    style={{
                      borderColor: on ? 'var(--brand-primary)' : 'var(--brand-border)',
                      backgroundColor: on ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                      color: on ? 'var(--primary-text)' : 'var(--brand-text-main)',
                    }}
                    aria-pressed={on}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="block space-y-1">
              <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Ora</span>
              <span className="inline-block w-36">
                <Input
                  type="time"
                  value={form.ora}
                  onChange={(e) => patch({ ora: e.target.value })}
                  className="py-1.5 font-mono tabular-nums"
                />
              </span>
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Finestra (giorni)</span>
              <span className="inline-block w-24">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={form.finestra_giorni}
                  onChange={(e) => patch({ finestra_giorni: Number(e.target.value) })}
                  className="py-1.5 font-mono tabular-nums"
                />
              </span>
            </label>
            <div className="space-y-1">
              <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Modalità</span>
              <button
                type="button"
                onClick={() => { const nuovo = !form.dry_run; patch({ dry_run: nuovo }); void salva({ dry_run: nuovo }); }}
                disabled={salvando}
                className="rounded-[var(--radius-md)] border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:opacity-60"
                style={{
                  borderColor: form.dry_run ? 'var(--warning)' : 'var(--brand-border)',
                  backgroundColor: form.dry_run ? 'var(--warning-soft)' : 'var(--brand-surface)',
                  color: 'var(--brand-text-main)',
                }}
                aria-pressed={form.dry_run}
                title="Prova non scrive sui file; Reale scrive. Si salva subito."
              >
                {form.dry_run ? 'Prova (dry-run)' : 'Reale'}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Stato */}
      <Card animated={false}>
        <CardContent className="space-y-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Stato</h2>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stato.online ? 'var(--status-ok)' : 'var(--status-idle)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
              {stato.online ? 'Online' : 'Offline'}
            </span>
            <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              · ultimo contatto {formattaContatto(minutiDaContatto)}
            </span>
          </div>
          {(forzaGiro || forzaScan || forzaAcea || forzaAceaSal) && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}
            >
              <Clock size={15} className="shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
              <span>In attesa del prossimo contatto dell&apos;agente:</span>
              {forzaGiro && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--primary-text)' }}>
                  giro forzato
                </span>
              )}
              {forzaScan && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--primary-text)' }}>
                  re-scan colonne
                </span>
              )}
              {forzaAcea && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--primary-text)' }}>
                  stato ACEA
                </span>
              )}
              {forzaAceaSal && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--primary-text)' }}>
                  leggi SAL
                </span>
              )}
              <button
                type="button"
                onClick={() => router.refresh()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-0.5 text-xs font-medium transition hover:bg-[var(--brand-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                style={{ borderColor: 'var(--brand-border-strong)', color: 'var(--brand-text-main)' }}
              >
                <RotateCw size={13} aria-hidden />
                Aggiorna stato
              </button>
            </div>
          )}
          {stato.allerta && (
            <div
              className="flex items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
              role="alert"
            >
              <TriangleAlert size={15} className="shrink-0" aria-hidden />
              {stato.allerta}
            </div>
          )}
          <AvvisiSyncBanner avvisi={avvisiSync} rilevatoIl={avvisiSyncIl} />

          {/* Azioni manuali — passano tutte dal prossimo contatto dell'agente */}
          <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--brand-border)' }}>
            {/* Giro sincronizzazione manuale */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Giro sincronizzazione</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block w-52">
                  <Select
                    value={giroComune}
                    onChange={(e) => setGiroComune(e.target.value)}
                    disabled={arming}
                    className="py-1.5 text-sm"
                    title="Limita QUESTO giro manuale a un solo comune. Il giro notturno pianificato gira sempre su tutti i comuni."
                    aria-label="Comune del giro manuale"
                  >
                    {comuneOpzioni.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </span>
                <Button variant="primary" onClick={eseguiOra} loading={arming}>
                  {!arming && <Play size={14} aria-hidden />}
                  {arming ? 'Armo…' : 'Esegui ora'}
                </Button>
                {armMsg && <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{armMsg}</span>}
              </div>
            </div>

            {/* Stato ODL da ACEA */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Stato ODL da ACEA</span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block w-52">
                  <Select
                    value={aceaTarget}
                    onChange={(e) => setAceaTarget(e.target.value)}
                    disabled={aceaArming}
                    className="py-1.5 text-sm"
                    title="Quale master aggiornare con lo stato ODL da ACEA"
                    aria-label="Master da aggiornare con lo stato ODL"
                  >
                    {targetOpzioni.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </span>
                <Button
                  variant="soft"
                  onClick={aggiornaStatoAcea}
                  loading={aceaArming}
                  title="Playwright accede ad ACEA, esporta e aggiorna la colonna stato del master scelto."
                >
                  {aceaArming ? 'Invio…' : 'Aggiorna stato ODL da ACEA'}
                </Button>
                {aceaMsg && <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{aceaMsg}</span>}
              </div>
            </div>

            {/* Lettura SAL */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>SAL — produzione economica</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={leggiSal}
                  loading={salArming}
                  title="Legge i file SAL N.xlsx dalla cartella CONTABILITA' e aggiorna lo storico SAL del KPI produzione economica."
                >
                  {salArming ? 'Invio…' : 'Leggi SAL'}
                </Button>
                {salMsg && <span className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{salMsg}</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Storico (D6) */}
      <StoricoCard runs={runs} />

      {/* Card Colonne & scrittura (D6) — l'editor mappa condivide form + salva */}
      <ColonneCard
        files={files}
        mappatura={form.mappatura}
        esitoPositivo={form.esito_positivo}
        esitoNegativo={form.esito_negativo}
        onChange={patch}
      />

      {/* Barra di salvataggio condivisa (Pianificazione + Colonne) */}
      <div className="sticky bottom-3 flex items-center justify-end gap-3">
        {esitoSalva && (
          <span
            className="rounded-full px-3 py-1 text-sm font-medium"
            style={{
              backgroundColor: esitoSalva.ok ? 'var(--success-soft)' : 'var(--danger-soft)',
              color: esitoSalva.ok ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {esitoSalva.msg}
          </span>
        )}
        <Button variant="primary" onClick={() => void salva()} loading={salvando}>
          {salvando ? 'Salvo…' : 'Salva impostazioni'}
        </Button>
      </div>
    </div>
  );
}
