'use client';

import { useEffect, useMemo, useState } from 'react';
import { geocodeTask } from '@/utils/routing';
import { formatStaffStartAddress, formatStaffHomeAddress, isStaffValidOnDay } from '@/lib/staff';
import { normalizeUsername, toEmail } from '@/lib/auth/usernameFromEmail';
import NewOperatorModal from './NewOperatorModal';
import StoricoTrasferte from './StoricoTrasferte';
import Button from '@/components/Button';
import Dialog from '@/components/ui/Dialog';
import CostCenterRangesEditor from '@/components/impostazioni/CostCenterRangesEditor';
import { COST_CENTERS } from '@/constants/cost-centers';
import type { CostCenterRange } from '@/lib/costCenter';
import type { Staff, Territory } from '@/types';

type Props = {
  initialStaff: Staff[];
  territories: Territory[];
  initialRanges: Record<string, CostCenterRange[]>;
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

/** Dialog credenziali app: creazione, reset password o scollegamento. */
type CredDialogState = { tipo: 'crea' | 'reset' | 'scollega'; staff: Staff } | null;

function todayIso() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

/**
 * Username proposto dal nome visualizzato: `normalizeUsername` da solo terrebbe
 * spazi e accenti, che rendono invalida l'email finta `u_<username>@local.it`.
 */
function proponiUsername(displayName: string): string {
  return normalizeUsername(
    displayName
      .normalize('NFD')
      .replace(/[^a-zA-Z0-9\s.]/g, '')
      .trim()
      .replace(/\s+/g, '.'),
  );
}

function validityLabel(staff: Staff, today: string) {
  if (isStaffValidOnDay(staff, today, today)) return 'Valido';
  if (staff.valid_from && staff.valid_from > today) return 'Non ancora attivo';
  return 'Fuori validita';
}

export default function PersonaleClient({ initialStaff, territories, initialRanges }: Props) {
  const [rows, setRows] = useState<Staff[]>(initialStaff);
  const [rangesByStaff, setRangesByStaff] = useState<Record<string, CostCenterRange[]>>(initialRanges);
  const [query, setQuery] = useState('');
  const [validityFilter, setValidityFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Credenziali app: mappa staff_id → username (lo userId del GET non serve alla UI).
  const [credenziali, setCredenziali] = useState<Record<string, string>>({});
  const [credStato, setCredStato] = useState<'caricamento' | 'pronte' | 'errore'>('caricamento');
  const [credDialog, setCredDialog] = useState<CredDialogState>(null);
  const [credUsername, setCredUsername] = useState('');
  const [credBusy, setCredBusy] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  // Password temporanea: visibile UNA volta, finché la dialog resta aperta.
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const today = useMemo(() => todayIso(), []);

  useEffect(() => {
    let attivo = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/personale/credenziali');
        const json = await res.json() as {
          credenziali?: Record<string, { username: string; userId: string }>;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? 'Errore caricamento credenziali app.');
        if (!attivo) return;
        const mappa: Record<string, string> = {};
        for (const [staffId, cred] of Object.entries(json.credenziali ?? {})) {
          mappa[staffId] = cred.username;
        }
        setCredenziali(mappa);
        setCredStato('pronte');
      } catch {
        if (attivo) setCredStato('errore');
      }
    })();
    return () => { attivo = false; };
  }, []);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    let filtered = rows;

    // Filtro ricerca per nome
    if (term) {
      filtered = filtered.filter((row) => row.display_name.toLowerCase().includes(term));
    }

    // Filtro per validità (basato su valid_from / valid_to)
    if (validityFilter === 'valid') {
      filtered = filtered.filter((row) => isStaffValidOnDay(row, today));
    } else if (validityFilter === 'invalid') {
      filtered = filtered.filter((row) => !isStaffValidOnDay(row, today));
    }

    return filtered;
  }, [query, rows, validityFilter, today]);

  const updateRow = (id: string, patch: Partial<Staff>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleOperatorCreated = (newStaff: Staff, ranges: CostCenterRange[]) => {
    setRows((prev) =>
      [...prev, newStaff].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, 'it', { sensitivity: 'base' })
      )
    );
    setRangesByStaff((prev) => ({ ...prev, [newStaff.id]: ranges }));
    setShowNewModal(false);
  };

  const apriCredDialog = (tipo: 'crea' | 'reset' | 'scollega', staff: Staff) => {
    setCredError(null);
    setTempPassword(null);
    setCopied(false);
    if (tipo === 'crea') setCredUsername(proponiUsername(staff.display_name));
    setCredDialog({ tipo, staff });
  };

  const chiudiCredDialog = () => {
    if (credBusy) return;
    setCredDialog(null);
    setCredError(null);
    setTempPassword(null);
    setCopied(false);
    setCredUsername('');
  };

  const confermaCredDialog = async () => {
    if (!credDialog || credBusy) return;
    const { tipo, staff } = credDialog;
    setCredBusy(true);
    setCredError(null);
    try {
      if (tipo === 'crea') {
        const username = normalizeUsername(credUsername);
        if (!username) throw new Error('Inserisci uno username.');
        const res = await fetch('/api/admin/personale/credenziali', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId: staff.id, username }),
        });
        const json = await res.json() as { error?: string; username?: string; tempPassword?: string };
        const nuovoUsername = json.username;
        const nuovaPassword = json.tempPassword;
        if (!res.ok || !nuovoUsername || !nuovaPassword) {
          throw new Error(json.error ?? 'Errore creazione utenza.');
        }
        setCredenziali((prev) => ({ ...prev, [staff.id]: nuovoUsername }));
        setTempPassword({ username: nuovoUsername, password: nuovaPassword });
      } else if (tipo === 'reset') {
        const res = await fetch('/api/admin/personale/credenziali', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId: staff.id, azione: 'reset' }),
        });
        const json = await res.json() as { error?: string; tempPassword?: string };
        const nuovaPassword = json.tempPassword;
        if (!res.ok || !nuovaPassword) throw new Error(json.error ?? 'Errore reset password.');
        setTempPassword({ username: credenziali[staff.id] ?? '', password: nuovaPassword });
      } else {
        const res = await fetch('/api/admin/personale/credenziali', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId: staff.id }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Errore scollegamento utenza.');
        setCredenziali((prev) => {
          const next = { ...prev };
          delete next[staff.id];
          return next;
        });
        setCredDialog(null);
        showFeedback('success', `Utenza scollegata da ${staff.display_name}.`);
      }
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setCredBusy(false);
    }
  };

  const copiaTempPassword = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCredError('Copia non riuscita: seleziona la password e copiala a mano.');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSave = async (row: Staff) => {
    if (savingId) return;
    if (row.valid_from && row.valid_to && row.valid_from > row.valid_to) {
      showFeedback('error', `Intervallo non valido per ${row.display_name}.`);
      return;
    }

    setSavingId(row.id);

    let startLat: number | null = null;
    let startLng: number | null = null;
    let homeLat: number | null = null;
    let homeLng: number | null = null;
    let geocodeFailed = false;

    if (row.start_address || row.start_cap || row.start_city) {
      const g = await geocodeTask({
        id: `staff-${row.id}-magazzino`,
        odl: '',
        indirizzo: row.start_address ?? '',
        cap: row.start_cap ?? '',
        citta: row.start_city ?? '',
        priorita: 0,
        fascia_oraria: '',
      });
      startLat = g.lat ?? null;
      startLng = g.lng ?? null;
      if (startLat === null || startLng === null) geocodeFailed = true;
    }

    if (row.home_address || row.home_cap || row.home_city) {
      const g = await geocodeTask({
        id: `staff-${row.id}-casa`,
        odl: '',
        indirizzo: row.home_address ?? '',
        cap: row.home_cap ?? '',
        citta: row.home_city ?? '',
        priorita: 0,
        fascia_oraria: '',
      });
      homeLat = g.lat ?? null;
      homeLng = g.lng ?? null;
      if (homeLat === null || homeLng === null) geocodeFailed = true;
    }

    try {
      const res = await fetch('/api/admin/personale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          validFrom: row.valid_from ?? null,
          validTo: row.valid_to ?? null,
          startAddress: row.start_address ?? null,
          startCap: row.start_cap ?? null,
          startCity: row.start_city ?? null,
          startLat,
          startLng,
          homeAddress: row.home_address ?? null,
          homeCap: row.home_cap ?? null,
          homeCity: row.home_city ?? null,
          homeLat,
          homeLng,
          homeTerritoryId: row.home_territory_id ?? null,
          costCenter: row.cost_center ?? null,
          costCenterRanges: rangesByStaff[row.id] ?? [],
        }),
      });
      const json = await res.json() as { error?: string; staff?: Staff };
      if (!res.ok) throw new Error(json.error ?? 'Errore salvataggio personale.');
      if (json.staff) updateRow(row.id, json.staff);
      showFeedback(
        'success',
        geocodeFailed
          ? `${row.display_name} salvato. Indirizzo di partenza registrato senza coordinate.`
          : `${row.display_name} aggiornato con successo.`
      );
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore salvataggio personale.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--brand-text-main)]">Personale</h1>
          <p className="mt-1 text-sm text-[var(--brand-text-muted)]">
            Gestisci validita e indirizzo di partenza degli operatori usati da cronoprogramma e mappa.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 rounded-2xl border border-[var(--success)] bg-[var(--success-soft)] px-5 py-3 text-sm font-semibold text-[var(--success)] shadow-sm transition hover:bg-[var(--success-soft)] hover:border-[var(--success)]"
        >
          <span className="text-lg leading-none">+</span>
          Nuovo Operatore
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[250px]">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
              Cerca operatore
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome operatore..."
              className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setValidityFilter('all')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                validityFilter === 'all'
                  ? 'bg-[var(--brand-primary)] text-[var(--on-primary)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--brand-primary-soft)]'
              }`}
            >
              Tutti
            </button>
            <button
              onClick={() => setValidityFilter('valid')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                validityFilter === 'valid'
                  ? 'bg-[var(--success)] text-[var(--brand-bg)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--success-soft)]'
              }`}
            >
              ✓ Validi
            </button>
            <button
              onClick={() => setValidityFilter('invalid')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                validityFilter === 'invalid'
                  ? 'bg-[var(--warning)] text-[var(--brand-bg)]'
                  : 'border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] hover:bg-[var(--warning-soft)]'
              }`}
            >
              ⚠ Fuori validità
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            feedback.type === 'success'
              ? 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]'
              : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-4">
        {filteredRows.map((row) => {
          const saving = savingId === row.id;
          const isExpanded = expandedIds.has(row.id);
          const startAddress = formatStaffStartAddress(row);
          const hasCoords = row.start_lat != null && row.start_lng != null;
          const hasHomeCoords = row.home_lat != null && row.home_lng != null;
          const status = validityLabel(row, today);

          return (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-sm"
            >
              {/* HEADER CARD — sempre visibile */}
              <button
                type="button"
                onClick={() => toggleExpand(row.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-[var(--brand-text-main)]">
                    {row.display_name}
                  </span>
                  <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)] px-2 py-0.5 text-xs text-[var(--brand-primary)]">
                    {status}
                  </span>
                  <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                    {hasCoords ? '🏭 Magazzino OK' : '🏭 Senza coords'}
                  </span>
                  {(row.home_address || row.home_cap || row.home_city) && (
                    <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-0.5 text-xs text-[var(--brand-text-muted)]">
                      {hasHomeCoords ? '🏠 Casa OK' : '🏠 Casa senza coords'}
                    </span>
                  )}
                  {credenziali[row.id] && (
                    <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-primary-soft)] px-2 py-0.5 text-xs text-[var(--brand-primary)]">
                      📱 App
                    </span>
                  )}
                </div>
                <span className="text-[var(--brand-text-muted)] text-sm">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {/* DETTAGLIO — visibile solo se espanso */}
              {isExpanded && (
                <div className="border-t border-[var(--brand-border)] px-5 pb-5 pt-4">
                  <div className="flex justify-end mb-4">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSave(row)}
                      className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
                    >
                      {saving ? 'Salvataggio...' : 'Salva'}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[220px_220px_minmax(0,1fr)_120px_200px]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Valido dal
                      </label>
                      <input
                        type="date"
                        value={row.valid_from ?? ''}
                        onChange={(e) => updateRow(row.id, { valid_from: e.target.value || null })}
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Valido fino al
                      </label>
                      <input
                        type="date"
                        value={row.valid_to ?? ''}
                        onChange={(e) => updateRow(row.id, { valid_to: e.target.value || null })}
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Indirizzo di partenza
                      </label>
                      <input
                        value={row.start_address ?? ''}
                        onChange={(e) => updateRow(row.id, { start_address: e.target.value })}
                        placeholder="Via, piazza, civico..."
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        CAP
                      </label>
                      <input
                        value={row.start_cap ?? ''}
                        onChange={(e) => updateRow(row.id, { start_cap: e.target.value })}
                        placeholder="00000"
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Citta
                      </label>
                      <input
                        value={row.start_city ?? ''}
                        onChange={(e) => updateRow(row.id, { start_city: e.target.value })}
                        placeholder="Citta"
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Indirizzo casa */}
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_200px]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Indirizzo casa (reperibile)
                      </label>
                      <input
                        value={row.home_address ?? ''}
                        onChange={(e) => updateRow(row.id, { home_address: e.target.value })}
                        placeholder="Via, piazza, civico..."
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        CAP casa
                      </label>
                      <input
                        value={row.home_cap ?? ''}
                        onChange={(e) => updateRow(row.id, { home_cap: e.target.value })}
                        placeholder="00000"
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                        Città casa
                      </label>
                      <input
                        value={row.home_city ?? ''}
                        onChange={(e) => updateRow(row.id, { home_city: e.target.value })}
                        placeholder="Città"
                        className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                      Territorio di residenza operativa
                    </label>
                    <select
                      value={row.home_territory_id ?? ''}
                      onChange={(e) => updateRow(row.id, { home_territory_id: e.target.value || null })}
                      className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                    >
                      <option value="">Lazio (base principale)</option>
                      {territories.filter((territory) => territory.active !== false).map((territory) => (
                        <option key={territory.id} value={territory.id}>{territory.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-[var(--brand-text-muted)]">
                      Lazio Centro, Lazio Est, ACEA e Aurelia sono considerati la stessa area Lazio per le trasferte.
                    </p>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                      Centro di costo (predefinito)
                    </label>
                    <select
                      value={row.cost_center ?? ''}
                      onChange={(e) => updateRow(row.id, { cost_center: e.target.value || null })}
                      className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                    >
                      <option value="">— Nessuno —</option>
                      {COST_CENTERS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                    </select>
                  </div>
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                      Centri di costo a periodo (override)
                    </label>
                    <CostCenterRangesEditor
                      value={rangesByStaff[row.id] ?? []}
                      onChange={(r) => setRangesByStaff((prev) => ({ ...prev, [row.id]: r }))}
                    />
                  </div>

                  {/* Credenziali app: accesso dell'operatore all'app (utenza minima) */}
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                      Credenziali app
                    </label>
                    {credStato === 'caricamento' ? (
                      <p className="text-sm text-[var(--brand-text-muted)]">Caricamento…</p>
                    ) : credStato === 'errore' ? (
                      <p className="text-sm text-[var(--danger)]">
                        Credenziali non disponibili: ricarica la pagina.
                      </p>
                    ) : credenziali[row.id] ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--brand-text-main)]">
                            {credenziali[row.id]}
                          </div>
                          <div className="text-[11px] text-[var(--brand-text-muted)]">
                            Accesso: {toEmail(credenziali[row.id])}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => apriCredDialog('reset', row)}>
                          Reset password
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => apriCredDialog('scollega', row)}>
                          Scollega
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm text-[var(--brand-text-muted)]">Nessuna utenza app</span>
                        <Button variant="primary" size="sm" onClick={() => apriCredDialog('crea', row)}>
                          Crea utenza
                        </Button>
                      </div>
                    )}
                  </div>

                  <StoricoTrasferte staffId={row.id} />

                  <div className="mt-3 space-y-0.5 text-xs text-[var(--brand-text-muted)]">
                    <div>
                      <span className="font-semibold">Magazzino: </span>
                      {startAddress || 'Non impostato'}
                      {hasCoords && (
                        <span>{` · ${row.start_lat!.toFixed(5)}, ${row.start_lng!.toFixed(5)}`}</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold">Casa: </span>
                      {formatStaffHomeAddress(row) || 'Non impostata'}
                      {hasHomeCoords && (
                        <span>{` · ${row.home_lat!.toFixed(5)}, ${row.home_lng!.toFixed(5)}`}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-8 text-center text-sm text-[var(--brand-text-muted)] shadow-sm">
            Nessun operatore trovato.
          </div>
        )}
      </div>

      {showNewModal && (
        <NewOperatorModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleOperatorCreated}
          territories={territories}
        />
      )}

      {/* ── Dialog credenziali app (crea / reset / scollega) ─────────── */}
      <Dialog
        open={credDialog !== null}
        onClose={chiudiCredDialog}
        busy={credBusy}
        title={
          credDialog?.tipo === 'crea'
            ? 'Crea utenza app'
            : credDialog?.tipo === 'reset'
              ? 'Reset password'
              : 'Scollega utenza'
        }
        footer={
          tempPassword ? (
            <Button variant="primary" size="sm" onClick={chiudiCredDialog}>
              Fatto
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={credBusy} onClick={chiudiCredDialog}>
                Annulla
              </Button>
              <Button
                variant={credDialog?.tipo === 'scollega' ? 'danger' : 'primary'}
                size="sm"
                loading={credBusy}
                disabled={credDialog?.tipo === 'crea' && !normalizeUsername(credUsername)}
                onClick={() => void confermaCredDialog()}
              >
                {credDialog?.tipo === 'crea'
                  ? 'Crea utenza'
                  : credDialog?.tipo === 'reset'
                    ? 'Reset password'
                    : 'Scollega'}
              </Button>
            </>
          )
        }
      >
        {credDialog && (
          <div className="flex flex-col gap-3">
            {tempPassword ? (
              <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-4">
                <p className="text-sm text-[var(--brand-text-main)]">
                  Password temporanea per <strong>{tempPassword.username}</strong>:
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-1.5 text-base font-semibold tracking-wide text-[var(--brand-text-main)]">
                    {tempPassword.password}
                  </code>
                  <Button size="sm" onClick={() => void copiaTempPassword()}>
                    {copied ? 'Copiata ✓' : 'Copia'}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
                  Conservala ora: non sarà più visibile. L&apos;operatore la cambia al primo accesso.
                </p>
              </div>
            ) : credDialog.tipo === 'crea' ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
                    Username
                  </label>
                  <input
                    value={credUsername}
                    onChange={(e) => setCredUsername(e.target.value)}
                    placeholder="nome.cognome"
                    autoFocus
                    className="w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
                  />
                </div>
                <p className="text-sm text-[var(--brand-text-muted)]">
                  La password viene generata automaticamente e mostrata dopo la conferma.
                </p>
              </>
            ) : credDialog.tipo === 'reset' ? (
              <p className="text-sm text-[var(--brand-text-main)]">
                Generare una nuova password per{' '}
                <strong>{credenziali[credDialog.staff.id] ?? credDialog.staff.display_name}</strong>?
                Quella attuale smette subito di funzionare.
              </p>
            ) : (
              <p className="text-sm text-[var(--brand-text-main)]">
                Scollegare l&apos;utenza{' '}
                <strong>{credenziali[credDialog.staff.id] ?? ''}</strong> da{' '}
                {credDialog.staff.display_name}? L&apos;operatore non potrà più usare l&apos;app
                finché non viene ricollegato.
              </p>
            )}

            {credError && (
              <p className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                {credError}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

