import { describe, it, expect } from 'vitest';
import { parseTestoOrdine } from './parseTestoOrdine';

// Casi REALI presi dall'export del Cruscotto (fixture docs/fixtures/acea/export-campione.xlsx).
// Le limitazioni massive e le sostituzioni saracinesca non hanno la colonna "Matricola misuratore"
// valorizzata: impianto e matricola vivono dentro "Testo breve Ordine".

describe('parseTestoOrdine — marcatore LIM_MAS_MATR', () => {
  it('estrae impianto e matricola con suffisso LENTE troncato a lunghezze diverse', () => {
    // Il campo SAP è capped a 40 caratteri: "LENTE" arriva tagliato in modi diversi a seconda
    // della lunghezza della matricola. Non sono suffissi diversi, è la stessa parola troncata.
    expect(parseTestoOrdine('4003633678_LIM_MAS_MATR_202115413757_LEN')).toMatchObject({
      impianto: '4003633678', matricola: '202115413757',
    });
    expect(parseTestoOrdine('4003606500_LIM_MAS_MATR_20121551801_LENT')).toMatchObject({
      impianto: '4003606500', matricola: '20121551801',
    });
    expect(parseTestoOrdine('4000141884_LIM_MAS_MATR_207187_LENTE_MM_')).toMatchObject({
      impianto: '4000141884', matricola: '207187',
    });
    expect(parseTestoOrdine('4000653014_LIM_MAS_MATR_14224422_LENTE_M')).toMatchObject({
      impianto: '4000653014', matricola: '14224422',
    });
  });

  it('regge le matricole non numeriche', () => {
    expect(parseTestoOrdine('4000873366_LIM_MAS_MATR_123324A_LENTE_MM').matricola).toBe('123324A');
    expect(parseTestoOrdine('4000141710_LIM_MAS_MATR_A47902_LENTE_MM_').matricola).toBe('A47902');
    expect(parseTestoOrdine('4000498637_LIM_MAS_MATR_99AO23231_LENTE_').matricola).toBe('99AO23231');
    expect(parseTestoOrdine('4000155668_LIM_MAS_MATR_OA3494_LENTE_MM_').matricola).toBe('OA3494');
    expect(parseTestoOrdine('4000146604_LIM_MAS_MATR_AL014451_LENTE_M').matricola).toBe('AL014451');
  });
});

describe('parseTestoOrdine — marcatore LIM_MASS (formato recente)', () => {
  it('estrae senza il segmento MATR', () => {
    expect(parseTestoOrdine('4004131638_LIM_MASS_202315613068_MM_6')).toMatchObject({
      impianto: '4004131638', matricola: '202315613068',
    });
  });

  it('regge matricole con trattino e prefissi testuali', () => {
    expect(parseTestoOrdine('4004131639_LIM_MASS_04-228458_MM_6').matricola).toBe('04-228458');
    expect(parseTestoOrdine('4004428055_LIM_MASS_MIS-E392-3017_MM_6').matricola).toBe('MIS-E392-3017');
    expect(parseTestoOrdine('4004132395_LIM_MASS_11-0495625-1_MM_6').matricola).toBe('11-0495625-1');
    expect(parseTestoOrdine('4004103143_LIM_MASS_PROV8-X_MM_6').matricola).toBe('PROV8-X');
    expect(parseTestoOrdine('4004129850_LIM_MASS_SETA071226122814_MM_').matricola).toBe('SETA071226122814');
  });
});

describe('parseTestoOrdine — marcatore SOST_SARAC', () => {
  it('estrae anche in minuscolo e con matricola alfanumerica', () => {
    expect(parseTestoOrdine('4000308907_SOST_SARAC_SER_202415647231')).toMatchObject({
      impianto: '4000308907', matricola: '202415647231',
    });
    expect(parseTestoOrdine('4000150441_Sost_Sarac_ser_25-20291502786').matricola).toBe('25-20291502786');
    expect(parseTestoOrdine('4000155875_SOST_SARAC_SER_122888A').matricola).toBe('122888A');
  });

  it('una saracinesca può usare il marcatore LIM_MAS_MATR: il marcatore NON dice l\'attività', () => {
    // 173 delle 267 saracinesche dell'export usano il marcatore delle massive. L'attività si
    // legge solo da "Operazione testo breve": chi filtra sul testo dell'ordine sbaglia.
    expect(parseTestoOrdine('4000348290_LIM_MAS_MATR_202115367073_LEN')).toMatchObject({
      impianto: '4000348290', matricola: '202115367073',
    });
  });
});

