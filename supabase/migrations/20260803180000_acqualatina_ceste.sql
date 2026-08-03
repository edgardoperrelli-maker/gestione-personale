-- La CESTA di magazzino sul registro misuratori AcquaLatina.
--
-- Il ciclo fisico, per intero: il contatore si smonta in campo, la sera si scarica in una
-- CESTA numerata del magazzino, e quando la cesta si riempie finisce su un PALLET — che è il
-- riferimento con cui la riconsegna al committente viaggia (colonna `pallet`, 20260731190000).
--
-- Il pezzo che mancava è il primo: in quale cesta è finito quel misuratore. Lo sa solo
-- l'operatore che ce l'ha messo, e lo sa finché se lo ricorda; a cesta piena l'ufficio deve
-- impallettare e per farlo deve sapere quali matricole ci sono dentro. Da qui in poi la cesta
-- la dichiara l'operatore all'invio del rapportino, quando i contatori sono ancora in furgone.
--
-- TEXT e non integer, come il pallet e per lo stesso motivo: è un RIFERIMENTO, non una
-- quantità. Se il magazzino domani numera «A1» o «12-bis» deve poterci stare senza una
-- migration, e gli zeri di testa non devono sparire. Nullable: l'assenza È l'informazione
-- («non ancora scaricato»), e si accompagna allo stato `da_consegnare_deposito`.
--
-- Solo AcquaLatina: il registro ACEA ha un altro ciclo logistico e nessuno ha chiesto le ceste
-- lì. Se un giorno servirà sarà la stessa colonna sulla sua tabella — è già successo al pallet,
-- nato di qua e passato di là quando è servito davvero.
alter table public.acqualatina_misuratori_rimossi
  add column if not exists cesta text;

-- La domanda dell'ufficio è «cosa c'è nella cesta 3?»: indice parziale, le righe ancora in
-- furgone (cesta null) sono la maggioranza e non hanno niente da dire a questa domanda.
create index if not exists acqualatina_misuratori_rimossi_cesta_idx
  on public.acqualatina_misuratori_rimossi (cesta)
  where cesta is not null;


-- ─── L'intervallo delle ceste in magazzino ────────────────────────────────────────────────
--
-- «L'operatore nel magazzino trova le ceste numerate da X a Y»: X e Y sono un dato del
-- MAGAZZINO, non del codice — cambiano quando si aggiunge una fila di ceste, e cambiarli non
-- può costare un deploy. Con l'intervallo configurato l'operatore sceglie il numero da un menu
-- (su un telefono è un tap invece di una digitazione, e un refuso su un numero di cesta è un
-- contatore che non si ritrova più); senza, il campo resta libero e il modulo funziona lo
-- stesso dal primo giorno.
--
-- Riga UNICA garantita dal DB (`id boolean primary key check (id)`): una configurazione di
-- magazzino con due righe non è un caso da gestire, è un bug da rendere impossibile.
create table if not exists public.acqualatina_ceste (
  id          boolean     primary key default true,
  numero_min  integer,
  numero_max  integer,
  updated_at  timestamptz not null default now(),
  constraint acqualatina_ceste_singleton check (id),
  -- O entrambi valorizzati e coerenti, o entrambi nulli («non configurato»). Un solo estremo
  -- non descrive niente e lascerebbe la UI a indovinare l'altro.
  constraint acqualatina_ceste_intervallo check (
    (numero_min is null and numero_max is null)
    or (numero_min is not null and numero_max is not null
        and numero_min >= 1 and numero_max >= numero_min)
  )
);

-- La riga nasce vuota: «non configurato» è uno stato legittimo, non un errore da riempire con
-- numeri inventati che il magazzino non ha.
insert into public.acqualatina_ceste (id, numero_min, numero_max)
values (true, null, null)
on conflict (id) do nothing;

drop trigger if exists acqualatina_ceste_updated_at on public.acqualatina_ceste;
create trigger acqualatina_ceste_updated_at
  before update on public.acqualatina_ceste
  for each row execute function public.set_updated_at();

-- RLS come il registro: lettura agli autenticati, scrittura al solo service role (la PUT passa
-- da una route admin).
alter table public.acqualatina_ceste enable row level security;
drop policy if exists acqualatina_ceste_select on public.acqualatina_ceste;
create policy acqualatina_ceste_select on public.acqualatina_ceste
  for select to authenticated using (true);
