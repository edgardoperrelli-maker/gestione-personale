'use client';

import { useEffect, useState } from 'react';
import {
  prefillModulesForRole,
  ASSIGNABLE_ROLE_LABELS,
  APP_MODULES,
  type AppModuleKey,
  type AssignableRole,
  type AppModuleGroup,
} from '@/lib/moduleAccess';
import Button from '@/components/Button';
import ObjectHeader from '@/components/ui/ObjectHeader';
import Badge from '@/components/Badge';
import Dialog from '@/components/ui/Dialog';

type ModuleOption = {
  key: AppModuleKey;
  label: string;
  description: string;
  adminOnly: boolean;
  requiresAdminRole: boolean;
};

type UserRow = {
  userId: string;
  email: string;
  username: string;
  role: AssignableRole;
  roleLabel: string;
  allowedModules: AppModuleKey[];
  createdAt: string;
  modificaInterventi: boolean;
};

type EditRow = UserRow & { newPassword: string };

type Feedback = { type: 'success' | 'error'; text: string } | null;

// Group metadata: labels and display order
const GROUP_META: Record<AppModuleGroup, { label: string; order: number }> = {
  pianificazione: { label: 'Pianificazione', order: 0 },
  operativita:    { label: 'Operatività', order: 1 },
  analisi:        { label: 'Analisi', order: 2 },
  sistema:        { label: 'Sistema', order: 3 },
};

// Role badge variant mapping
const ROLE_BADGE_VARIANT: Record<AssignableRole, 'warn' | 'progress' | 'muted'> = {
  admin_plus: 'warn',
  admin:      'progress',
  operatore:  'muted',
};

// Role accent dot color
const ROLE_DOT_COLOR: Record<AssignableRole, string> = {
  admin_plus: 'var(--status-warn)',
  admin:      'var(--status-progress)',
  operatore:  'var(--status-ok)',
};

function normalizeUsername(value: string) {
  const trimmed = value.trim().toLowerCase();
  const withoutDomain =
    trimmed.endsWith('@local.it') ? trimmed.slice(0, -'@local.it'.length) :
    trimmed.endsWith('@local') ? trimmed.slice(0, -'@local'.length) :
    trimmed;
  return withoutDomain.startsWith('u_') ? withoutDomain.slice(2) : withoutDomain;
}

function formatDate(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Avatar: neutral circle with initials + a role dot
function UserAvatar({ username, role, size = 'md' }: { username: string; role: AssignableRole; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
  return (
    <div className="relative shrink-0">
      <div
        className={`${dim} flex items-center justify-center rounded-full font-semibold uppercase`}
        style={{
          backgroundColor: 'var(--brand-surface-muted)',
          color: 'var(--brand-text-main)',
          border: '1px solid var(--brand-border)',
        }}
      >
        {username.charAt(0)}
      </div>
      <span
        className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--brand-surface)]"
        style={{ backgroundColor: ROLE_DOT_COLOR[role] }}
      />
    </div>
  );
}