describe('parseTestoOrdine — testi che non contengono un misuratore', () => {
  it('ritorna null senza lanciare', () => {
    // Rimozioni allacci abusivi: la matricola non serve e spesso non esiste.
    for (const t of [
      'SCISSIONE_ODL_PADRE 951904401',
      'CESSATI  N. IMPIANTO 4000603152',
      'RICERCA FRODE FONTE NUOVA DA VF',
      'Limitazione-Condomini',
      'Sospensione fornitura per morosità',
      'Verifica sigilli imp.morosi',
      '',
    ]) {
      expect(parseTestoOrdine(t)).toEqual({ impianto: null, matricola: null, sospettoTroncamento: false });
    }
  });

  it('regge null e undefined', () => {
    expect(parseTestoOrdine(null).impianto).toBeNull();
    expect(parseTestoOrdine(undefined).matricola).toBeNull();
  });

  it('non estrae da un impianto che non ha 10 cifre', () => {
    expect(parseTestoOrdine('40036_LIM_MAS_MATR_202115413757_LEN').impianto).toBeNull();
  });
});

describe('parseTestoOrdine — guardrail sul troncamento a 40 caratteri', () => {
  it('segnala il sospetto quando la matricola tocca il limite del campo', () => {
    // 10 (impianto) + 14 ("_LIM_MAS_MATR_") + 16 (matricola) = 40 esatti: il suffisso è sparito
    // e la matricola SUCCESSIVA sarebbe stata tagliata. Matricole a 16 caratteri esistono
    // davvero nell'export (WTTS075224001826).
    const t = '4000000000_LIM_MAS_MATR_WTTS075224001826';
    expect(t).toHaveLength(40);
    expect(parseTestoOrdine(t)).toEqual({
      impianto: '4000000000', matricola: 'WTTS075224001826', sospettoTroncamento: true,
    });
  });

  it('non segnala nulla quando il suffisso è presente (la matricola è al sicuro)', () => {
    expect(parseTestoOrdine('4003633678_LIM_MAS_MATR_202115413757_LEN').sospettoTroncamento).toBe(false);
  });

  /*
    IL MARGINE. La soglia esatta dei 40 e` la prova certa che SAP ha tagliato, ma un testo di 38
    con la matricola a fine stringa e` sospetto lo stesso. Da qui i 10 caratteri di margine: si
    segnala da 30 in su.

    Il compromesso e` voluto e va nella direzione giusta: una riga segnalata a torto si controlla
    in dieci secondi e si scarta, una matricola tagliata che NON viene segnalata diventa un
    misuratore agganciato all'impianto sbagliato — o non agganciato affatto.
  */
  it('segnala anche sotto i 40, dentro il margine di sicurezza', () => {
    const t = '4000308907_SOST_SARAC_SER_202415647231';
    expect(t.length).toBe(38);   // sotto il limite del campo, ma dentro il margine
    expect(parseTestoOrdine(t).sospettoTroncamento).toBe(true);
  });

  it('non segnala i testi davvero corti: li` non c’e` niente da temere', () => {
    // 25 caratteri: nessun taglio plausibile, e segnalarli sarebbe solo rumore che fa perdere
    // fiducia nell'elenco «da controllare».
    const t = '4000308907_LIM_MAS_202415';
    expect(t.length).toBe(25);
    expect(parseTestoOrdine(t).sospettoTroncamento).toBe(false);
  });
});

describe('parseTestoOrdine — normalizzazione', () => {
  it('taglia gli spazi esterni e regge lo spazio al posto dell\'underscore', () => {
    expect(parseTestoOrdine('  4003633678_LIM_MAS_MATR_202115413757_LEN  ').impianto).toBe('4003633678');
    expect(parseTestoOrdine('4003633678 LIM MAS MATR 202115413757').matricola).toBe('202115413757');
  });
});
