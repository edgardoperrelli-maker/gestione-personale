// tools/limitazioni-sync/saluteSync.test.ts
// Salute della sincronizzazione OneDrive sul PC dell'agente. Due incidenti reali coperti:
// (1) OneDrive spento → le scritture restano solo locali; (2) copia locale "orfana"
// (sync root registrato in Explorer ma non più sincronizzato) e vecchi download in
// Download: chi le apre vede dati di settimane prima credendoli attuali.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { parseRegQuery, analizzaSaluteSync, controllaSaluteSync } from './lib/saluteSync.mjs';

// ── Fixture generiche (nomi finti: il repo è pubblico) ─────────────────────────
const DRIVE_UTENTE = 'C:\\Users\\Mario\\OneDrive - Rossi SRL';
const LIBRERIA = 'C:\\Users\\Mario\\Rossi SRL\\Cantieri - Documenti';
const ORFANO = 'C:\\Users\\Mario\\OneDrive - Rossi SRL\\Cantieri - ANNO 2026';
const NS_DRIVE = 'https://rossisrl-my.sharepoint.com/personal/mario_rossi_it/Documents/';
const NS_LIBRERIA = 'https://rossisrl.sharepoint.com/sites/Cantieri/Documenti condivisi/';

function providersBase() {
  return [
    { chiave: 'Business1', mountPoint: DRIVE_UTENTE, urlNamespace: NS_DRIVE },
    { chiave: 'aaa111', mountPoint: LIBRERIA, urlNamespace: NS_LIBRERIA },
  ];
}

function argomentiSani() {
  return {
    processoAttivo: true as boolean | null,
    providers: providersBase(),
    mountAttivi: [DRIVE_UTENTE, LIBRERIA],
    esisteSuDisco: () => true,
    masters: ['CANTIERE NORD.xlsx', 'CANTIERE SUD.xlsx'],
    downloads: ['relazione.pdf', 'foto.zip'],
    oreSenzaLogEngine: 1 as number | null,
  };
}

describe('parseRegQuery', () => {
  it('estrae chiavi e valori (nomi con spazi inclusi, stile Tenants)', () => {
    const testo = [
      'HKEY_CURRENT_USER\\Software\\SyncEngines\\Providers\\OneDrive\\aaa111',
      '    MountPoint    REG_SZ    ' + LIBRERIA,
      '    UrlNamespace    REG_SZ    ' + NS_LIBRERIA,
      '',
      'HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Business1\\Tenants\\Rossi SRL',
      '    ' + LIBRERIA + '    REG_DWORD    0x9024',
      '',
    ].join('\r\n');

    const chiavi = parseRegQuery(testo);
    expect(chiavi).toHaveLength(2);
    expect(chiavi[0].chiave).toContain('Providers\\OneDrive\\aaa111');
    expect(chiavi[0].valori).toEqual([
      { nome: 'MountPoint', tipo: 'REG_SZ', dato: LIBRERIA },
      { nome: 'UrlNamespace', tipo: 'REG_SZ', dato: NS_LIBRERIA },
    ]);
    // Nei Tenants il NOME del valore è il path del mount (con spazi): non va spezzato.
    expect(chiavi[1].valori).toEqual([{ nome: LIBRERIA, tipo: 'REG_DWORD', dato: '0x9024' }]);
  });

  it('valore REG_SZ senza dato → dato stringa vuota', () => {
    const testo = [
      'HKEY_CURRENT_USER\\Software\\Prova',
      '    VuotoQui    REG_SZ',
      '',
    ].join('\r\n');
    expect(parseRegQuery(testo)[0].valori).toEqual([{ nome: 'VuotoQui', tipo: 'REG_SZ', dato: '' }]);
  });
});

