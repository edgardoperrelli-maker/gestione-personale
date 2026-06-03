import { describe, it, expect } from 'vitest';
import { resolveUserRole, canAccessPathFromMetadata, buildAppMetadataUpdate } from './moduleAccess';

describe('resolveUserRole', () => {
  it('admin_plus (solo in app_metadata) è autorizzato come admin', () => {
    // profile.role per un admin_plus è 'admin', ma il middleware non legge il DB:
    // deve riconoscere admin_plus dal solo app_metadata.
    expect(resolveUserRole(null, 'admin_plus')).toBe('admin');
  });
  it('admin resta admin', () => {
    expect(resolveUserRole('admin', 'admin')).toBe('admin');
  });
  it('operatore (profilo viewer) resta operatore', () => {
    expect(resolveUserRole('viewer', 'operatore')).toBe('operatore');
  });
  it('ruolo assente → operatore', () => {
    expect(resolveUserRole(null, undefined)).toBe('operatore');
  });
});

describe('canAccessPathFromMetadata (logica del middleware)', () => {
  it('admin_plus può accedere a /impostazioni', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'admin_plus' })).toBe(true);
  });
  it('admin può accedere a /impostazioni', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'admin' })).toBe(true);
  });
  it('operatore NON può accedere a /impostazioni', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'operatore' })).toBe(false);
  });
  it('admin_plus può accedere ai moduli standard (/dashboard)', () => {
    expect(canAccessPathFromMetadata('/dashboard', { role: 'admin_plus' })).toBe(true);
  });
});

describe('buildAppMetadataUpdate (PATCH Utenze)', () => {
  it('aggiornando solo i moduli, preserva il ruolo admin_plus corrente', () => {
    const out = buildAppMetadataUpdate('admin_plus', undefined, ['dashboard']);
    expect(out.role).toBe('admin_plus');
    expect(out.allowedModules).toContain('impostazioni');
  });
  it('aggiornando solo i moduli, preserva il ruolo admin corrente', () => {
    const out = buildAppMetadataUpdate('admin', undefined, ['dashboard']);
    expect(out.role).toBe('admin');
    expect(out.allowedModules).toContain('impostazioni');
  });
  it('cambio esplicito a operatore: ruolo operatore, niente impostazioni', () => {
    const out = buildAppMetadataUpdate('admin', 'operatore', ['dashboard']);
    expect(out.role).toBe('operatore');
    expect(out.allowedModules).not.toContain('impostazioni');
  });
  it('operatore che aggiorna i moduli resta operatore', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, ['dashboard']);
    expect(out.role).toBe('operatore');
    expect(out.allowedModules).not.toContain('impostazioni');
  });
});
