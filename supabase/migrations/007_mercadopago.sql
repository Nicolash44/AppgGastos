-- Suscripciones recurrentes con Mercado Pago (Preapproval), como segunda vía de pago
-- además de la transferencia manual. No hace falta tocar puede_operar(): el webhook de
-- MP extiende pagado_hasta con la misma fórmula que ya usa confirmar_pago(), así que
-- todo el resto del sistema de acceso (RLS, trial, gracia de 24hs) sigue igual.

alter table public.perfiles add column if not exists mp_preapproval_id text;

-- Guarda los payment_id de Mercado Pago ya procesados, para que si el webhook reenvía
-- la misma notificación (les pasa) no se le sumen meses de más a nadie.
create table public.pagos_mp (
  payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  procesado_en timestamptz not null default now()
);

alter table public.pagos_mp enable row level security;
-- Sin policies a propósito: solo la toca el service_role desde mp-webhook,
-- igual que perfiles no tiene policy de insert/update para el cliente.
