-- Allineamento manuale (attività fornita dal back office).
-- ODL 20043942334 (Firenze, italgas, completato esito "Assente") aveva
-- intervento_tipo vuoto: unica riga completata senza attività. Attività reale
-- = S-MR-002 (gruppo ATTIVITA' ALLA CLIENTELA). Stato precedente: tipo '',
-- gruppo NULL, committente italgas. Guard su descrizione vuota → idempotente.
update public.interventi
set intervento_tipo = 'S-MR-002',
    gruppo_attivita = 'ATTIVITA'' ALLA CLIENTELA',
    committente = 'italgas',
    updated_at = now()
where odl = '20043942334'
  and public.attivita_norm(coalesce(intervento_tipo,'')) = '';
