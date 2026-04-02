'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_ALLOWED_MODULES,
  normalizeAllowedModules,
  ROLE_LABELS,
  type AppModuleKey,
  type ValidRole,
} from '@/lib/moduleAccess';

type ModuleOption = {
  key: AppModuleKey;
  label: string;
  description: string;
  adminOnly: boolean;
};

type UserRow = {
  userId: string;
  email: string;
  username: string;
  role: ValidRole;
  roleLabel: string;
  allowedModules: AppModuleKey[];
  createdAt: string;
};

type EditRow = UserRow & { newPassword: string };

type Feedback = { type: 'success' | 'error'; text: string } | null;

const ROLE_COLORS: Record<ValidRole, string> = {
  admin: '#921B1B',
  operatore: '#1E6B2E',
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

function applyModules(role: ValidRole, modules: AppModuleKey[]) {
  return normalizeAllowedModules(modules, role);
}

function ModuleSelector({
  selected,
  role,
  modules,
  onToggle,
}: {
  selected: AppModuleKey[];
  role: ValidRole;
  modules: ModuleOption[];
  onToggle: (moduleKey: AppModuleKey) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => {
        const checked = selected.includes(module.key);
        const disabled = module.adminOnly && role !== 'admin';

        return (
          <label
            key={module.key}
            className={`flex items-start gap-3 rounded-2xl border px-3 py-3 transition ${
              disabled ? 'opacity-60' : 'cursor-pointer hover:border-[var(--brand-primary)]'
            }`}
            style={{
              borderColor: checked ? 'var(--brand-primary)' : 'var(--brand-border)',
              backgroundColor: checked ? 'var(--brand-primary-soft)' : '#fff',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(module.key)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                {module.label}
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
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    username: string;
    password: string;
    role: ValidRole;
    allowedModules: AppModuleKey[];
  }>({
    username: '',
    password: '',
    role: 'operatore',
    allowedModules: applyModules('operatore', DEFAULT_ALLOWED_MODULES),
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
        const json = await res.json() as { users?: UserRow[]; availableModules?: ModuleOption[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Errore caricamento utenti.');
        if (!active) return;
        setAvailableModules(json.availableModules ?? []);
        setUsers((json.users ?? []).map((user) => ({
          ...user,
          allowedModules: applyModules(user.role, user.allowedModules),
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
    setUsers((prev) => prev.map((user) => {
      if (user.userId !== userId) return user;
      const next = { ...user, ...patch };
      return {
        ...next,
        allowedModules: applyModules(next.role, next.allowedModules),
      };
    }));
  };

  const toggleCreateModule = (moduleKey: AppModuleKey) => {
    setForm((prev) => {
      const hasModule = prev.allowedModules.includes(moduleKey);
      const nextModules = hasModule
        ? prev.allowedModules.filter((item) => item !== moduleKey)
        : [...prev.allowedModules, moduleKey];
      return {
        ...prev,
        allowedModules: applyModules(prev.role, nextModules),
      };
    });
  };

  const toggleUserModule = (user: EditRow, moduleKey: AppModuleKey) => {
    const hasModule = user.allowedModules.includes(moduleKey);
    const nextModules = hasModule
      ? user.allowedModules.filter((item) => item !== moduleKey)
      : [...user.allowedModules, moduleKey];
    updateRow(user.userId, { allowedModules: applyModules(user.role, nextModules) });
  };

  const handleCreateRoleChange = (role: ValidRole) => {
    setForm((prev) => ({
      ...prev,
      role,
      allowedModules: applyModules(role, prev.allowedModules),
    }));
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
        allowedModules: applyModules(form.role, form.allowedModules),
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
        allowedModules: applyModules(json.user!.role, json.user!.allowedModules),
        newPassword: '',
      }].sort((a, b) => a.username.localeCompare(b.username, 'it')));

      setForm({
        username: '',
        password: '',
        role: 'operatore',
        allowedModules: applyModules('operatore', DEFAULT_ALLOWED_MODULES),
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
          allowedModules: applyModules(user.role, user.allowedModules),
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
          Gestisci password, ruoli e moduli visibili per ogni utenza di accesso.
        </p>
      </div>

      {feedback && (
        <div
          className="rounded-xl border px-4 py-3 text-sm font-medium"
          style={
            feedback.type === 'success'
              ? { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', color: '#14532D' }
              : { borderColor: '#FECDD3', backgroundColor: '#FFF1F2', color: '#881337' }
          }
        >
          {feedback.text}
        </div>
      )}

      <section className="rounded-3xl border bg-white shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--brand-border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Nuova utenza</h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            L&apos;accesso viene creato nel formato <code className="rounded bg-gray-100 px-1">u_username@local.it</code>.
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
              onChange={(e) => handleCreateRoleChange(e.target.value as ValidRole)}
              className={inputCls}
              style={inputStyle}
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
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
                Il modulo Impostazioni resta riservato agli admin.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {creating ? 'Creazione...' : 'Crea utenza'}
            </button>
          </div>

          <ModuleSelector
            selected={form.allowedModules}
            role={form.role}
            modules={availableModules}
            onToggle={toggleCreateModule}
          />
        </div>
      </section>

      <section className="rounded-3xl border bg-white shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
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
            {users.map((user) => (
              <article
                key={user.userId}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: '#fff' }}
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
                      {ROLE_LABELS[user.role]}
                    </span>
                    {confirmDelete === user.userId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDelete(user.userId, user.username)}
                          disabled={deleting === user.userId}
                          className="rounded-xl border px-3 py-1.5 text-xs font-semibold transition"
                          style={{ borderColor: '#FECDD3', backgroundColor: '#FFF1F2', color: '#881337' }}
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
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium transition hover:border-rose-300 hover:text-rose-700"
                        style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </div>

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
                      onChange={(e) => updateRow(user.userId, {
                        role: e.target.value as ValidRole,
                        allowedModules: applyModules(e.target.value as ValidRole, user.allowedModules),
                      })}
                      className={inputCls}
                      style={inputStyle}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
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
                        Se il ruolo non è admin, Impostazioni viene escluso automaticamente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSave(user)}
                      disabled={saving === user.userId}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      {saving === user.userId ? 'Salvo...' : 'Salva modifiche'}
                    </button>
                  </div>

                  <ModuleSelector
                    selected={user.allowedModules}
                    role={user.role}
                    modules={availableModules}
                    onToggle={(moduleKey) => toggleUserModule(user, moduleKey)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
