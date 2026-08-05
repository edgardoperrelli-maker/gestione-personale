import { describe, it, expect } from 'vitest';
import { risolviFlussoVoceManuale, type FlussoRowManuale } from './risolviFlussoVoceManuale';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const eseguito: TemplateCampo = { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', obbligatoria: true, ordine: 1 } as TemplateCampo;
const matricolaNuova: TemplateCampo = { chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', obbligatoria: true, ordine: 2 } as TemplateCampo;

const flussoItalgas: FlussoRowManuale = {
  id: 'tpl-bonifiche-extra', nome: 'BONIFICHE EXTRA', campi: [eseguito],
  solo_manuale: false, gruppo_committente: 'italgas', gruppi_attivita: ['BONIFICHE EXTRA'],
};
const flussoAcqualatina: FlussoRowManuale = {
  id: 'tpl-resine', nome: 'RESINE', campi: [eseguito, matricolaNuova],
  solo_manuale: false, gruppo_committente: 'acqualatina', gruppi_attivita: ['SOSTITUZIONE MISURATORI'],
};
const flussoAcea: FlussoRowManuale = {
  id: 'tpl-dunning', nome: 'DUNNING', campi: [eseguito],
  solo_manuale: false, gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'],
};

/**
 * Regressione del bug «matricola misuratore obbligatoria anche su Bonifiche Extra»: un "+"
 * BONIFICHE EXTRA (Italgas) creato dentro un rapportino/piano AcquaLatina ereditava le azioni di
 * AcquaLatina. Qui si blinda la causa strutturale: la funzione decide SOLO da (committente,
 * gruppo), il territorio non è nemmeno un parametro che può influenzarla.
 */
describe('risolviFlussoVoceManuale · non prende mai la definizione dal territorio', () => {
  const flussi = [flussoItalgas, flussoAcqualatina, flussoAcea];

  it('un "+" Italgas/BONIFICHE EXTRA prende il flusso Italgas anche se altri committenti coprono lo stesso territorio operativo', () => {
    // Scenario reale: il territorio ACEA ospita insieme acea, lim_massive e italgas (stesso
    // operatore, stesso piano, stesso giorno) — la presenza di flussi AcquaLatina/ACEA nel pool
    // non deve influenzare la scelta finché il committente scelto nel "+" è 'italgas'.
    const r = risolviFlussoVoceManuale('italgas', 'BONIFICHE EXTRA', flussi);
    expect(r?.templateId).toBe('tpl-bonifiche-extra');
    expect(r?.campi.some((c) => c.chiave === 'matricola_nuova')).toBe(false);
  });

  it('un "+" AcquaLatina/SOSTITUZIONE MISURATORI prende il flusso AcquaLatina anche in un rapportino/piano di un altro committente', () => {
    const r = risolviFlussoVoceManuale('acqualatina', 'SOSTITUZIONE MISURATORI', flussi);
    expect(r?.templateId).toBe('tpl-resine');
    expect(r?.campi.some((c) => c.chiave === 'matricola_nuova')).toBe(true);
  });

  it("lim_massive è un marcatore di CANALE (non un committente, non un territorio): risolve come acea", () => {
    const r = risolviFlussoVoceManuale('lim_massive', 'DUNNING', flussi);
    expect(r?.templateId).toBe('tpl-dunning');
  });

  it('nessun flusso collegato per quel gruppo → null: il chiamante eredita lo standard del rapportino, come sempre', () => {
    const r = risolviFlussoVoceManuale('acqualatina', 'GRUPPO INESISTENTE', flussi);
    expect(r).toBeNull();
  });

  it('stesso identico pool di flussi, il risultato cambia SOLO col committente passato esplicitamente — mai da solo', () => {
    const soloDue = [flussoItalgas, flussoAcqualatina];
    expect(risolviFlussoVoceManuale('italgas', 'BONIFICHE EXTRA', soloDue)?.templateId).toBe('tpl-bonifiche-extra');
    expect(risolviFlussoVoceManuale('acqualatina', 'BONIFICHE EXTRA', soloDue)).toBeNull();
  });
});
