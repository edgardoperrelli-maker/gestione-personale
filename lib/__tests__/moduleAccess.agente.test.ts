import { describe, it, expect } from 'vitest';
import {
  APP_MODULES,
  ALL_MODULE_KEYS,
  DEFAULT_ALLOWED_MODULES,
  canAccessPath,
  findModuleByPath,
} from '@/lib/moduleAccess';

describe('modulo agente', () => {
  it('è registrato in APP_MODULES con i flag corretti', () => {
    const mod = APP_MODULES.find((m) => m.key === 'agente');
    expect(mod).toBeDefined();
    expect(mod?.href).toBe('/hub/agente');
    expect(mod?.section).toBe('modules');
    expect(mod?.adminOnly).toBe(true);
    expect(mod?.requiresAdminRole).toBe(true);
    expect(mod?.matchPrefixes).toContain('/hub/agente');
  });

  it('è incluso in ALL_MODULE_KEYS', () => {
    expect(ALL_MODULE_KEYS).toContain('agente');
  });

  it('NON è nei default operatore (adminOnly)', () => {
    expect(DEFAULT_ALLOWED_MODULES).not.toContain('agente');
  });

  it('findModuleByPath riconosce le sotto-rotte', () => {
    expect(findModuleByPath('/hub/agente')?.key).toBe('agente');
    expect(findModuleByPath('/hub/agente/storico')?.key).toBe('agente');
  });

  it('gate forte: un operatore non accede anche se la chiave è nei moduli', () => {
    expect(canAccessPath('/hub/agente', ['agente'], 'operatore')).toBe(false);
    expect(canAccessPath('/hub/agente', ['agente'], 'admin')).toBe(true);
  });

  it('admin senza la chiave nei moduli non accede', () => {
    expect(canAccessPath('/hub/agente', [], 'admin')).toBe(false);
  });
});
