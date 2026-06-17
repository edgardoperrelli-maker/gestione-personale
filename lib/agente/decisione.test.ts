import { describe, it, expect } from 'vitest';
import {
  decideEsecuzione,
  riassumiReport,
  statoAgente,
  validaMappatura,
  validaConfig,
  diffColonne,
  CAMPI_MAPPABILI,
  type ReportAgente,
  type RegolaMappa,
} from './decisione';

const base = {
  enabled: true,
  giorni: [1, 2, 3, 4, 5],
  ora: '21:00',
  weekday: 2,
  oraCorrente: '21:30',
  oggi: '2026-06-16',
  ultimaRivendicazione: null as string | null,
};

describe('decideEsecuzione', () => {
  it('tutte le condizioni vere → true', () => {
    expect(decideEsecuzione(base)).toBe(true);
  });
  it('disabilitato → false', () => {
    expect(decideEsecuzione({ ...base, enabled: false })).toBe(false);
  });
  it('giorno non in elenco → false', () => {
    expect(decideEsecuzione({ ...base, weekday: 6 })).toBe(false);
  });
  it('ora corrente prima dell ora pianificata → false', () => {
    expect(decideEsecuzione({ ...base, oraCorrente: '20:59' })).toBe(false);
  });
  it('ora corrente esattamente uguale all ora → true (>=)', () => {
    expect(decideEsecuzione({ ...base, oraCorrente: '21:00' })).toBe(true);
  });
  it('già rivendicato oggi → false', () => {
    expect(decideEsecuzione({ ...base, ultimaRivendicazione: '2026-06-16' })).toBe(false);
  });
  it('rivendicazione di un altro giorno → true', () => {
    expect(decideEsecuzione({ ...base, ultimaRivendicazione: '2026-06-15' })).toBe(true);
  });
  it('confronto orario lessicografico zero-pad: 09:30 >= 09:00', () => {
    expect(decideEsecuzione({ ...base, ora: '09:00', oraCorrente: '09:30' })).toBe(true);
  });
});

describe('riassumiReport', () => {
  it('somma lavori/aggiornate/extra/conflitti dai file[] + extraNonCollocate', () => {
    const report: ReportAgente = {
      lavori: 12,
      dryRun: false,
      file: [
        { aggiornate: 3, extraAggiunte: 1, conflitti: [{}, {}] },
        { aggiornate: 2, extraAggiunte: 0, conflitti: [{}] },
      ],
      extraNonCollocate: [{}, {}, {}],
    };
    expect(riassumiReport(report)).toEqual({
      lavori: 12,
      aggiornate: 5,
      extra: 1,
      conflitti: 3,
      nonCollocate: 3,
    });
  });

  it('report vuoto → tutti zero', () => {
    expect(riassumiReport({})).toEqual({
      lavori: 0, aggiornate: 0, extra: 0, conflitti: 0, nonCollocate: 0,
    });
  });

  it('campi opzionali mancanti nei file → trattati come 0/[]', () => {
    const report: ReportAgente = { file: [{}, { aggiornate: 4 }] };
    expect(riassumiReport(report)).toEqual({
      lavori: 0, aggiornate: 4, extra: 0, conflitti: 0, nonCollocate: 0,
    });
  });

  it('file assente del tutto → zero', () => {
    expect(riassumiReport({ lavori: 7 })).toEqual({
      lavori: 7, aggiornate: 0, extra: 0, conflitti: 0, nonCollocate: 0,
    });
  });

  it('extraNonCollocate assente → nonCollocate 0', () => {
    const report: ReportAgente = { file: [{ extraAggiunte: 2 }] };
    expect(riassumiReport(report).nonCollocate).toBe(0);
  });
});

