// Anteprima locale del PDF rapportino: costruisce voci realistiche, passa dal codice di
// PRODUZIONE (costruisciDatiPdf → generaRiepilogoPdfBlob) e scrive i file su disco.
// Uso: npx tsx scripts/anteprima-rapportino-pdf.ts [cartella]
import { writeFileSync, mkdirSync } from 'node:fs';
import { costruisciDatiPdf, type VoceRiepilogo } from '@/utils/rapportini/datiRiepilogoPdf';
import { generaRiepilogoPdfBlob, nomeFilePdf } from '@/utils/rapportini/rapportinoPdf';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';

const out = process.argv[2] || './anteprime-pdf';
mkdirSync(out, { recursive: true });

const info = (chiavi: string[]): TemplateInfoCampo[] =>
  chiavi.map((c, i) => ({ chiave: c as TemplateInfoCampo['chiave'], etichetta: c.toUpperCase(), ordine: i + 1 }));

const campo = (chiave: string, etichetta: string, tipo: TemplateCampo['tipo'], ordine: number): TemplateCampo =>
  ({ chiave, etichetta, tipo, ordine });

/* ── GIOSI: 24 interventi, tutti eseguiti, nessuna crocetta (solo attività) ── */
const campiGiosi: TemplateCampo[] = [
  campo('eseguito', 'ESEGUITO', 'select', 1),
  campo('motivo_non_eseguito', 'MOTIVO NON ESEGUITO', 'testo', 2),
  campo('lettura', 'LETTURA', 'numero', 3),
  campo('vecchio_matricola', 'VECCHIO MATRICOLA', 'testo', 4),
  campo('nuovo_misuratore', 'NUOVO MISURATORE', 'matricola', 5),
  campo('codoli', 'CODOLI', 'testo', 6),
  campo('saracinesca', 'SARACINESCA', 'select', 7),
  campo('note', 'NOTE', 'testo', 8),
];
const vociGiosi: VoceRiepilogo[] = Array.from({ length: 24 }, (_, i) => ({
  matricola: String(225022 + i * 137),
  odl: String(12382453 - i * 311),
  via: `VIA MORTACINO ${56 + i * 2}`,
  comune: 'TERRACINA',
  diametro: 'DN15',
  attivita: 'SOSTITUZIONE MISURATORE',
  risposte: { eseguito: 'SI', nuovo_misuratore: `M26NA1024${19 + i}` },
}));

