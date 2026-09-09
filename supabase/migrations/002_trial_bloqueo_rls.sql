-- ============================================================
-- Perfil de cada usuario: cuándo empezó su prueba y si ya pagó
-- ============================================================
create table public.perfiles (
  user_id uuid primary key references auth.users(id),
  trial_inicio timestamptz not null default now(),
  pagado boolean not null default false,
  created_at timestamptz default now()
);

alter table public.perfiles enable row level security;

-- cada usuario puede ver su propio estado (para mostrarle "te quedan X días")
create policy "select propio" on public.perfiles for select using (auth.uid() = user_id);
-- a propósito NO hay policy de insert/update para el cliente:
-- "pagado" lo cambiás vos a mano en el Table Editor cuando confirmás el pago por WhatsApp.
-- la fila se crea sola (ver trigger abajo), nunca la inserta el usuario.

-- ============================================================
-- Trigger: al crear un usuario nuevo en Authentication, se le
-- crea el perfil solo, con trial_inicio = ahora. Este es el
-- paso que hace innecesario un panel de admin aparte.
-- ============================================================
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger trg_crear_perfil
after insert on auth.users
for each row execute function public.crear_perfil_nuevo_usuario();

-- ============================================================
-- Función que decide si un usuario puede operar:
-- pagó, O todavía está dentro de los 5 días de prueba.
-- ============================================================
create or replace function public.puede_operar()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select pagado or (now() < trial_inicio + interval '5 days')
     from public.perfiles where user_id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- Actualizar RLS de transacciones y categorias: ahora además
-- de "es tuyo" hay que cumplir puede_operar(). Si la prueba
-- venció y no está pagado, select/insert/delete quedan
-- bloqueados por completo (esto es lo que decidiste como
-- "banear" — bloqueo total, no solo lectura).
-- ============================================================
drop policy "select propio" on transacciones;
drop policy "insert propio" on transacciones;
drop policy "delete propio" on transacciones;

create policy "select propio" on transacciones for select using (auth.uid() = user_id and puede_operar());
create policy "insert propio" on transacciones for insert with check (auth.uid() = user_id and puede_operar());
create policy "delete propio" on transacciones for delete using (auth.uid() = user_id and puede_operar());

drop policy "select propio" on categorias;
drop policy "insert propio" on categorias;
drop policy "update propio" on categorias;
drop policy "delete propio" on categorias;

create policy "select propio" on categorias for select using (auth.uid() = user_id and puede_operar());
create policy "insert propio" on categorias for insert with check (auth.uid() = user_id and puede_operar());
create policy "update propio" on categorias for update using (auth.uid() = user_id and puede_operar());
create policy "delete propio" on categorias for delete using (auth.uid() = user_id and puede_operar());

-- ============================================================
-- El trigger de arriba solo dispara para usuarios NUEVOS.
-- Ariel y tu cuenta de testing ya existían antes de este script,
-- así que hay que darles el perfil a mano, marcados como pagado
-- para que el bloqueo por vencimiento no los afecte a ellos.
-- ============================================================
insert into public.perfiles (user_id, pagado) values
('331bae2f-78b9-478d-a8a7-92169643dd70', true), -- Ariel
('ee15e501-77cf-4201-b322-331af1337edd', true)  -- tu cuenta de testing
on conflict (user_id) do nothing;