describe('statoAgente', () => {
  const base = {
    minutiDaContatto: 5 as number | null,
    enabled: true,
    giorni: [1, 2, 3, 4, 5],
    ora: '21:00',
    oraCorrente: '23:30',
    weekday: 2,
    ultimoGiroOggi: false,
  };

  it('contatto recente → online true', () => {
    expect(statoAgente(base).online).toBe(true);
  });
  it('contatto oltre soglia (default 90 min) → online false', () => {
    expect(statoAgente({ ...base, minutiDaContatto: 120 }).online).toBe(false);
  });
  it('minutiDaContatto null (mai contattato) → online false', () => {
    expect(statoAgente({ ...base, minutiDaContatto: null }).online).toBe(false);
  });
  it('soglia online configurabile via onlineMin', () => {
    expect(statoAgente({ ...base, minutiDaContatto: 120, onlineMin: 180 }).online).toBe(true);
  });

  it('giorno pianificato, passata ora+grazia, giro non di oggi → allerta valorizzata', () => {
    // ora 21:00 + 120 min grazia = 23:00; oraCorrente 23:30 > 23:00
    expect(statoAgente(base).allerta).not.toBeNull();
  });
  it('giro già fatto oggi → nessuna allerta', () => {
    expect(statoAgente({ ...base, ultimoGiroOggi: true }).allerta).toBeNull();
  });
  it('giorno NON pianificato → nessuna allerta', () => {
    expect(statoAgente({ ...base, weekday: 6 }).allerta).toBeNull();
  });
  it('non ancora passata ora+grazia → nessuna allerta', () => {
    // 21:00 + 120 = 23:00; oraCorrente 22:30 < 23:00
    expect(statoAgente({ ...base, oraCorrente: '22:30' }).allerta).toBeNull();
  });
  it('disabilitato → nessuna allerta', () => {
    expect(statoAgente({ ...base, enabled: false }).allerta).toBeNull();
  });
  it('grazia configurabile via graziaMin (0 → allerta già a 21:00)', () => {
    const s = statoAgente({ ...base, oraCorrente: '21:00', graziaMin: 0 });
    expect(s.allerta).not.toBeNull();
  });
});

const regola = (campo: string, colonna: string, abilitato = true, auto?: boolean): RegolaMappa =>
  auto === undefined
    ? { campo, colonna, abilitato }
    : { campo, colonna, abilitato, auto };

describe('CAMPI_MAPPABILI', () => {
  it('contiene i campi previsti incluso marcatore', () => {
    expect(CAMPI_MAPPABILI).toEqual([
      'esecutore', 'data', 'esito', 'sigillo', 'matricola',
      'via', 'pdr', 'nominativo', 'comune', 'saracinesca', 'note', 'marcatore', 'automazione',
    ]);
  });
});

describe('validaMappatura', () => {
  it('mappatura valida → ok', () => {
    const m = [regola('esecutore', 'Esecutore'), regola('esito', 'esito')];
    expect(validaMappatura(m)).toEqual({ ok: true, value: m });
  });
  it('accetta le regole note e automazione', () => {
    expect(validaMappatura([regola('note', 'NOTE')]).ok).toBe(true);
    expect(validaMappatura([regola('automazione', 'AUTOMAZIONE')]).ok).toBe(true);
  });
  it('non è un array → errore', () => {
    expect(validaMappatura('x' as unknown).ok).toBe(false);
  });
  it('campo sconosciuto → errore', () => {
    expect(validaMappatura([regola('pippo', 'X')]).ok).toBe(false);
  });
  it('colonna non stringa → errore', () => {
    expect(validaMappatura([{ campo: 'esito', colonna: 1, abilitato: true } as unknown as RegolaMappa]).ok).toBe(false);
  });
  it('abilitato non boolean → errore', () => {
    expect(validaMappatura([{ campo: 'esito', colonna: 'esito', abilitato: 'si' } as unknown as RegolaMappa]).ok).toBe(false);
  });
  it('auto non boolean → errore', () => {
    expect(validaMappatura([{ campo: 'marcatore', colonna: '', abilitato: true, auto: 'x' } as unknown as RegolaMappa]).ok).toBe(false);
  });
  it('campo duplicato → errore', () => {
    const m = [regola('esito', 'esito'), regola('esito', 'altra')];
    expect(validaMappatura(m).ok).toBe(false);
  });
  it('marcatore con colonna nominata uguale a quella di altra regola abilitata → errore', () => {
    const m = [regola('esito', 'esito'), regola('marcatore', 'esito', true, false)];
    const out = validaMappatura(m);
    expect(out.ok).toBe(false);
  });
  it('marcatore auto:true ignora la collisione (colonna libera auto-rilevata)', () => {
    const m = [regola('esito', 'esito'), regola('marcatore', '', true, true)];
    expect(validaMappatura(m).ok).toBe(true);
  });
  it('marcatore disabilitato non collide', () => {
    const m = [regola('esito', 'esito'), regola('marcatore', 'esito', false, false)];
    expect(validaMappatura(m).ok).toBe(true);
  });
  it('collisione contro regola disabilitata non conta', () => {
    const m = [regola('esito', 'esito', false), regola('marcatore', 'esito', true, false)];
    expect(validaMappatura(m).ok).toBe(true);
  });
  it('accetta una regola saracinesca', () => {
    const r = validaMappatura([{ campo: 'saracinesca', colonna: 'saracinesca', abilitato: true }]);
    expect(r.ok).toBe(true);
  });
});