/* ── DE SANTIS: giro misto, 7 eseguiti + 10 non eseguiti, note e motivi lunghi ── */
const campiSantis: TemplateCampo[] = [
  campo('eseguito', 'ESEGUITO', 'select', 1),
  campo('motivo_non_eseguito', 'MOTIVO NON ESEGUITO', 'testo', 2),
  campo('lettura', 'LETTURA', 'numero', 3),
  campo('nuovo_misuratore', 'NUOVO MISURATORE', 'matricola', 4),
  campo('codoli', 'CODOLI', 'testo', 5),
  campo('saracinesca', 'SARACINESCA', 'select', 6),
  campo('note', 'NOTE', 'testo', 7),
  campo('cambio', 'CAMBIO', 'crocetta', 8),
  campo('mini_bag', 'MINI BAG RG STOP', 'crocetta', 9),
  campo('sostituzione_valvola', 'SOSTITUZIONE VALVOLA', 'select', 10),
  campo('sigillo', 'SIGILLO', 'crocetta', 11),
];
const vociSantis: VoceRiepilogo[] = [
  { matricola: 'MTSB033205514237', odl: '20044599490', via: 'VIALE TRIESTE 25', comune: 'AGOSTA', cap: '00020', diametro: 'DN15', attivita: 'S-PR-004 A', risposte: { eseguito: 'SI', note: 'INDIRIZZO E VIALE TRIESTE 25A' } },
  { matricola: 'MIT0032013328207', odl: '20044584559', via: 'LARGO DEL GOVERNATORE 9', comune: 'CICILIANO', cap: '00020', diametro: 'DN15', attivita: 'S-PR-003 A', risposte: { eseguito: 'SI' } },
  { matricola: 'FIOR034420253375', odl: '20044602534', via: 'VIA SAN SEBASTIANO 15', comune: 'AFFILE', cap: '00021', diametro: 'DN15', attivita: 'S-MR-002 A', risposte: { eseguito: 'NO', motivo_non_eseguito: 'CLIENTE ASSENTE', note: 'CLIENTE ASSENTE' } },
  { matricola: '0070213075', odl: '20044598287', via: 'VIA PIETRO GOBETTI 2', comune: 'ARSOLI', cap: '00023', diametro: 'DN15', attivita: 'S-PR-003 A', risposte: { eseguito: 'NO', motivo_non_eseguito: 'CLIENTE IN FERIE', note: 'RITORNA DOPO IL 20/08 SECONDO IL VICINO' } },
  { matricola: 'ELS3034016307091', odl: '20044299656', via: 'VIA DEI MARTIRI 54', comune: 'SAN VITO ROMANO', cap: '00030', diametro: 'DN15', attivita: 'S-PR-003 A', risposte: { eseguito: 'NO', motivo_non_eseguito: 'CLIENTE ASSENTE', note: 'CLIENTE ASSENTE' } },
  { matricola: 'ELS3034016422920', odl: '20044602153', via: 'VIA DEL TUFO 25', comune: 'MONTE COMPATRI', cap: '00077', diametro: 'DN15', attivita: 'S-MR-002 A', risposte: { eseguito: 'NO', motivo_non_eseguito: 'CHIAMATO PIU VOLTE ANCHE AL CELLULARE', note: 'CHIAMATO PIU VOLTE ANCHE AL CELLULARE' } },
  { matricola: 'SMGR034118330705', odl: '20044602508', via: 'VIA CASILINA KM22,8', comune: 'MONTE COMPATRI', cap: '00077', diametro: 'DN15', attivita: 'S-PR-007 A', risposte: { eseguito: 'NO', motivo_non_eseguito: 'NO TELEFONO INDIRIZZO SBAGLIATO', note: 'NO TELEFONO INDIRIZZO SBAGLIATO' } },
  { matricola: 'MTSB033208353432', odl: '20044610032', via: 'VIA ROMA 19', comune: 'MONTE PORZIO CATONE', cap: '00078', diametro: 'DN15', attivita: 'S-MR-002 A', risposte: { eseguito: 'NO', motivo_non_eseguito: 'CLIENTE ASSENTE NO RISPONDE AL CELL', note: 'CLIENTE ASSENTE NO RISPONDE AL CELL' } },
  { matricola: 'MTSB033204773234', odl: '20044593550', via: 'PIAZZA BORGHESE 4', comune: 'MONTE PORZIO CATONE', cap: '00078', diametro: 'DN15', attivita: 'S-PR-003 A', risposte: { eseguito: 'SI', note: 'INDIRIZZO E SATTO VIA SCIPIONE BORGHESE 4' } },
  { matricola: '', odl: '20044595359', via: 'VIA DEI GELSI 2', comune: 'ROCCA PRIORA', cap: '00079', diametro: 'DN15', attivita: 'S-PR-001 A', risposte: { eseguito: 'SI', cambio: true } },
  { matricola: '34047A', odl: '957460836', via: 'PIAZZA DEL CAMPO 12', comune: 'SUBIACO', cap: '00028', diametro: 'DN15', attivita: 'Riattivazione fornitura', risposte: { eseguito: 'SI' } },
  { matricola: 'SETA071225011818', odl: '957399428', via: 'CONTRADA BARCO 22', comune: 'AGOSTA', cap: '00020', diametro: 'DN15', attivita: 'Limitazione flusso idrico', risposte: { eseguito: 'NESSUN PASSAGGIO' } },
  { matricola: 'SETA071225007768', odl: '957311052', via: 'VIALE CONTE RONCONE 4', comune: 'CICILIANO', cap: '00020', diametro: 'DN15', attivita: 'Limitazione flusso idrico', risposte: { eseguito: 'SI', note: 'CONTATORE IN VIA DELLA CALZETTA 4 SUBITO A SX' } },
  { matricola: '202015247293', odl: '957344303', via: 'VIA ROMA 36', comune: 'CICILIANO', cap: '00020', diametro: 'DN15', attivita: 'Limitazione flusso idrico', risposte: { eseguito: 'SI', note: 'AL CIV 46 SX PORTONE' } },
  { matricola: '17-120954', odl: '957399005', via: 'VIA VASCA 10', comune: 'AGOSTA', cap: '00020', diametro: 'DN15', attivita: 'Limitazione flusso idrico', risposte: { eseguito: 'NO', motivo_non_eseguito: 'NO MATRICOLA E NESISTENTE FATTURANO SU UN CONTATORE INESISTENTE COME DICE IL PROPRIETARIO', note: 'NO MATRICOLA E NESISTENTE FATTURANO SU UN CONTATORE INESISTENTE COME DICE IL PROPRIETARIO' } },
  { matricola: '202115416000', odl: '957399009', via: 'VIA COLLE FICORONE 99999', comune: 'AGOSTA', cap: '00020', diametro: 'DN15', attivita: 'Limitazione flusso idrico', risposte: { eseguito: 'NESSUN PASSAGGIO' } },
  { matricola: 'MIS-A084-1117', odl: '957399087', via: 'VIA COLLE FICORONE 99999', comune: 'AGOSTA', cap: '00020', diametro: 'DN15', attivita: 'Limitazione flusso idrico', risposte: { eseguito: 'NESSUN PASSAGGIO' } },
];

