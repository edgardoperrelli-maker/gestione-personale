import { describe, it, expect } from 'vitest';
import {
  resolveUserRole,
  canAccessPathFromMetadata,
  buildAppMetadataUpdate,
  normalizeAllowedModules,
  prefillModulesForRole,
  fallbackModulesForRole,
  canManageUsers,
  canEditStorico,
} from './moduleAccess';

describe('resolveUserRole', () => {
  it('admin_plus (solo in app_metadata) è autorizzato come admin', () => {
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

describe('canManageUsers', () => {
  it('true solo per admin_plus', () => {
    expect(canManageUsers('admin_plus')).toBe(true);
    expect(canManageUsers('admin')).toBe(false);
    expect(canManageUsers('operatore')).toBe(false);
    expect(canManageUsers(null)).toBe(false);
  });
});

describe('prefillModulesForRole / fallbackModulesForRole', () => {
  it('operatore: pre-fill vuoto, fallback set operativo (senza moduli sensibili)', () => {
    expect(prefillModulesForRole('operatore')).toEqual([]);
    const fb = fallbackModulesForRole('operatore');
    expect(fb).toContain('dashboard');
    expect(fb).toContain('mappa');
    expect(fb).not.toContain('impostazioni');
    expect(fb).not.toContain('live');
  });
  it('admin/admin_plus: pre-fill e fallback = tutti i moduli (con impostazioni)', () => {
    expect(prefillModulesForRole('admin')).toContain('impostazioni');
    expect(prefillModulesForRole('admin_plus')).toContain('live');
    expect(fallbackModulesForRole('admin')).toContain('impostazioni');
  });
  it('prefill con ruolo nullo/assente → vuoto', () => {
    expect(prefillModulesForRole(null)).toEqual([]);
    expect(prefillModulesForRole(undefined)).toEqual([]);
  });
});

describe('normalizeAllowedModules (nessuna forzatura, unico invariante su impostazioni)', () => {
  it('operatore: nessun modulo non richiesto forzato; live mantenuto se richiesto', () => {
    const out = normalizeAllowedModules(['mappa', 'live'], 'operatore');
    expect(out).toContain('mappa');
    expect(out).toContain('live');
    expect(out).not.toContain('interventi'); // non richiesto → non forzato
    expect(out).not.toContain('impostazioni'); // operatore non lo ha mai
  });
  it('operatore: impostazioni rimosso anche se richiesto', () => {
    expect(normalizeAllowedModules(['impostazioni', 'mappa'], 'operatore')).toEqual(['mappa']);
  });
  it('admin: impostazioni reintegrato anche se assente dalla richiesta', () => {
    expect(normalizeAllowedModules(['dashboard'], 'admin')).toContain('impostazioni');
  });
  it('input non-array → vuoto (poi invariante)', () => {
    expect(normalizeAllowedModules(undefined, 'operatore')).toEqual([]);
    expect(normalizeAllowedModules(undefined, 'admin')).toEqual(['impostazioni']);
  });
});

describe('canAccessPathFromMetadata (logica del middleware)', () => {
  it('admin può accedere a /impostazioni', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'admin' })).toBe(true);
  });
  it('admin_plus può accedere a /impostazioni', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'admin_plus' })).toBe(true);
  });
  it('operatore NON può accedere a /impostazioni (gate di ruolo)', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'operatore' })).toBe(false);
  });
  it('operatore con live abilitato PUÒ accedere a /hub/live', () => {
    expect(canAccessPathFromMetadata('/hub/live', { role: 'operatore', allowedModules: ['live'] })).toBe(true);
  });
  it('operatore senza live NON accede a /hub/live', () => {
    expect(canAccessPathFromMetadata('/hub/live', { role: 'operatore', allowedModules: ['mappa'] })).toBe(false);
  });
  it('operatore con impostazioni anomalo in metadata: resta bloccato (gate ruolo)', () => {
    expect(canAccessPathFromMetadata('/impostazioni', { role: 'operatore', allowedModules: ['impostazioni'] })).toBe(false);
  });
  it('admin legacy (nessun allowedModules in metadata) può accedere a /hub/live', () => {
    expect(canAccessPathFromMetadata('/hub/live', { role: 'admin' })).toBe(true);
  });
});

describe('buildAppMetadataUpdate (PATCH Utenze)', () => {
  it('aggiornando solo i moduli, preserva il ruolo admin_plus e reintegra impostazioni', () => {
    const out = buildAppMetadataUpdate('admin_plus', undefined, undefined, ['dashboard']);
    expect(out.role).toBe('admin_plus');
    expect(out.allowedModules).toContain('impostazioni');
  });
  it('aggiornando solo i moduli, preserva il ruolo admin', () => {
    const out = buildAppMetadataUpdate('admin', undefined, undefined, ['dashboard']);
    expect(out.role).toBe('admin');
    expect(out.allowedModules).toContain('impostazioni');
  });
  it('cambio esplicito a operatore: ruolo operatore, niente impostazioni', () => {
    const out = buildAppMetadataUpdate('admin', undefined, 'operatore', ['dashboard']);
    expect(out.role).toBe('operatore');
    expect(out.allowedModules).not.toContain('impostazioni');
  });
  it('operatore può ricevere live', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['live', 'mappa']);
    expect(out.role).toBe('operatore');
    expect(out.allowedModules).toContain('live');
  });
  it('moduli non inviati: preserva i correnti (ordine di ALL_MODULE_KEYS)', () => {
    const out = buildAppMetadataUpdate('operatore', ['interventi', 'mappa'], undefined, undefined);
    expect(out.allowedModules).toEqual(['mappa', 'interventi']); // mappa precede interventi in ALL_MODULE_KEYS
  });
  it('nessun modulo né corrente né richiesto: usa il prefill del ruolo', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, undefined);
    expect(out.allowedModules).toEqual([]); // prefillModulesForRole('operatore') = []
  });
});

describe('canEditStorico', () => {
  it('admin_plus può sempre, anche senza flag', () => {
    expect(canEditStorico('admin_plus', null)).toBe(true);
    expect(canEditStorico('admin_plus', { role: 'admin_plus' })).toBe(true);
  });
  it('operatore con flag modificaInterventi=true può', () => {
    expect(canEditStorico('operatore', { role: 'operatore', modificaInterventi: true })).toBe(true);
  });
  it('operatore senza flag / flag false / metadata vuoti NON può', () => {
    expect(canEditStorico('operatore', { role: 'operatore' })).toBe(false);
    expect(canEditStorico('operatore', { role: 'operatore', modificaInterventi: false })).toBe(false);
    expect(canEditStorico('operatore', null)).toBe(false);
    expect(canEditStorico('operatore', undefined)).toBe(false);
  });
  it('admin semplice senza flag NON può (solo admin_plus è implicito)', () => {
    expect(canEditStorico('admin', { role: 'admin' })).toBe(false);
  });
  it('admin semplice con flag può', () => {
    expect(canEditStorico('admin', { role: 'admin', modificaInterventi: true })).toBe(true);
  });
});
