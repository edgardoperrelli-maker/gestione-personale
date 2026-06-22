// PURA: gli interventi creati dal "+" sono sempre a esito positivo.
// Se il template ha un campo select "eseguito" non ancora valorizzato, lo imposta alla sua
// opzione positiva (es. "SI"), così la colonna Eseguito si popola e il conteggio si allinea.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/** Valori che indicano "non eseguito" (allineato a voceColore/datiRiepilogoPdf, incl. "NESSUN PASSAGGIO"). */
const NEG = /^(no|assente|negativ\w*|ko|nessun[\s_-]*passagg\w*)$/i;

/**
 * Ritorna una copia di `risposte` con `eseguito` impostato all'opzione positiva del template
 * SE il template ha un select `eseguito` e il valore non è già stato scelto. Non distruttiva:
 * non sovrascrive un `eseguito` già valorizzato né tocca altri campi.
 */
export function esitoPositivoDefault(
  campi: TemplateCampo[],
  risposte: Record<string, unknown>,
): Record<string, unknown> {
  const eseguito = campi.find((c) => c.tipo === 'select' && c.chiave === 'eseguito');
  if (!eseguito) return risposte;
  const corrente = risposte.eseguito;
  if (typeof corrente === 'string' && corrente.trim() !== '') return risposte;
  const positivo = (eseguito.opzioni ?? []).find((o) => !NEG.test(String(o).trim())) ?? 'SI';
  return { ...risposte, eseguito: positivo };
}