describe('analizzaSaluteSync', () => {
  it('tutto sano → nessun avviso', () => {
    expect(analizzaSaluteSync(argomentiSani())).toEqual([]);
  });

  it('OneDrive spento → avviso (anche il log stantio non aggiunge rumore: motore ovviamente fermo)', () => {
    const avvisi = analizzaSaluteSync({ ...argomentiSani(), processoAttivo: false, oreSenzaLogEngine: 200 });
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toMatch(/OneDrive non è in esecuzione/);
  });

  it('processo non determinabile (null) → nessun avviso', () => {
    expect(analizzaSaluteSync({ ...argomentiSani(), processoAttivo: null })).toEqual([]);
  });

  it('sync root orfano della stessa libreria, presente su disco → avviso col percorso', () => {
    const argomenti = argomentiSani();
    argomenti.providers.push({ chiave: 'bbb222', mountPoint: ORFANO, urlNamespace: NS_LIBRERIA });
    const avvisi = analizzaSaluteSync(argomenti);
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toContain(ORFANO);
    expect(avvisi[0]).toMatch(/non è più sincronizzata/);
  });

  it('orfano già rimosso dal disco → inerte, nessun avviso', () => {
    const argomenti = argomentiSani();
    argomenti.providers.push({ chiave: 'bbb222', mountPoint: ORFANO, urlNamespace: NS_LIBRERIA });
    argomenti.esisteSuDisco = (p: string) => p !== ORFANO;
    expect(analizzaSaluteSync(argomenti)).toEqual([]);
  });

  it('mount extra di una libreria DIVERSA (scorciatoia legittima) → nessun avviso', () => {
    const argomenti = argomentiSani();
    argomenti.providers.push({
      chiave: 'ccc333',
      mountPoint: 'C:\\Users\\Mario\\OneDrive - Rossi SRL\\Preventivi',
      urlNamespace: 'https://rossisrl.sharepoint.com/sites/Preventivi/Documenti condivisi/',
    });
    expect(analizzaSaluteSync(argomenti)).toEqual([]);
  });

  it('mount attivi ignoti (registro non letto) → il check orfani si spegne, niente falsi allarmi', () => {
    const argomenti = argomentiSani();
    argomenti.providers.push({ chiave: 'bbb222', mountPoint: ORFANO, urlNamespace: NS_LIBRERIA });
    argomenti.mountAttivi = [];
    expect(analizzaSaluteSync(argomenti)).toEqual([]);
  });

  it('confronto percorsi case-insensitive e robusto allo slash finale', () => {
    const argomenti = argomentiSani();
    argomenti.mountAttivi = [DRIVE_UTENTE.toUpperCase() + '\\', LIBRERIA];
    expect(analizzaSaluteSync(argomenti)).toEqual([]);
  });

  it('esca in Download: stesso nome di un master, anche con suffisso " (1)" e case diverso → avviso', () => {
    const argomenti = argomentiSani();
    argomenti.downloads = ['cantiere nord.xlsx', 'CANTIERE SUD (1).xlsx', 'altro file.xlsx'];
    const avvisi = analizzaSaluteSync(argomenti);
    expect(avvisi).toHaveLength(2);
    expect(avvisi[0]).toContain('cantiere nord.xlsx');
    expect(avvisi[1]).toContain('CANTIERE SUD (1).xlsx');
  });

  it('motore fermo: processo attivo ma nessun log da oltre la soglia → avviso', () => {
    const avvisi = analizzaSaluteSync({ ...argomentiSani(), oreSenzaLogEngine: 72 });
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toMatch(/72 ore/);
  });

  it('motore: log fresco o età ignota → nessun avviso', () => {
    expect(analizzaSaluteSync({ ...argomentiSani(), oreSenzaLogEngine: 12 })).toEqual([]);
    expect(analizzaSaluteSync({ ...argomentiSani(), oreSenzaLogEngine: null })).toEqual([]);
  });

  it('percorso agente sparito dal disco → avviso; sonda rotta (throw) → silenzio', () => {
    const dentro = LIBRERIA + '\\LIMITAZIONI';
    const sparito = LIBRERIA + '\\COMMESSA SPARITA';
    const conEsiste = { ...argomentiSani(), percorsiAgente: [dentro, sparito], esisteSuDisco: (p: string) => p === dentro };
    const avvisi = analizzaSaluteSync(conEsiste);
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toContain(sparito);
    expect(avvisi[0]).toMatch(/non trovato su disco/);

    const sondaRotta = { ...argomentiSani(), percorsiAgente: [sparito], esisteSuDisco: () => { throw new Error('fs rotto'); } };
    expect(analizzaSaluteSync(sondaRotta)).toEqual([]);
  });

  it('percorso FUORI dai mount attivi → avviso; dentro → nulla; mount ignoti → check spento', () => {
    const fuori = 'C:\\Users\\Mario\\Desktop\\COPIA LOCALE';
    const base = { ...argomentiSani(), percorsiAgente: [LIBRERIA + '\\LIMITAZIONI', fuori], esisteSuDisco: () => true };
    const avvisi = analizzaSaluteSync(base);
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toContain(fuori);
    expect(avvisi[0]).toMatch(/FUORI/);

    expect(analizzaSaluteSync({ ...base, percorsiAgente: [fuori], mountAttivi: [] })).toEqual([]);
  });

  it('trappola del prefisso: "…\\Documenti FINTA" NON è dentro il mount "…\\Documenti"', () => {
    const finta = LIBRERIA + ' FINTA\\LIMITAZIONI';
    const avvisi = analizzaSaluteSync({ ...argomentiSani(), percorsiAgente: [finta], esisteSuDisco: () => true });
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toContain(finta);
  });
});

