import { describe, expect, it } from 'vitest';
import { correzioniDaImport, ESITO_POSITIVO } from './correggiEsiti';

const ordine = (odl: string, esito_positivo: boolean | null) => ({ odl, esito_positivo });
const intervento = (id: string, odl: string | null, stato: string | null, esito: string | null) =>
  ({ id, odl, stato, esito });

describe('correzioniDaImport — il positivo di ACEA vince', () => {
  it('corregge il completato non positivo che ACEA ha contabilizzato', () => {
    // Il caso vero: l'operatore ha esitato male, ACEA ha pagato. In produzione l'esito
    // "negativo" è rappresentato da esito NULL su un intervento completato.
    const out = correzioniDaImport(
      [ordine('123', true)],
      [intervento('i1', '123', 'completato', null)],
    );
    expect(out).toEqual([{ id: 'i1', odl: '123', esitoPrima: null }]);
  });

  it('NON tocca il nostro positivo quando ACEA tace o dice no', () => {
    /*
      L'asimmetria è la sostanza della regola. «ACEA non l'ha ancora contabilizzato» e «ACEA
      dice che non è stato fatto» sono indistinguibili nell'export, e il primo è la normalità
      di ogni fine mese: cancellare un positivo su quel dubbio vorrebbe dire cancellare lavoro
      fatto in attesa di pagamento.
    */
    const nostroPositivo = [intervento('i1', '123', 'completato', ESITO_POSITIVO)];
    expect(correzioniDaImport([ordine('123', false)], nostroPositivo)).toEqual([]);
    expect(correzioniDaImport([ordine('123', null)], nostroPositivo)).toEqual([]);
  });

  it('non chiude un intervento che nessuno ha ancora lavorato', () => {
    // Scrivere un positivo su un assegnato lo chiuderebbe senza che nessuno ci sia andato.
    for (const stato of ['assegnato', 'annullato', null]) {
      expect(correzioniDaImport([ordine('123', true)], [intervento('i1', '123', stato, null)]))
        .toEqual([]);
    }
  });

  it('un ODL con più uscite le corregge TUTTE', () => {
    // L'export parla dell'ORDINE, non della singola uscita: correggerne una sola lascerebbe
    // il registro a metà, con due righe dello stesso ordine che si contraddicono.
    const out = correzioniDaImport(
      [ordine('123', true)],
      [
        intervento('i1', '123', 'completato', null),
        intervento('i2', '123', 'completato', null),
        intervento('i3', '123', 'completato', ESITO_POSITIVO), // già a posto: fuori
      ],
    );
    expect(out.map((c) => c.id)).toEqual(['i1', 'i2']);
  });

  it('ignora le righe senza ODL, da una parte e dall\'altra', () => {
    expect(correzioniDaImport([ordine('', true)], [intervento('i1', '', 'completato', null)])).toEqual([]);
    expect(correzioniDaImport([ordine('123', true)], [intervento('i1', null, 'completato', null)])).toEqual([]);
  });

  it('gli spazi attorno all\'ODL non impediscono l\'aggancio', () => {
    // Gli ODL passano per celle di Excel: uno spazio in coda è la norma, non l'eccezione.
    const out = correzioniDaImport(
      [{ odl: ' 123 ', esito_positivo: true }],
      [intervento('i1', '123 ', 'completato', null)],
    );
    expect(out).toHaveLength(1);
  });

  it('nessun positivo nel file → nessuna correzione, e si esce subito', () => {
    expect(correzioniDaImport([ordine('123', false), ordine('456', null)],
      [intervento('i1', '123', 'completato', null)])).toEqual([]);
  });
});
