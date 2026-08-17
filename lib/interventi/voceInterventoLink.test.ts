import { describe, it, expect } from 'vitest';
import { buildVoceInterventoLinker, type InterventoLinkRow } from './voceInterventoLink';

function it_(over: Partial<InterventoLinkRow> = {}): InterventoLinkRow {
  return { id: 'i1', staff_id: 's1', odl: null, matricola_contatore: null, pdr: null, ...over };
}

describe('buildVoceInterventoLinker', () => {
  it('aggancia per matricola quando l\'ODL manca (caso ACEA)', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iA', matricola_contatore: 'M123' })]);
    expect(link({ staff_id: 's1', matricola: 'M123' })).toBe('iA');
  });

  it('aggancia per ODL (voce.odl)', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iO', odl: 'ODL-9' })]);
    expect(link({ staff_id: 's1', odl: 'ODL-9' })).toBe('iO');
  });

  it('normalizza spazi e maiuscole', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iN', matricola_contatore: ' m-77 ' })]);
    expect(link({ staff_id: 's1', matricola: 'M-77' })).toBe('iN');
  });

  it('rispetta lo scoping per operatore (matricola uguale, staff diverso → no match)', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iS', staff_id: 's1', matricola_contatore: 'M5' })]);
    expect(link({ staff_id: 's2', matricola: 'M5' })).toBeNull();
  });

  it('scarta le chiavi ambigue (stessa matricola su 2 interventi dello stesso operatore)', () => {
    const link = buildVoceInterventoLinker([
      it_({ id: 'iX', matricola_contatore: 'DUP' }),
      it_({ id: 'iY', matricola_contatore: 'DUP' }),
    ]);
    expect(link({ staff_id: 's1', matricola: 'DUP' })).toBeNull();
  });

  it('precedenza ODL → matricola → PDR', () => {
    const link = buildVoceInterventoLinker([
      it_({ id: 'iByOdl', odl: 'K1' }),
      it_({ id: 'iByMatr', matricola_contatore: 'K2' }),
    ]);
    // la voce ha sia odl sia matricola: vince l'ODL
    expect(link({ staff_id: 's1', odl: 'K1', matricola: 'K2' })).toBe('iByOdl');
    // solo matricola
    expect(link({ staff_id: 's1', matricola: 'K2' })).toBe('iByMatr');
  });

  it('nessuna chiave utile → null', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iZ', matricola_contatore: 'M1' })]);
    expect(link({ staff_id: 's1' })).toBeNull();
    expect(link({ staff_id: 's1', matricola: 'NOPE' })).toBeNull();
  });

  describe('voce rifiutata: non si aggancia mai', () => {
    /*
      Il caso del 10/08/2026, VIA FOSSO DELLA CRETA 3 (limitazioni massive). Due misuratori nello
      stesso stabile, quindi stesso PDR 4000283762: il primo (matricola 202015245108) è approvato e
      ha il suo intervento, il secondo (202015276720) viene rifiutato per errore. La voce rifiutata
      non trova né il proprio ODL né la propria matricola — l'intervento non esiste, è il senso del
      rifiuto — scivola sul PDR e si prende l'intervento del PRIMO contatore.
    */
    const linkPdrCondiviso = () => buildVoceInterventoLinker([
      it_({ id: 'iPrimoMisuratore', odl: '912489431', matricola_contatore: '202015245108', pdr: '4000283762' }),
    ]);
    const voceRifiutata = {
      staff_id: 's1', odl: '912489601', matricola: '202015276720', pdr: '4000283762',
    };

    it('rifiutata → null: il PDR condiviso non le passa più l\'intervento del vicino', () => {
      expect(linkPdrCondiviso()({ ...voceRifiutata, approvazione_stato: 'rifiutato' })).toBeNull();
    });

    it('la stessa voce NON rifiutata si aggancia: il guard non tocca il flusso buono', () => {
      expect(linkPdrCondiviso()({ ...voceRifiutata, approvazione_stato: 'in_attesa' })).toBe('iPrimoMisuratore');
      expect(linkPdrCondiviso()({ ...voceRifiutata, approvazione_stato: 'approvato' })).toBe('iPrimoMisuratore');
    });

    it('voce normale (approvazione_stato assente o null) → si aggancia come sempre', () => {
      expect(linkPdrCondiviso()(voceRifiutata)).toBe('iPrimoMisuratore');
      expect(linkPdrCondiviso()({ ...voceRifiutata, approvazione_stato: null })).toBe('iPrimoMisuratore');
    });

    it('il rifiuto batte ogni chiave: ODL, matricola e via dei task-via comprese', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iOdl', odl: 'K1' }),
        it_({ id: 'iMatr', matricola_contatore: 'M1' }),
        it_({ id: 'iBE', indirizzo: 'Via Verdi 3', gruppo_attivita: 'BONIFICHE EXTRA' }),
      ]);
      expect(link({ staff_id: 's1', odl: 'K1', approvazione_stato: 'rifiutato' })).toBeNull();
      expect(link({ staff_id: 's1', matricola: 'M1', approvazione_stato: 'rifiutato' })).toBeNull();
      expect(link({ staff_id: 's1', via: 'Via Verdi 3', taskVia: true, approvazione_stato: 'rifiutato' })).toBeNull();
    });
  });

  describe('task-via (bonifiche extra): aggancio per via', () => {
    it('aggancia la voce task-via al suo intervento bonifiche-extra per (staff+via)', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iBE', indirizzo: 'Via Verdi 3', gruppo_attivita: 'BONIFICHE EXTRA' }),
      ]);
      expect(link({ staff_id: 's1', via: 'Via Verdi 3', taskVia: true })).toBe('iBE');
    });

    it('normalizza via (spazi/maiuscole)', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iBE', indirizzo: ' via  verdi 3 ', gruppo_attivita: 'BONIFICHE EXTRA' }),
      ]);
      expect(link({ staff_id: 's1', via: 'VIA  VERDI 3', taskVia: true })).toBe('iBE');
    });

    it('NON aggancia per via una voce non-task-via (evita i figli sulla stessa via)', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iBE', indirizzo: 'Via Verdi 3', gruppo_attivita: 'BONIFICHE EXTRA' }),
      ]);
      expect(link({ staff_id: 's1', via: 'Via Verdi 3', taskVia: false })).toBeNull();
      expect(link({ staff_id: 's1', via: 'Via Verdi 3' })).toBeNull();
    });

    it('un intervento NON bonifiche-extra sulla stessa via non entra nell\'indice per via', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iFiglio', indirizzo: 'Via Verdi 3', gruppo_attivita: "ATTIVITA' ALLA CLIENTELA", matricola_contatore: 'M9' }),
      ]);
      expect(link({ staff_id: 's1', via: 'Via Verdi 3', taskVia: true })).toBeNull();
    });

    it('due bonifiche-extra sulla stessa via+operatore → ambiguo → null', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iA', indirizzo: 'Via Verdi 3', gruppo_attivita: 'BONIFICHE EXTRA' }),
        it_({ id: 'iB', indirizzo: 'Via Verdi 3', gruppo_attivita: 'BONIFICHE EXTRA' }),
      ]);
      expect(link({ staff_id: 's1', via: 'Via Verdi 3', taskVia: true })).toBeNull();
    });

    it('scoping per operatore anche sulla via', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iBE', staff_id: 's1', indirizzo: 'Via Verdi 3', gruppo_attivita: 'BONIFICHE EXTRA' }),
      ]);
      expect(link({ staff_id: 's2', via: 'Via Verdi 3', taskVia: true })).toBeNull();
    });

    it('ODL/matricola/PDR hanno la precedenza sulla via', () => {
      const link = buildVoceInterventoLinker([
        it_({ id: 'iByOdl', odl: 'K1' }),
        it_({ id: 'iBE', indirizzo: 'Via Verdi 3', gruppo_attivita: 'BONIFICHE EXTRA' }),
      ]);
      expect(link({ staff_id: 's1', odl: 'K1', via: 'Via Verdi 3', taskVia: true })).toBe('iByOdl');
    });
  });
});

