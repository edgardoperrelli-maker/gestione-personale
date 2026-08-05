import { describe, it, expect } from 'vitest';
import {
  resolveUserRole,
  resolveAssignableRole,
  canAccessPath,
  getAllowedModulesForUser,
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

/*
  La precedenza è la sostanza del fix del 2026-08-03: il ruolo aveva DUE sorgenti e il
  middleware ne guardava una sola. Questi test fissano quale vince, in entrambi i versi —
  ed è l'unico modo per accorgersi se qualcuno reinverte l'ordine dentro le funzioni.
*/
describe('precedenza del ruolo: app_metadata prima, profiles come fallback legacy', () => {
  it('metadata vince sul profilo quando il profilo dice DI PIÙ (profilo stantio)', () => {
    // Prima diceva admin, e il middleware sbarrava lo stesso: config morta che sembrava viva.
    expect(resolveUserRole('admin', 'operatore')).toBe('operatore');
    expect(resolveAssignableRole('admin_plus', 'operatore')).toBe('operatore');
  });

  it('metadata vince sul profilo quando il profilo dice DI MENO', () => {
    // Prima la pagina negava una porta che il middleware aveva già aperto.
    expect(resolveUserRole('viewer', 'admin')).toBe('admin');
    expect(resolveAssignableRole('viewer', 'admin_plus')).toBe('admin_plus');
  });

  it('il profilo decide solo dove i metadata TACCIONO (utente legacy)', () => {
    expect(resolveUserRole('admin', undefined)).toBe('admin');
    expect(resolveUserRole('admin', null)).toBe('admin');
    expect(resolveAssignableRole('admin_plus', undefined)).toBe('admin_plus');
    // Un valore nei metadata che non significa niente non conta come "parola detta".
    expect(resolveUserRole('admin', 'capoccia')).toBe('admin');
  });

  it('la pagina e il middleware ora decidono uguale sullo stesso utente', () => {
    // Utente admin per metadata ma "viewer" per un profilo stantio: il middleware lo fa
    // passare, e adesso anche la pagina — una sola decisione, non due che si somigliano.
    const metadata = { role: 'admin', allowedModules: ['acea'] };
    const role = resolveUserRole('viewer', metadata.role);
    expect(canAccessPath('/hub/acea', getAllowedModulesForUser(metadata, role), role)).toBe(true);
    expect(canAccessPathFromMetadata('/hub/acea', metadata)).toBe(true);
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

describe('normalizeAllowedModules (moduli requiresAdminRole forzati per gli admin)', () => {
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
    // per gli admin TUTTI i moduli requiresAdminRole sono forzati (46663960)
    // L'elenco è volutamente esplicito: aggiungere `requiresAdminRole` a un modulo allarga
    // l'accesso forzato di ogni admin e deve passare da qui.
    // `acqualatina` dal 01/08/2026: commessa gemella di ACEA, stesso flag per la stessa
    // ragione — senza, un modulo nuovo non compare a nessuno che abbia già la lista salvata.
    expect(normalizeAllowedModules(undefined, 'admin')).toEqual(['acea', 'acqualatina', 'assistenza', 'impostazioni']);
  });
});

/*
  `oggi` e' la home operatore (/hub/oggi): il perimetro minimo delle utenze create da
  /impostazioni/personale (app_metadata.allowedModules = ['oggi']). Questi test fissano
  che resti concedibile a un operatore — se qualcuno lo marcasse requiresAdminRole,
  normalizeAllowedModules lo toglierebbe a TUTTE le utenze operatore in silenzio.
*/
describe("modulo 'oggi' (home operatore)", () => {
  it('concedibile a operatore: normalizeAllowedModules non lo rimuove', () => {
    expect(normalizeAllowedModules(['oggi'], 'operatore')).toEqual(['oggi']);
  });
  it('operatore con solo oggi accede a /hub/oggi e a nient’altro', () => {
    const metadata = { role: 'operatore', allowedModules: ['oggi'] };
    expect(canAccessPathFromMetadata('/hub/oggi', metadata)).toBe(true);
    expect(canAccessPathFromMetadata('/hub/mappa', metadata)).toBe(false);
  });
  it('presente per admin: fallback e normalizzazione lo conservano', () => {
    expect(fallbackModulesForRole('admin')).toContain('oggi');
    expect(normalizeAllowedModules(['oggi'], 'admin')).toContain('oggi');
  });
  it('nel fallback legacy operatore (non adminOnly)', () => {
    expect(fallbackModulesForRole('operatore')).toContain('oggi');
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

/*
  Tappa C login operatore: il middleware ridirige /hub → /hub/oggi quando il ruolo
  risolto dai metadata è operatore E /hub/oggi gli è concesso. La seconda condizione
  è la guardia anti-loop: senza, un operatore con una lista moduli salvata che non
  contiene 'oggi' rimbalzerebbe all'infinito tra /hub/oggi (pagina negata → /hub) e
  /hub (redirect → /hub/oggi). Qui si fissa la DECISIONE con le stesse funzioni pure
  che il middleware compone — se una delle due cambia verso, questo se ne accorge.
*/
describe('redirect operatore /hub → /hub/oggi (decisione del middleware)', () => {
  const decideRedirect = (appMetadata: { role?: unknown; allowedModules?: unknown }) =>
    resolveUserRole(null, appMetadata.role) === 'operatore' &&
    canAccessPathFromMetadata('/hub/oggi', appMetadata);

  it('operatore nuovo (solo oggi nei metadata): redirige', () => {
    expect(decideRedirect({ role: 'operatore', allowedModules: ['oggi'] })).toBe(true);
  });
  it('operatore con lista salvata SENZA oggi: NON redirige (anti-loop)', () => {
    expect(decideRedirect({ role: 'operatore', allowedModules: ['mappa'] })).toBe(false);
  });
  it('operatore legacy senza allowedModules: redirige (oggi è nel fallback)', () => {
    expect(decideRedirect({ role: 'operatore' })).toBe(true);
  });
  it('admin e admin_plus restano sul lanciatore', () => {
    expect(decideRedirect({ role: 'admin', allowedModules: ['oggi'] })).toBe(false);
    expect(decideRedirect({ role: 'admin_plus' })).toBe(false);
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

describe('buildAppMetadataUpdate — flag modificaInterventi', () => {
  it('default false quando non corrente né richiesto', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['mappa']);
    expect(out.modificaInterventi).toBe(false);
  });
  it('preserva il flag corrente quando non richiesto esplicitamente', () => {
    const out = buildAppMetadataUpdate('operatore', ['mappa'], undefined, ['mappa'], true, undefined);
    expect(out.modificaInterventi).toBe(true);
  });
  it('accende il flag quando richiesto true', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['mappa'], false, true);
    expect(out.modificaInterventi).toBe(true);
  });
  it('spegne il flag quando richiesto false anche se corrente true', () => {
    const out = buildAppMetadataUpdate('operatore', undefined, undefined, ['mappa'], true, false);
    expect(out.modificaInterventi).toBe(false);
  });
});