describe('validaConfig', () => {
  const cfgOk = () => ({
    enabled: true,
    giorni: [1, 2, 3, 4, 5],
    ora: '21:00',
    dry_run: true,
    finestra_giorni: 15,
    mappatura: [
      { campo: 'esecutore', colonna: 'Esecutore', abilitato: true },
      { campo: 'marcatore', colonna: '', auto: true, abilitato: true },
    ],
    esito_positivo: 'eseguito',
    esito_negativo: 'No',
  });

  it('config valida → ok con value normalizzato', () => {
    const out = validaConfig(cfgOk());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.giorni).toEqual([1, 2, 3, 4, 5]);
      expect(out.value.ora).toBe('21:00');
      expect(out.value.mappatura).toHaveLength(2);
    }
  });

  it('enabled non boolean → errore', () => {
    expect(validaConfig({ ...cfgOk(), enabled: 'si' }).ok).toBe(false);
  });

  it('giorni non array → errore', () => {
    expect(validaConfig({ ...cfgOk(), giorni: 3 }).ok).toBe(false);
  });
  it('giorni vuoti → errore', () => {
    expect(validaConfig({ ...cfgOk(), giorni: [] }).ok).toBe(false);
  });
  it('giorno fuori range (0) → errore', () => {
    expect(validaConfig({ ...cfgOk(), giorni: [0, 1] }).ok).toBe(false);
  });
  it('giorno fuori range (8) → errore', () => {
    expect(validaConfig({ ...cfgOk(), giorni: [1, 8] }).ok).toBe(false);
  });
  it('giorno non intero → errore', () => {
    expect(validaConfig({ ...cfgOk(), giorni: [1, 2.5] }).ok).toBe(false);
  });
  it('giorni duplicati → deduplicati e ordinati', () => {
    const out = validaConfig({ ...cfgOk(), giorni: [3, 1, 3, 2] });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.giorni).toEqual([1, 2, 3]);
  });

  it('ora con formato sbagliato → errore', () => {
    expect(validaConfig({ ...cfgOk(), ora: '9:00' }).ok).toBe(false);
    expect(validaConfig({ ...cfgOk(), ora: '24:00' }).ok).toBe(false);
    expect(validaConfig({ ...cfgOk(), ora: '21:60' }).ok).toBe(false);
    expect(validaConfig({ ...cfgOk(), ora: 'abc' }).ok).toBe(false);
  });
  it('ora 00:00 e 23:59 valide', () => {
    expect(validaConfig({ ...cfgOk(), ora: '00:00' }).ok).toBe(true);
    expect(validaConfig({ ...cfgOk(), ora: '23:59' }).ok).toBe(true);
  });

  it('dry_run non boolean → errore', () => {
    expect(validaConfig({ ...cfgOk(), dry_run: 1 }).ok).toBe(false);
  });

  it('finestra_giorni fuori range (0) → errore', () => {
    expect(validaConfig({ ...cfgOk(), finestra_giorni: 0 }).ok).toBe(false);
  });
  it('finestra_giorni fuori range (61) → errore', () => {
    expect(validaConfig({ ...cfgOk(), finestra_giorni: 61 }).ok).toBe(false);
  });
  it('finestra_giorni non intero → errore', () => {
    expect(validaConfig({ ...cfgOk(), finestra_giorni: 15.5 }).ok).toBe(false);
  });
  it('finestra_giorni 1 e 60 valide', () => {
    expect(validaConfig({ ...cfgOk(), finestra_giorni: 1 }).ok).toBe(true);
    expect(validaConfig({ ...cfgOk(), finestra_giorni: 60 }).ok).toBe(true);
  });

  it('mappatura invalida (campo sconosciuto) → errore', () => {
    expect(validaConfig({ ...cfgOk(), mappatura: [{ campo: 'pippo', colonna: 'X', abilitato: true }] }).ok).toBe(false);
  });

  it('esito_positivo vuoto → errore', () => {
    expect(validaConfig({ ...cfgOk(), esito_positivo: '' }).ok).toBe(false);
    expect(validaConfig({ ...cfgOk(), esito_positivo: '   ' }).ok).toBe(false);
  });
  it('esito_negativo vuoto o solo spazi → errore', () => {
    expect(validaConfig({ ...cfgOk(), esito_negativo: '' }).ok).toBe(false);
    expect(validaConfig({ ...cfgOk(), esito_negativo: '   ' }).ok).toBe(false);
  });
  it('esito_negativo non stringa → errore', () => {
    expect(validaConfig({ ...cfgOk(), esito_negativo: 5 }).ok).toBe(false);
  });
  it('esiti con spazi attorno → trim nel value', () => {
    const out = validaConfig({ ...cfgOk(), esito_positivo: '  eseguito  ', esito_negativo: ' No ' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.esito_positivo).toBe('eseguito');
      expect(out.value.esito_negativo).toBe('No');
    }
  });
});

