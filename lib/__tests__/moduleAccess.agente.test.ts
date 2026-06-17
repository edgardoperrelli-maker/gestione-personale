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
    expect(mod?.requiresAdminRole).toBeFalsy(); // assegnabile in Utenze; l'admin-only lo applica la pagina
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

  it('è module-gated: canAccessPath segue la chiave nei moduli (l\'admin-only lo applica la pagina)', () => {
    expect(canAccessPath('/hub/agente', ['agente'], 'admin')).toBe(true);
    expect(canAccessPath('/hub/agente', [], 'admin')).toBe(false); // senza la chiave assegnata: no
    // un operatore con la chiave passa il middleware, ma la pagina /hub/agente redirige i non-admin
    expect(canAccessPath('/hub/agente', ['agente'], 'operatore')).toBe(true);
  });
});
