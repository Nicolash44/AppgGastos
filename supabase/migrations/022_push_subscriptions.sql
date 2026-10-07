-- Suscripciones de Web Push para el recordatorio diario ("no te olvides de cargar tus
-- gastos de hoy"). Cada fila es un dispositivo/navegador suscripto — un mismo usuario
-- puede tener varias (celu + compu), por eso no hay un solo registro por usuario.
--
-- A diferencia de perfiles, acá SÍ hay policies de insert/delete directas para el
-- cliente: el endpoint/claves de push no son sensibles para el propio usuario (son del
-- navegador del propio usuario) y no afectan plata ni acceso — no hace falta pasar por
-- una función security definer como con pago_solicitado.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "usuarios ven sus propias suscripciones"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "usuarios crean sus propias suscripciones"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "usuarios borran sus propias suscripciones"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);
