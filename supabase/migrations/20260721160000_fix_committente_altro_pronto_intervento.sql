-- Fix committente non canonico: l'unica riga 'PRONTO INTERVENTO' con committente 'altro'
-- è un errore di data-entry — PRONTO INTERVENTO è un'attività Italgas (gruppo P.I.).
-- La riallinea a italgas così il modulo Performance mostra solo i committenti reali.
-- Narrow apposta: tocca solo quella riga, nessun altro 'altro'.
update interventi
set committente = 'italgas'
where committente = 'altro'
  and intervento_tipo = 'PRONTO INTERVENTO';
