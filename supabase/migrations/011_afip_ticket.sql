-- Cachea el Ticket de Acceso (TA) de WSAA entre llamadas a la Edge Function "facturar":
-- vence cada 12hs, y AFIP rechaza pedir uno nuevo si todavía hay uno vigente (error
-- "El CEE ya posee un TA valido"), así que hay que reutilizarlo mientras dure. Una sola
-- fila (id fijo), la lee/escribe siempre el service_role — sin policies para el cliente.
create table public.afip_ticket (
  id boolean primary key default true,
  token text not null,
  sign text not null,
  expira_en timestamptz not null,
  check (id)
);

alter table public.afip_ticket enable row level security;
