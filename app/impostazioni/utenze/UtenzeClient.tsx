'use client';

import { useEffect, useState } from 'react';
import {
  prefillModulesForRole,
  ASSIGNABLE_ROLE_LABELS,
  type AppModuleKey,
  type AssignableRole,
} from '@/lib/moduleAccess';

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
};

type EditRow = UserRow & { newPassword: string };

type Feedback = { type: 'success' | 'error'; text: string } | null;

const ROLE_COLORS: Record<AssignableRole, string> = {
  admin_plus: 'var(--brand-gold)',
  admin: 'var(--danger)',
  operatore: 'var(--success)',
};

const inputCls =
  'w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] focus:border-[var(--brand-primary)]';
const inputStyle = { borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' };

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

function ModuleSelector({
  selected,
  modules,
  onToggle,
}: {
  selected: AppModuleKey[];
  modules: ModuleOption[];
  onToggle: (moduleKey: AppModuleKey) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => {
        const checked = selected.includes(module.key);
        const locked = module.requiresAdminRole; // Impostazioni: segue il ruolo, non si tocca

        return (
          <label
            key={module.key}
            className={`flex items-start gap-3 rounded-2xl border px-3 py-3 transition ${
              locked ? 'opacity-60' : 'cursor-pointer hover:border-[var(--brand-primary)]'
            }`}
            style={{
              borderColor: checked ? 'var(--brand-primary)' : 'var(--brand-border)',
              backgroundColor: checked ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={locked}
              title={locked ? 'Questo modulo segue il ruolo e non può essere modificato' : undefined}
              onChange={() => onToggle(module.key)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                {module.label}
                {module.requiresAdminRole ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--brand-surface-muted)', color: 'var(--brand-text-muted)' }}
                  >
                    Segue il ruolo
                  </span>
                ) : module.adminOnly ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--info-soft)', color: 'var(--info)' }}
                  >
                    Sensibile
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed" style={{ color: 'var(--brand-text-muted)' }}>
                {module.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
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
  const [form, setForm] = useState<{
    username: string;
    password: string;
    role: AssignableRole;
    allowedModules: AppModuleKey[];
  }>({
    username: '',
    password: '',
    role: 'operatore',
    allowedModules: prefillModulesForRole('operatore'),
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

  const toggleCreateModule = (moduleKey: AppModuleKey) => {
    setForm((prev) => {
      const hasModule = prev.allowedModules.includes(moduleKey);
      const nextModules = hasModule
        ? prev.allowedModules.filter((item) => item !== moduleKey)
        : [...prev.allowedModules, moduleKey];
      return { ...prev, allowedModules: nextModules };
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-text-main)' }}>Impostazioni Utenze</h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Il ruolo precompila i moduli; poi puoi abilitarli o disabilitarli liberamente per ogni utente.
        </p>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]'
              : 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <section className="rounded-3xl border bg-[var(--brand-surface)] shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--brand-border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Nuova utenza</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            L&apos;accesso viene creato nel formato <code className="rounded bg-[var(--brand-surface-muted)] px-1">u_username@local.it</code>.
          </p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Username</label>
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
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Password iniziale</label>
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
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Ruolo</label>
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

        <div className="border-t px-5 py-5" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>Moduli visibili</h3>
              <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                Impostazioni segue il ruolo (sempre per gli admin, mai per gli operatori); gli altri moduli sono liberi.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, allowedModules: prefillModulesForRole(prev.role) }))}
                className="rounded-xl border px-3 py-2 text-xs font-medium transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
              >
                Reimposta ai default del ruolo
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {creating ? 'Creazione...' : 'Crea utenza'}
              </button>
            </div>
          </div>

          <ModuleSelector
            selected={form.allowedModules}
            modules={availableModules}
            onToggle={toggleCreateModule}
          />
        </div>
      </section>

      <section className="rounded-3xl border bg-[var(--brand-surface)] shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--brand-border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Utenze configurate</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
              Modifica direttamente password, ruolo e moduli associati a ogni utente.
            </p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}>
            {users.length} utenti
          </span>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Caricamento utenze...</div>
        ) : users.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna utenza configurata.</div>
        ) : (
          <div className="grid gap-4 p-5">
            {users.map((user) => {
              const isSelf = user.userId === currentUserId;
              return (
              <article
                key={user.userId}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white uppercase"
                      style={{ backgroundColor: ROLE_COLORS[user.role] }}
                    >
                      {user.username.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>{user.username}</p>
                      <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                        Creato il {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: ROLE_COLORS[user.role] }}
                    >
                      {ASSIGNABLE_ROLE_LABELS[user.role]}
                    </span>
                    {resetId === user.userId ? (
                      <button
                        type="button"
                        onClick={() => { setResetId(null); setNewPwd(''); }}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        ← Indietro
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setResetId(user.userId); setNewPwd(''); }}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        Reset password
                      </button>
                    )}
                    {confirmDelete === user.userId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDelete(user.userId, user.username)}
                          disabled={deleting === user.userId}
                          className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] px-3 py-1.5 text-xs font-semibold transition"
                        >
                          {deleting === user.userId ? 'Elimino...' : 'Conferma eliminazione'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium"
                          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(user.userId)}
                        disabled={isSelf}
                        title={isSelf ? 'Non puoi eliminare la tua utenza' : undefined}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium transition enabled:hover:border-[var(--danger)] enabled:hover:text-[var(--danger)] disabled:opacity-50"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>

                {resetId === user.userId && (
                  <div className="mt-3 flex items-center gap-1 rounded-lg border border-[var(--info)] bg-[var(--info-soft)] p-3">
                    <input
                      type="password"
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                      placeholder="Nuova password (min. 6 car.)"
                      className="rounded border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-main)] px-2 py-1 text-xs flex-1 max-w-xs"
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        if (newPwd.length < 6) return;
                        setResetting(true);
                        try {
                          const response = await fetch('/api/admin/users', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: user.userId, password: newPwd }),
                          });
                          if (response.ok) {
                            showFeedback('success', `Password resettata per "${user.username}"`);
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
                      disabled={resetting || newPwd.length < 6}
                      className="rounded bg-[var(--brand-primary)] px-3 py-1 text-xs text-[oklch(0.16_0.06_245)] font-medium disabled:opacity-50 transition"
                    >
                      {resetting ? '...' : 'Salva'}
                    </button>
                    <button
                      onClick={() => { setResetId(null); setNewPwd(''); }}
                      className="rounded border border-[var(--brand-border)] px-3 py-1 text-xs text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface)] transition"
                    >
                      Annulla
                    </button>
                  </div>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Username</label>
                    <input
                      type="text"
                      value={user.username}
                      onChange={(e) => updateRow(user.userId, { username: normalizeUsername(e.target.value) })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Nuova password</label>
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
                    <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--brand-text-muted)' }}>Ruolo</label>
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

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>Moduli abilitati</h3>
                      <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                        Impostazioni segue il ruolo; gli altri moduli sono liberamente abilitabili.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateRow(user.userId, { allowedModules: prefillModulesForRole(user.role) })}
                        className="rounded-xl border px-3 py-2 text-xs font-medium transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        Reimposta ai default del ruolo
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave(user)}
                        disabled={saving === user.userId}
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition disabled:opacity-60"
                        style={{ backgroundColor: 'var(--brand-primary)' }}
                      >
                        {saving === user.userId ? 'Salvo...' : 'Salva modifiche'}
                      </button>
                    </div>
                  </div>

                  <ModuleSelector
                    selected={user.allowedModules}
                    modules={availableModules}
                    onToggle={(moduleKey) => toggleUserModule(user.userId, moduleKey)}
                  />
                </div>
              </article>
            );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
