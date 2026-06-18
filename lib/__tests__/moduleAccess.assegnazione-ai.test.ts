import { describe, it, expect } from 'vitest';
import { APP_MODULES, ALL_MODULE_KEYS, DEFAULT_ALLOWED_MODULES, findModuleByPath } from '@/lib/moduleAccess';

describe('modulo assegnazione-ai', () => {
  it('registrato con i flag corretti', () => {
    const m = APP_MODULES.find((x) => x.key === 'assegnazione-ai');
    expect(m).toBeDefined();
    expect(m?.href).toBe('/hub/assegnazione-ai');
    expect(m?.adminOnly).toBe(true);
    expect(m?.requiresAdminRole).toBeFalsy();
    expect(m?.matchPrefixes).toContain('/hub/assegnazione-ai');
  });
  it('in ALL_MODULE_KEYS, non nei default operatore', () => {
    expect(ALL_MODULE_KEYS).toContain('assegnazione-ai');
    expect(DEFAULT_ALLOWED_MODULES).not.toContain('assegnazione-ai');
  });
  it('findModuleByPath riconosce la rotta', () => {
    expect(findModuleByPath('/hub/assegnazione-ai')?.key).toBe('assegnazione-ai');
  });
});