describe('diffColonne', () => {
  it('precedenti vuote → baseline: nuove vuote, sparite vuote', () => {
    expect(diffColonne([], ['A', 'B', 'C'])).toEqual({ nuove: [], sparite: [] });
  });
  it('colonna aggiunta → in nuove', () => {
    expect(diffColonne(['A', 'B'], ['A', 'B', 'C'])).toEqual({ nuove: ['C'], sparite: [] });
  });
  it('colonna rimossa → in sparite', () => {
    expect(diffColonne(['A', 'B', 'C'], ['A', 'C'])).toEqual({ nuove: [], sparite: ['B'] });
  });
  it('aggiunte e sparite insieme', () => {
    expect(diffColonne(['A', 'B'], ['B', 'C'])).toEqual({ nuove: ['C'], sparite: ['A'] });
  });
  it('nessuna differenza → entrambe vuote', () => {
    expect(diffColonne(['A', 'B'], ['A', 'B'])).toEqual({ nuove: [], sparite: [] });
  });
  it('preserva l ordine di "nuove" come in input nuove', () => {
    expect(diffColonne(['A'], ['A', 'C', 'B'])).toEqual({ nuove: ['C', 'B'], sparite: [] });
  });
  it('precedenti non vuote ma nuove vuote → tutte sparite', () => {
    expect(diffColonne(['A', 'B'], [])).toEqual({ nuove: [], sparite: ['A', 'B'] });
  });
  it('non muta gli array in input', () => {
    const prec = ['A', 'B'];
    const nuove = ['A', 'B', 'C'];
    diffColonne(prec, nuove);
    expect(prec).toEqual(['A', 'B']);
    expect(nuove).toEqual(['A', 'B', 'C']);
  });
});