describe('controllaSaluteSync (raccolta best-effort)', () => {
  it('ogni sonda che esplode viene ignorata: mai un throw, avvisi possibili []', () => {
    const avvisi = controllaSaluteSync({
      cartella: 'C:\\inesistente',
      execFn: () => { throw new Error('exec rotto'); },
      fsApi: {
        existsSync: () => { throw new Error('fs rotto'); },
        readdirSync: () => { throw new Error('fs rotto'); },
        statSync: () => { throw new Error('fs rotto'); },
      },
      env: {},
      adessoMs: 1_800_000_000_000,
    });
    expect(avvisi).toEqual([]);
  });

  it('scenario incidente reale: processo spento + orfano su disco + esca in Download → 3 avvisi', () => {
    const regSyncEngines = [
      'HKEY_CURRENT_USER\\Software\\SyncEngines\\Providers\\OneDrive\\Business1',
      '    MountPoint    REG_SZ    ' + DRIVE_UTENTE,
      '    UrlNamespace    REG_SZ    ' + NS_DRIVE,
      'HKEY_CURRENT_USER\\Software\\SyncEngines\\Providers\\OneDrive\\aaa111',
      '    MountPoint    REG_SZ    ' + LIBRERIA,
      '    UrlNamespace    REG_SZ    ' + NS_LIBRERIA,
      'HKEY_CURRENT_USER\\Software\\SyncEngines\\Providers\\OneDrive\\bbb222',
      '    MountPoint    REG_SZ    ' + ORFANO,
      '    UrlNamespace    REG_SZ    ' + NS_LIBRERIA,
    ].join('\r\n');
    const regAccounts = [
      'HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Business1',
      '    UserFolder    REG_SZ    ' + DRIVE_UTENTE,
      'HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Business1\\Tenants\\Rossi SRL',
      '    ' + LIBRERIA + '    REG_DWORD    0x9024',
    ].join('\r\n');

    const cartella = 'C:\\Users\\Mario\\Rossi SRL\\Cantieri - Documenti\\LIMITAZIONI';
    const dirDownload = path.join('C:\\Users\\Mario', 'Downloads');
    const dirEsistenti = new Set([cartella, ORFANO, dirDownload]);
    const avvisi = controllaSaluteSync({
      cartella,
      execFn: (cmd: string) => {
        if (cmd.startsWith('tasklist')) return 'INFO: nessuna attività in esecuzione corrisponde ai criteri.';
        if (cmd.includes('SyncEngines')) return regSyncEngines;
        if (cmd.includes('OneDrive\\Accounts')) return regAccounts;
        return '';
      },
      fsApi: {
        existsSync: (p: string) => dirEsistenti.has(p),
        readdirSync: (p: string) =>
          p === cartella ? ['CANTIERE NORD.xlsx', '~$CANTIERE NORD.xlsx', 'note.txt']
            : p === dirDownload ? ['CANTIERE NORD (2).xlsx', 'altro.pdf'] : [],
        statSync: () => ({ mtimeMs: 0 }),
      },
      env: { USERPROFILE: 'C:\\Users\\Mario', LOCALAPPDATA: 'C:\\Users\\Mario\\AppData\\Local' },
      adessoMs: 1_800_000_000_000,
    });

    expect(avvisi).toHaveLength(3);
    expect(avvisi[0]).toMatch(/OneDrive non è in esecuzione/);
    expect(avvisi[1]).toContain(ORFANO);
    expect(avvisi[2]).toContain('CANTIERE NORD (2).xlsx');
  });

  it('guardrail esteso ai master ACEA: esca del DUNNING in Download + salPath sparito → avvisi', () => {
    const cartella = 'C:\\Users\\Mario\\Rossi SRL\\Cantieri - Documenti\\LIMITAZIONI';
    const masterDunning = 'C:\\Users\\Mario\\Rossi SRL\\Cantieri - Documenti\\ORDINI\\ELENCO ORDINI.xlsx';
    const salPath = 'C:\\Users\\Mario\\Rossi SRL\\Cantieri - Documenti\\CONTABILITA';
    const dirDownload = path.join('C:\\Users\\Mario', 'Downloads');
    const esistenti = new Set([cartella, masterDunning, dirDownload]); // salPath NON esiste
    const regAccounts = [
      'HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Business1',
      '    UserFolder    REG_SZ    ' + DRIVE_UTENTE,
      'HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Business1\\Tenants\\Rossi SRL',
      '    ' + LIBRERIA + '    REG_DWORD    0x9024',
    ].join('\r\n');

    const avvisi = controllaSaluteSync({
      cartella,
      acea: { masterPath: masterDunning, salPath },
      execFn: (cmd: string) => {
        if (cmd.startsWith('tasklist')) return 'OneDrive.exe    1234 Console';
        if (cmd.includes('OneDrive\\Accounts')) return regAccounts;
        return '';
      },
      fsApi: {
        existsSync: (p: string) => esistenti.has(p),
        readdirSync: (p: string) =>
          p === cartella ? ['CANTIERE NORD.xlsx']
            : p === dirDownload ? ['ELENCO ORDINI (3).xlsx', 'altro.pdf'] : [],
        statSync: () => ({ mtimeMs: 0 }),
      },
      env: { USERPROFILE: 'C:\\Users\\Mario' },
      adessoMs: 1_800_000_000_000,
    });

    expect(avvisi).toHaveLength(2);
    expect(avvisi[0]).toContain(salPath);
    expect(avvisi[0]).toMatch(/non trovato su disco/);
    expect(avvisi[1]).toContain('ELENCO ORDINI (3).xlsx');
  });
});
