'use client';
import { useCallback, useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

type ZtlZone = {
  id: string;
  name: string;
  description: string;
  cap_list: string[];
  active: boolean;
  created_at: string;
};

type StaffMember = { id: string; display_name: string };
type ZoneOp = { zone_id: string; staff_id: string };

type Props = {
  initialZones: ZtlZone[];
  staff: StaffMember[];
  initialZoneOps: ZoneOp[];
};

type Feedback = { type: 'success' | 'error'; message: string };

export default function ZtlZoneClient({ initialZones, staff, initialZoneOps }: Props) {
  const supabase = createClientComponentClient();
  const [zones, setZones] = useState<ZtlZone[]>(initialZones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(
    initialZones.length > 0 ? initialZones[0].id : null
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // ── Form state per la zona selezionata ─────────────────────────────────────
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCapInput, setFormCapInput] = useState('');
  const [formCapList, setFormCapList] = useState<string[]>([]);
  const [formAuthorizedIds, setFormAuthorizedIds] = useState<string[]>([]);
  const [isCreatingZone, setIsCreatingZone] = useState(false);

  // ── Sync form quando seleziono una zona ────────────────────────────────────
  useEffect(() => {
    if (!selectedZoneId) {
      setFormName('');
      setFormDesc('');
      setFormCapList([]);
      setFormAuthorizedIds([]);
      return;
    }
    const zone = zones.find((z) => z.id === selectedZoneId);
    if (zone) {
      setFormName(zone.name);
      setFormDesc(zone.description);
      setFormCapList(zone.cap_list || []);
      const authorized = initialZoneOps
        .filter((op) => op.zone_id === selectedZoneId)
        .map((op) => op.staff_id);
      setFormAuthorizedIds(authorized);
    }
  }, [selectedZoneId, zones, initialZoneOps]);

  // ── Helper: validazione CAP ───────────────────────────────────────────────
  const isValidCap = (cap: string) => /^\d{5}$/.test(cap.trim());

  // ── Aggiunta CAP (Enter o virgola) ────────────────────────────────────────
  const handleCapKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const cap = formCapInput.trim().replace(/,$/, '');
      if (cap && isValidCap(cap) && !formCapList.includes(cap)) {
        setFormCapList((prev) => [...prev, cap]);
        setFormCapInput('');
      } else if (cap && !isValidCap(cap)) {
        showFeedback('error', 'CAP deve essere di 5 cifre');
      }
    }
  };

  // ── Rimozione CAP ─────────────────────────────────────────────────────────
  const removeCap = (cap: string) => {
    setFormCapList((prev) => prev.filter((c) => c !== cap));
  };

  // ── Creazione nuova zona ──────────────────────────────────────────────────
  const createNewZone = async () => {
    const { data, error } = await supabase
      .from('ztl_zones')
      .insert({
        name: 'Nuova zona',
        description: '',
        cap_list: [],
        active: true,
      })
      .select()
      .single();

    if (error) {
      showFeedback('error', `Errore: ${error.message}`);
      return;
    }

    const newZone = data as ZtlZone;
    setZones((prev) => [...prev, newZone]);
    setSelectedZoneId(newZone.id);
    showFeedback('success', 'Zona creata');
  };

  // ── Salva info zona ──────────────────────────────────────────────────────
  const saveZoneInfo = async () => {
    if (!selectedZoneId || !formName.trim()) {
      showFeedback('error', 'Il nome della zona è obbligatorio');
      return;
    }

    const { error } = await supabase
      .from('ztl_zones')
      .update({ name: formName, description: formDesc })
      .eq('id', selectedZoneId);

    if (error) {
      showFeedback('error', `Errore: ${error.message}`);
      return;
    }

    setZones((prev) =>
      prev.map((z) =>
        z.id === selectedZoneId ? { ...z, name: formName, description: formDesc } : z
      )
    );
    showFeedback('success', 'Informazioni salvate');
  };

  // ── Salva CAP ────────────────────────────────────────────────────────────
  const saveCapList = async () => {
    if (!selectedZoneId) return;

    const { error } = await supabase
      .from('ztl_zones')
      .update({ cap_list: formCapList })
      .eq('id', selectedZoneId);

    if (error) {
      showFeedback('error', `Errore: ${error.message}`);
      return;
    }

    setZones((prev) =>
      prev.map((z) => (z.id === selectedZoneId ? { ...z, cap_list: formCapList } : z))
    );
    showFeedback('success', 'CAP salvati');
  };

  // ── Salva operatori ──────────────────────────────────────────────────────
  const saveOperators = async () => {
    if (!selectedZoneId) return;

    // Elimina tutti gli operatori della zona
    const { error: delError } = await supabase
      .from('ztl_zone_operators')
      .delete()
      .eq('zone_id', selectedZoneId);

    if (delError) {
      showFeedback('error', `Errore eliminazione: ${delError.message}`);
      return;
    }

    // Inserisci i nuovi operatori
    if (formAuthorizedIds.length > 0) {
      const { error: insError } = await supabase
        .from('ztl_zone_operators')
        .insert(formAuthorizedIds.map((sid) => ({ zone_id: selectedZoneId, staff_id: sid })));

      if (insError) {
        showFeedback('error', `Errore inserimento: ${insError.message}`);
        return;
      }
    }

    showFeedback('success', 'Operatori salvati');
  };

  // ── Toggle active ────────────────────────────────────────────────────────
  const toggleActive = async (zoneId: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('ztl_zones')
      .update({ active: !currentActive })
      .eq('id', zoneId);

    if (error) {
      showFeedback('error', `Errore: ${error.message}`);
      return;
    }

    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, active: !z.active } : z))
    );
    showFeedback('success', currentActive ? 'Zona disattivata' : 'Zona attivata');
  };

  // ── Elimina zona ──────────────────────────────────────────────────────
  const deleteZone = async () => {
    if (!selectedZoneId) return;
    if (!confirm('Confermi di eliminare questa zona?')) return;

    const { error } = await supabase.from('ztl_zones').delete().eq('id', selectedZoneId);

    if (error) {
      showFeedback('error', `Errore: ${error.message}`);
      return;
    }

    setZones((prev) => prev.filter((z) => z.id !== selectedZoneId));
    setSelectedZoneId(zones.length > 1 ? zones[0].id : null);
    showFeedback('success', 'Zona eliminata');
  };

  // ── Feedback ──────────────────────────────────────────────────────────
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ─── COLONNA SINISTRA: Lista zone ─────────────────────────────────────── */}
      <div className="flex max-w-sm flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--brand-text-main)]">Zone ZTL</h2>
          <button
            type="button"
            onClick={createNewZone}
            disabled={isCreatingZone}
            className="rounded-xl bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            + Nuova
          </button>
        </div>

        {zones.length === 0 ? (
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6 text-center text-sm text-[var(--brand-text-muted)]">
            Nessuna zona ZTL ancora. Creane una.
          </div>
        ) : (
          <div className="space-y-2">
            {zones.map((zone) => (
              <div
                key={zone.id}
                onClick={() => setSelectedZoneId(zone.id)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  selectedZoneId === zone.id
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]'
                    : 'border-[var(--brand-border)] bg-white hover:border-[var(--brand-primary)]'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[var(--brand-text-main)]">{zone.name}</h3>
                  <input
                    type="checkbox"
                    checked={zone.active}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleActive(zone.id, zone.active);
                    }}
                    className="h-4 w-4 accent-[var(--brand-primary)]"
                  />
                </div>
                <p className="text-xs text-[var(--brand-text-muted)]">
                  {zone.cap_list.length} CAP · {initialZoneOps.filter((op) => op.zone_id === zone.id).length} operatori
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── COLONNA DESTRA: Pannello dettaglio ────────────────────────────────── */}
      <div className="flex-1 space-y-4">
        {!selectedZone ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white">
            <div className="text-center">
              <div className="mb-3 text-4xl">🗺️</div>
              <p className="text-sm text-[var(--brand-text-muted)]">
                Seleziona una zona per modificarla o creane una nuova
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ─── SEZIONE 1: Info zona ────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
              <h3 className="mb-4 font-semibold text-[var(--brand-text-main)]">Informazioni zona</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-text-muted)]">Nome zona</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                    placeholder="es. ZTL Firenze"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--brand-text-muted)]">Descrizione</label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                    placeholder="Descrizione della zona..."
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={saveZoneInfo}
                  className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Salva modifiche
                </button>
                <button
                  type="button"
                  onClick={deleteZone}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Elimina zona
                </button>
              </div>
            </div>

            {/* ─── SEZIONE 2: CAP ──────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">CAP inclusi nella ZTL</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Inserisci i CAP separati da virgola o premi Invio dopo ogni CAP
              </p>
              <div className="mb-4 flex gap-2">
                <input
                  type="text"
                  value={formCapInput}
                  onChange={(e) => setFormCapInput(e.target.value)}
                  onKeyDown={handleCapKeyDown}
                  className="flex-1 rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                  placeholder="es. 50100"
                  maxLength={5}
                />
              </div>
              {formCapList.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {formCapList.map((cap) => (
                    <span
                      key={cap}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary-soft)] border border-[var(--brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-primary)]"
                    >
                      {cap}
                      <button
                        onClick={() => removeCap(cap)}
                        className="ml-1 text-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={saveCapList}
                className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Salva CAP
              </button>
            </div>

            {/* ─── SEZIONE 3: Operatori ──────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
              <h3 className="mb-1 font-semibold text-[var(--brand-text-main)]">Operatori con permesso ZTL</h3>
              <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
                Solo gli operatori selezionati potranno ricevere attività in questa zona
              </p>
              <div className="mb-4 space-y-2">
                {staff.map((member) => {
                  const authorized = formAuthorizedIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition hover:bg-[var(--brand-primary-soft)]"
                      style={{
                        borderColor: authorized ? 'var(--brand-primary)' : 'var(--brand-border)',
                        backgroundColor: authorized ? 'var(--brand-primary-soft)' : 'white',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={authorized}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormAuthorizedIds((prev) => [...prev, member.id]);
                          } else {
                            setFormAuthorizedIds((prev) => prev.filter((id) => id !== member.id));
                          }
                        }}
                        className="h-4 w-4 accent-[var(--brand-primary)]"
                      />
                      <span className="text-sm font-medium text-[var(--brand-text-main)]">
                        {member.display_name}
                      </span>
                      {authorized && (
                        <span className="ml-auto text-xs font-semibold text-[var(--brand-primary)]">
                          Autorizzato
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={saveOperators}
                className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Salva operatori
              </button>
            </div>
          </>
        )}
      </div>

      {/* ─── FEEDBACK TOAST ───────────────────────────────────────────────────────── */}
      {feedback && (
        <div
          className={`fixed bottom-4 right-4 rounded-lg px-4 py-3 text-sm font-semibold text-white transition ${
            feedback.type === 'success'
              ? 'bg-green-600'
              : 'bg-red-600'
          }`}
        >
          {feedback.type === 'success' ? '✓ ' : '✗ '}{feedback.message}
        </div>
      )}
    </div>
  );
}