/*
  IL CONTRATTO CHE I PERCORSI DI RECUPERO DEVONO RISPETTARE.

  Il linker non sa quali interventi hanno già una voce — sa solo scegliere fra i candidati che
  gli passi. L'esclusione la fanno i chiamanti del RECUPERO (`agganciaVoceOrfana` e la
  risincronizzazione), perché un intervento ha UNA voce sola: è l'invariante su cui poggiano il
  positivo che non si declassa e la voce che segue lo spostamento.

  Caso vero del 17/08/2026: la voce orfana di PASTORELLI del 22/06 (ODL 912232071) non trova il
  proprio ODL fra gli interventi del giorno, scivola sul PDR — che è del PUNTO, non del contatore
  — e aggancia un intervento già chiuso positivo CON la sua voce. Nessuna regola di ambiguità
  scattava: su quel PDR l'intervento è uno solo. È la stessa scivolata della migration
  20260810160000, che lì era stata chiusa solo per le voci rifiutate.
*/
describe('recupero: gli interventi che hanno già una voce non sono candidati', () => {
  const orfana = { staff_id: 's1', odl: '912232071', pdr: '4000133725' };

  it('senza esclusione la voce scivola sul PDR e prende l\'intervento del vicino', () => {
    const link = buildVoceInterventoLinker([it_({ id: 'iVicino', odl: 'ALTRO-ODL', pdr: '4000133725' })]);
    expect(link(orfana)).toBe('iVicino');
  });

  it('escluso quello occupato, la voce resta orfana invece di agganciare il vicino', () => {
    const occupati = new Set(['iVicino']);
    const candidati = [it_({ id: 'iVicino', odl: 'ALTRO-ODL', pdr: '4000133725' })]
      .filter((i) => !occupati.has(i.id));
    expect(buildVoceInterventoLinker(candidati)(orfana)).toBeNull();
  });

  it('il proprio ODL vince comunque, se l\'intervento giusto è libero', () => {
    const candidati = [
      it_({ id: 'iVicino', odl: 'ALTRO-ODL', pdr: '4000133725' }),
      it_({ id: 'iSuo', odl: '912232071' }),
    ].filter((i) => !new Set(['iVicino']).has(i.id));
    expect(buildVoceInterventoLinker(candidati)(orfana)).toBe('iSuo');
  });
});