// Grouped ModuleSelector with section headers + select-all/none per group
function ModuleSelector({
  selected,
  modules,
  onToggle,
  onSelectGroup,
}: {
  selected: AppModuleKey[];
  modules: ModuleOption[];
  onToggle: (moduleKey: AppModuleKey) => void;
  onSelectGroup?: (keys: AppModuleKey[], allSelected: boolean) => void;
}) {
  // Build groups from APP_MODULES order, using the group field
  const groups: { groupKey: AppModuleGroup; groupLabel: string; items: ModuleOption[] }[] = [];
  const seen = new Set<AppModuleGroup>();

  for (const appMod of APP_MODULES) {
    const group = (appMod.group ?? 'operativita') as AppModuleGroup;
    const mod = modules.find((m) => m.key === appMod.key);
    if (!mod) continue;
    if (!seen.has(group)) {
      seen.add(group);
      groups.push({ groupKey: group, groupLabel: GROUP_META[group]?.label ?? group, items: [] });
    }
    groups.find((g) => g.groupKey === group)!.items.push(mod);
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ groupKey, groupLabel, items }) => {
        const toggleableItems = items.filter((m) => !m.requiresAdminRole);
        const allSelected = toggleableItems.length > 0 && toggleableItems.every((m) => selected.includes(m.key));

        return (
          <div key={groupKey}>
            {/* Section header */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--brand-text-subtle)' }}
              >
                {groupLabel}
              </span>
              {onSelectGroup && toggleableItems.length > 0 && (
                <button
                  type="button"
                  className="text-[11px] transition hover:underline"
                  style={{ color: 'var(--brand-text-muted)' }}
                  onClick={() => onSelectGroup(toggleableItems.map((m) => m.key), allSelected)}
                >
                  {allSelected ? 'Nessuno' : 'Tutti'}
                </button>
              )}
            </div>

            {/* Module tiles */}
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((module) => {
                const checked = selected.includes(module.key);
                const locked = module.requiresAdminRole;

                return (
                  <label
                    key={module.key}
                    className={`flex items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 transition ${
                      locked ? 'opacity-60' : 'cursor-pointer hover:border-[var(--brand-primary)]'
                    }`}
                    style={{
                      borderColor: checked ? 'var(--brand-primary)' : 'var(--brand-border)',
                      backgroundColor: checked ? 'var(--brand-primary-soft)' : 'var(--brand-surface-muted)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      title={locked ? 'Questo modulo segue il ruolo e non può essere modificato' : undefined}
                      onChange={() => onToggle(module.key)}
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium leading-tight" style={{ color: 'var(--brand-text-main)' }}>
                        {module.label}
                        {module.requiresAdminRole ? (
                          <Badge variant="muted">Segue il ruolo</Badge>
                        ) : module.adminOnly ? (
                          <Badge variant="warn">Sensibile</Badge>
                        ) : null}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Inline form fields (username / password / role) used in both Create and Edit
const fieldLabel = 'mb-1 block text-xs font-medium';
const inputCls = 'w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)]';
const inputStyle = { borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)', backgroundColor: 'var(--brand-surface)' };

// Toggle del permesso-azione "modifica interventi" (separato dai moduli di accesso).
// Per gli Admin Plus è sempre attivo e bloccato (segue il ruolo).
function TogglePermessoModifica({
  role, checked, onChange,
}: {
  role: AssignableRole;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const isPlus = role === 'admin_plus';
  const effective = isPlus ? true : checked;
  return (
    <label
      className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 transition"
      style={{
        borderColor: effective ? 'var(--brand-primary)' : 'var(--brand-border)',
        backgroundColor: effective ? 'var(--brand-primary-soft)' : 'var(--brand-surface-muted)',
        cursor: isPlus ? 'default' : 'pointer',
        opacity: isPlus ? 0.7 : 1,
      }}
      title={isPlus ? 'Gli Admin Plus possono sempre modificare' : undefined}
    >
      <input
        type="checkbox"
        checked={effective}
        disabled={isPlus}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium" style={{ color: 'var(--brand-text-main)' }}>
          Può modificare gli interventi
        </span>
        <span className="block text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>
          Correggere dati/esiti e aggiungere foto nello storico, senza poter cancellare.
        </span>
      </span>
    </label>
  );
}

export default function UtenzeClient() {
  const [users, setUsers] = useState<EditRow[]>([]);
  const [availableModules, setAvailableModules] = useState<ModuleOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [resetting, setResetting] = useState(false);
  // Which user rows are expanded
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{
    username: string;
    password: string;
    role: AssignableRole;
    allowedModules: AppModuleKey[];
    modificaInterventi: boolean;
  }>({
    username: '',
    password: '',
    role: 'operatore',
    allowedModules: prefillModulesForRole('operatore'),
    modificaInterventi: false,
  });

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 4000);
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/users', { cache: 'no-store' });
        const json = await res.json() as { users?: UserRow[]; availableModules?: ModuleOption[]; currentUserId?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Errore caricamento utenti.');
        if (!active) return;
        setAvailableModules(json.availableModules ?? []);
        setCurrentUserId(json.currentUserId ?? null);
        setUsers((json.users ?? []).map((user) => ({
          ...user,
          newPassword: '',
        })));
      } catch (err) {
        if (active) {
          showFeedback('error', err instanceof Error ? err.message : 'Errore.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  const updateRow = (userId: string, patch: Partial<EditRow>) => {
    setUsers((prev) => prev.map((user) => (user.userId === userId ? { ...user, ...patch } : user)));
  };

  const toggleExpanded = (userId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleCreateModule = (moduleKey: AppModuleKey) => {
    setForm((prev) => {
      const hasModule = prev.allowedModules.includes(moduleKey);
      const nextModules = hasModule
        ? prev.allowedModules.filter((item) => item !== moduleKey)
        : [...prev.allowedModules, moduleKey];
      return { ...prev, allowedModules: nextModules };
    });
  };

  const selectCreateGroup = (keys: AppModuleKey[], allSelected: boolean) => {
    setForm((prev) => {
      const set = new Set(prev.allowedModules);
      if (allSelected) keys.forEach((k) => set.delete(k));
      else keys.forEach((k) => set.add(k));
      return { ...prev, allowedModules: Array.from(set) };
    });
  };

  const toggleUserModule = (userId: string, moduleKey: AppModuleKey) => {
    setUsers((prev) => prev.map((u) => {
      if (u.userId !== userId) return u;
      const hasModule = u.allowedModules.includes(moduleKey);
      const allowedModules = hasModule
        ? u.allowedModules.filter((item) => item !== moduleKey)
        : [...u.allowedModules, moduleKey];
      return { ...u, allowedModules };
    }));
  };

  const selectUserGroup = (userId: string, keys: AppModuleKey[], allSelected: boolean) => {
    setUsers((prev) => prev.map((u) => {
      if (u.userId !== userId) return u;
      const set = new Set(u.allowedModules);
      if (allSelected) keys.forEach((k) => set.delete(k));
      else keys.forEach((k) => set.add(k));
      return { ...u, allowedModules: Array.from(set) };
    }));
  };

  const handleCreateRoleChange = (role: AssignableRole) => {
    setForm((prev) => ({ ...prev, role, allowedModules: prefillModulesForRole(role) }));
  };

  const handleCreate = async () => {
    if (!form.username.trim()) return showFeedback('error', 'Username richiesto.');
    if (form.password.length < 6) return showFeedback('error', 'Password minimo 6 caratteri.');

    setCreating(true);
    try {
      const payload = {
        username: normalizeUsername(form.username),
        password: form.password,
        role: form.role,
        allowedModules: form.allowedModules,
        modificaInterventi: form.modificaInterventi,
      };

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { ok?: boolean; user?: UserRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Errore creazione.');

      setUsers((prev) => [...prev, {
        ...json.user!,
        newPassword: '',
      }].sort((a, b) => a.username.localeCompare(b.username, 'it')));

      setForm({
        username: '',
        password: '',
        role: 'operatore',
        allowedModules: prefillModulesForRole('operatore'),
        modificaInterventi: false,
      });
      showFeedback('success', `Utenza "${json.user?.username}" creata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore.');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (user: EditRow) => {
    setSaving(user.userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          username: normalizeUsername(user.username),
          role: user.role,
          password: user.newPassword || undefined,
          allowedModules: user.allowedModules,
          modificaInterventi: user.modificaInterventi,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Errore salvataggio.');
      updateRow(user.userId, { newPassword: '' });
      showFeedback('success', `Utenza "${user.username}" aggiornata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore.');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (userId: string, username: string) => {
    setDeleting(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Errore eliminazione.');
      setUsers((prev) => prev.filter((user) => user.userId !== userId));
      showFeedback('success', `Utenza "${username}" eliminata.`);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Errore.');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  // The user targeted by confirmDelete dialog
  const deleteTarget = users.find((u) => u.userId === confirmDelete) ?? null;
  // The user targeted by resetId dialog
  const resetTarget = users.find((u) => u.userId === resetId) ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <ObjectHeader
        title="Impostazioni Utenze"
        sub="Il ruolo precompila i moduli; poi puoi abilitarli o disabilitarli liberamente per ogni utente."
      />

      {feedback && (
        <div
          className={`rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]'
              : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* ── Create section ───────────────────────────────────────── */}
      <section
        className="rounded-[var(--radius-lg)] border shadow-[var(--shadow-sm)]"
        style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
      >
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--brand-border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Nuova utenza</h2>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            L&apos;accesso viene creato nel formato <code className="rounded bg-[var(--brand-surface-muted)] px-1">u_username@local.it</code>.
          </p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <label className={`${fieldLabel}`} style={{ color: 'var(--brand-text-muted)' }}>Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: normalizeUsername(e.target.value) }))}
              placeholder="es. mario.rossi"
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={`${fieldLabel}`} style={{ color: 'var(--brand-text-muted)' }}>Password iniziale</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="Minimo 6 caratteri"
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label className={`${fieldLabel}`} style={{ color: 'var(--brand-text-muted)' }}>Ruolo</label>
            <select
              value={form.role}
              onChange={(e) => handleCreateRoleChange(e.target.value as AssignableRole)}
              className={inputCls}
              style={inputStyle}
            >
              {Object.entries(ASSIGNABLE_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>Moduli visibili</h3>
              <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                Impostazioni segue il ruolo; gli altri moduli sono liberi.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setForm((prev) => ({ ...prev, allowedModules: prefillModulesForRole(prev.role) }))}
              >
                Reimposta default ruolo
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Creazione...' : 'Crea utenza'}
              </Button>
            </div>
          </div>

          <ModuleSelector
            selected={form.allowedModules}
            modules={availableModules}
            onToggle={toggleCreateModule}
            onSelectGroup={selectCreateGroup}
          />
          <TogglePermessoModifica
            role={form.role}
            checked={form.modificaInterventi}
            onChange={(value) => setForm((prev) => ({ ...prev, modificaInterventi: value }))}
          />
        </div>
      </section>

      {/* ── User list section ─────────────────────────────────────── */}
      <section
        className="rounded-[var(--radius-lg)] border shadow-[var(--shadow-sm)]"
        style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Utenze configurate</h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
              Clicca su una riga per espandere le opzioni di modifica.
            </p>
          </div>
          <Badge variant="primary">{users.length} utenti</Badge>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Caricamento utenze...</div>
        ) : users.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna utenza configurata.</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--brand-border)' }}>
            {users.map((user) => {
              const isSelf = user.userId === currentUserId;
              const isExpanded = expandedRows.has(user.userId);

              return (
                <li key={user.userId}>
                  {/* Dense row (always visible) */}
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--brand-surface-muted)]"
                    onClick={() => toggleExpanded(user.userId)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(user.userId); } }}
                  >
                    <UserAvatar username={user.username} role={user.role} size="sm" />

                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
                        {user.username}
                        {isSelf && (
                          <span className="ml-1.5 text-xs" style={{ color: 'var(--brand-text-subtle)' }}>(tu)</span>
                        )}
                      </span>
                    </span>

                    <Badge variant={ROLE_BADGE_VARIANT[user.role]} className="shrink-0 text-[10px]">
                      {ASSIGNABLE_ROLE_LABELS[user.role]}
                    </Badge>

                    <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--brand-text-subtle)' }}>
                      {formatDate(user.createdAt)}
                    </span>

                    {/* Expand chevron */}
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--brand-text-subtle)' }}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>

                  {/* Expanded edit panel */}
                  {isExpanded && (
                    <div
                      className="border-t px-5 pb-5 pt-4"
                      style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface-muted)' }}
                    >
                      {/* Fields row */}
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--brand-text-muted)' }}>Username</label>
                          <input
                            type="text"
                            value={user.username}
                            onChange={(e) => updateRow(user.userId, { username: normalizeUsername(e.target.value) })}
                            className={inputCls}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--brand-text-muted)' }}>Nuova password</label>
                          <input
                            type="password"
                            value={user.newPassword}
                            onChange={(e) => updateRow(user.userId, { newPassword: e.target.value })}
                            placeholder="Lascia vuoto per non cambiare"
                            className={inputCls}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className={fieldLabel} style={{ color: 'var(--brand-text-muted)' }}>Ruolo</label>
                          <select
                            value={user.role}
                            disabled={isSelf}
                            title={isSelf ? 'Non puoi cambiare il tuo ruolo' : undefined}
                            onChange={(e) => updateRow(user.userId, {
                              role: e.target.value as AssignableRole,
                              allowedModules: prefillModulesForRole(e.target.value as AssignableRole),
                            })}
                            className={`${inputCls} disabled:opacity-60`}
                            style={inputStyle}
                          >
                            {Object.entries(ASSIGNABLE_ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Module selector */}
                      <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>Moduli abilitati</h3>
                            <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                              Impostazioni segue il ruolo; gli altri moduli sono liberamente abilitabili.
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateRow(user.userId, { allowedModules: prefillModulesForRole(user.role) })}
                          >
                            Reimposta default ruolo
                          </Button>
                        </div>

                        <ModuleSelector
                          selected={user.allowedModules}
                          modules={availableModules}
                          onToggle={(moduleKey) => toggleUserModule(user.userId, moduleKey)}
                          onSelectGroup={(keys, allSelected) => selectUserGroup(user.userId, keys, allSelected)}
                        />
                        <TogglePermessoModifica
                          role={user.role}
                          checked={user.modificaInterventi}
                          onChange={(value) => updateRow(user.userId, { modificaInterventi: value })}
                        />
                      </div>

                      {/* Action bar */}
                      <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4" style={{ borderColor: 'var(--brand-border)' }}>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setResetId(user.userId); setNewPwd(''); }}
                          >
                            Reset password
                          </Button>
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(user.userId)}
                              className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                            >
                              Elimina
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(user.userId)}
                          >
                            Annulla
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => void handleSave(user)}
                            disabled={saving === user.userId}
                          >
                            {saving === user.userId ? 'Salvo...' : 'Salva modifiche'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Confirm delete Dialog ─────────────────────────────────── */}
      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Elimina utenza"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={deleting === confirmDelete}
              onClick={() => deleteTarget && void handleDelete(deleteTarget.userId, deleteTarget.username)}
            >
              {deleting === confirmDelete ? 'Elimino...' : 'Conferma eliminazione'}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-sm" style={{ color: 'var(--brand-text-main)' }}>
            Sei sicuro di voler eliminare l&apos;utenza{' '}
            <strong>{deleteTarget.username}</strong>? L&apos;operazione non è reversibile.
          </p>
        )}
      </Dialog>

      {/* ── Reset password Dialog ─────────────────────────────────── */}
      <Dialog
        open={resetId !== null}
        onClose={() => { setResetId(null); setNewPwd(''); }}
        title="Reimposta password"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => { setResetId(null); setNewPwd(''); }}>
              Annulla
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={resetting || newPwd.length < 6}
              onClick={async () => {
                if (newPwd.length < 6 || !resetTarget) return;
                setResetting(true);
                try {
                  const response = await fetch('/api/admin/users', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: resetTarget.userId, password: newPwd }),
                  });
                  if (response.ok) {
                    showFeedback('success', `Password resettata per "${resetTarget.username}"`);
                    setResetId(null);
                    setNewPwd('');
                  } else {
                    const json = await response.json() as { error?: string };
                    showFeedback('error', json.error ?? 'Errore nel reset password');
                  }
                } catch (err) {
                  showFeedback('error', err instanceof Error ? err.message : 'Errore');
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? 'Salvo...' : 'Reimposta'}
            </Button>
          </>
        }
      >
        {resetTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              Nuova password per <strong style={{ color: 'var(--brand-text-main)' }}>{resetTarget.username}</strong>
            </p>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Minimo 6 caratteri"
              className={inputCls}
              style={inputStyle}
              autoFocus
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