/* ── SIKORA: template con PDR, indirizzi lunghi, 5 non eseguiti ── */
const campiSikora: TemplateCampo[] = [
  campo('eseguito', 'ESEGUITO', 'select', 1),
  campo('cambio', 'CAMBIO', 'crocetta', 2),
  campo('mini_bag', 'MINI BAG RG STOP', 'crocetta', 3),
  campo('note', 'NOTE', 'testo', 4),
  campo('sostituzione_valvola', 'SOSTITUZIONE VALVOLA', 'select', 5),
  campo('sigillo', 'SIGILLO', 'crocetta', 6),
];
const vociSikora: VoceRiepilogo[] = [
  { nominativo: 'CARPENTIERI LUIGI', matricola: 'MTSB034801888812', pdr: '00882101617674', odl: '20044601658', via: 'VIA ARA DEL LUPO 4', comune: 'BELLEGRA', cap: '00030', attivita: 'S-PR-004 A', fascia_oraria: '08:00-10:00', risposte: { eseguito: 'NO', note: 'ACCESSO IMPEDITO' } },
  { nominativo: 'BURBANO CADENA ANGELICA', matricola: 'FIOR034119481221', pdr: '00882105697623', odl: '20044611918', via: 'VIA DELLA ROCCA 1', comune: 'OLEVANO ROMANO', cap: '00035', attivita: 'S-PR-003 A', fascia_oraria: '08:00-10:00', risposte: { eseguito: 'NO', note: 'ASSENTE' } },
  { nominativo: '', matricola: '202115460288', pdr: '4000396114', odl: '957465124', via: 'VIA FRANCESCO DOMENICO GUERRAZZI 52', comune: 'GUIDONIA MONTECELIO', cap: '00012', attivita: 'Regolarizzazione flusso idrico', risposte: { eseguito: 'SI' } },
  { nominativo: 'IORDACHE MIHAIELA', matricola: 'MTSB033208353432', pdr: '00882105104471', odl: '20044620763', via: 'VIA ROMA 19', comune: 'MONTE PORZIO CATONE', cap: '00078', attivita: 'S-MR-002 A', fascia_oraria: '08:00-10:00', risposte: { eseguito: 'SI' } },
  { nominativo: '', matricola: '202115506656', pdr: '4004217037', odl: '957465351', via: 'VIA LUDOVICO ARIOSTO 20', comune: 'FONTE NUOVA', cap: '00013', attivita: 'Riattivazione fornitura', risposte: { eseguito: 'SI' } },
  { nominativo: 'STAN GEORGETA PAULINA', matricola: 'WTTS034019060951', pdr: '00882101438113', odl: '20044602261', via: 'VIA CALABRIA 66', comune: 'GUIDONIA MONTECELIO', cap: '00012', attivita: 'S-PR-004 A', fascia_oraria: '10:00-12:00', risposte: { eseguito: 'NO', note: 'SCONOSCIUTO' } },
  { nominativo: '', matricola: '202115396582', pdr: '4003314706', odl: '957465545', via: 'VIA VINCENZO GIOBERTI 32', comune: 'FONTE NUOVA', cap: '00013', attivita: 'Regolarizzazione flusso idrico', risposte: { eseguito: 'SI' } },
  { nominativo: 'CAPOCCHIANO ROMANA', matricola: 'MIT0032014458910', pdr: '00880001233381', odl: '20044601666', via: 'VIA GIOVANNI PASCOLI 1/D', comune: 'GUIDONIA MONTECELIO', cap: '00012', attivita: 'S-PR-003 A', fascia_oraria: '08:00-10:00', risposte: { eseguito: 'NO', note: 'ASSENTE' } },
  { nominativo: 'De Vecchis Michela', matricola: 'MTSB033204490430', pdr: '00882105585398', odl: '20044619726', via: 'VIA EMPOLITANA 261', comune: 'TIVOLI', cap: '00019', attivita: 'S-MR-002 A', fascia_oraria: '08:00-10:00', risposte: { eseguito: 'SI' } },
  { nominativo: 'TODINI ILARIA', matricola: '0032908603', pdr: '00882103085892', odl: '20044604294', via: 'VICOLO SAN SEBASTIANO 22', comune: 'CASTEL MADAMA', cap: '00024', attivita: 'S-PR-003 A', fascia_oraria: '12:00-14:00', risposte: { eseguito: 'SI', cambio: true, mini_bag: true } },
  { nominativo: 'VIRI MARIO', matricola: '', pdr: '00882107006302', odl: '20044621400', via: 'VIA SAN SEBASTIANO 15', comune: 'AFFILE', cap: '00021', attivita: 'S-MR-002 A', fascia_oraria: '08:00-10:00', risposte: { eseguito: 'NO', note: 'ACCESSO IMPEDITO' } },
  { nominativo: '', matricola: '202415623658', pdr: '4000423454', odl: '957464576', via: 'VIA JUGOSLAVIA 3', comune: 'GUIDONIA MONTECELIO', cap: '00012', attivita: 'Regolarizzazione flusso idrico', risposte: { eseguito: 'SI' } },
];

const CASI = [
  { staffName: 'GIOSI VITTORIO', dataLabel: '07 agosto 2026', dataIso: '2026-08-07', voci: vociGiosi, campi: campiGiosi, infoCampi: info(['matricola', 'diametro', 'odl', 'via', 'comune', 'cap', 'attivita']), committenti: ['AcquaLatina'] },
  { staffName: 'DE SANTIS ALESSANDRO', dataLabel: '06 agosto 2026', dataIso: '2026-08-06', voci: vociSantis, campi: campiSantis, infoCampi: info(['matricola', 'diametro', 'odl', 'via', 'comune', 'cap', 'attivita']), committenti: ['Italgas', 'Acea'] },
  { staffName: 'SIKORA ARTUR', dataLabel: '07 agosto 2026', dataIso: '2026-08-07', voci: vociSikora, campi: campiSikora, infoCampi: info(['nominativo', 'matricola', 'pdr', 'odl', 'via', 'comune', 'cap', 'attivita', 'fascia_oraria']), committenti: ['Italgas', 'Acea'] },
];

async function main(): Promise<void> {
for (const c of CASI) {
  const dati = costruisciDatiPdf({
    staffName: c.staffName, dataLabel: c.dataLabel, voci: c.voci,
    campi: c.campi, infoCampi: c.infoCampi, committenti: c.committenti,
  });
  const blob = await generaRiepilogoPdfBlob(dati);
  const file = `${out}/${nomeFilePdf(c.staffName, c.dataIso)}`;
  writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  console.log(
    `${file}  interventi ${dati.stats.totali}  eseguiti ${dati.eseguiti.length}  non eseguiti ${dati.nonEseguiti.length}  senza esito ${dati.daFare.length}`,
  );
  console.log(`   attività: ${(dati.attivita ?? []).map((a) => `${a.etichetta} ${a.count}`).join(' · ')}`);
  console.log(`   lavorazioni: ${dati.lavorazioni.map((l) => `${l.etichetta} ${l.count}`).join(' · ') || '(nessuna)'}`);
}
}

void main();
