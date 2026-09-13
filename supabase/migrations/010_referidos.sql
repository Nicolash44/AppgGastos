-- Códigos de referido para identificar por qué vendedor entró cada cliente, y poder
-- pagarle su comisión cuando se acredita cada pago (primero o renovación).

-- Lista fija de vendedores, la administrás vos a mano (insert directo en el Table
-- Editor o el SQL Editor cuando sumes uno nuevo). Sin policies: no la toca el cliente.
create table public.vendedores (
  codigo text primary key,
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.vendedores enable row level security;

-- Queda fijo para el usuario desde que se registra (no se puede pisar después).
alter table public.perfiles add column if not exists codigo_referido text references public.vendedores(codigo);

-- El trigger de alta de usuario (002_trial_bloqueo_rls.sql) ahora también toma el
-- código de referido del metadata del signUp (?ref=CODIGO en la URL lo precarga en el
-- frontend). Si el código no existe o está inactivo, se ignora en silencio: nunca
-- bloquea el registro.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  v_codigo := new.raw_user_meta_data->>'codigo_referido';

  insert into public.perfiles (user_id, codigo_referido)
  values (
    new.id,
    case
      when v_codigo is not null and exists (select 1 from public.vendedores where codigo = v_codigo and activo)
        then v_codigo
      else null
    end
  );
  return new;
end;
$$;

-- Respaldo para cuando el registro fue con Google: signInWithOAuth no permite mandar
-- metadata custom como signUp, así que el frontend guarda el ?ref= en localStorage y,
-- ya logueado, llama esta función una sola vez (solo pisa si todavía no tenía código).
create or replace function public.registrar_codigo_referido(p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles
  set codigo_referido = p_codigo
  where user_id = auth.uid()
    and codigo_referido is null
    and exists (select 1 from public.vendedores where codigo = p_codigo and activo);
end;
$$;

grant execute on function public.registrar_codigo_referido(text) to authenticated;

-- Un registro por cada pago acreditado que tiene vendedor asociado. Lo inserta siempre
-- el service_role (webhook de MP, la Edge Function mp-suscripcion, o confirmar_pago()
-- al confirmar una transferencia) — nunca el cliente directo.
create table public.pagos_referidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo_referido text not null references public.vendedores(codigo),
  medio text not null check (medio in ('mercadopago', 'transferencia')),
  monto numeric,
  es_primer_pago boolean not null default false,
  creado_en timestamptz not null default now()
);

alter table public.pagos_referidos enable row level security;

create policy "admin ve pagos de referidos"
  on public.pagos_referidos for select
  using (public.es_admin());

-- confirmar_pago() (transferencia manual) ahora también registra la comisión del
-- vendedor, si el usuario tiene uno asociado desde que se registró.
create or replace function public.confirmar_pago(p_user_id uuid, meses int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_pagado_hasta_anterior timestamptz;
begin
  if not public.es_admin() then
    raise exception 'no autorizado';
  end if;

  select codigo_referido, pagado_hasta into v_codigo, v_pagado_hasta_anterior
  from public.perfiles where user_id = p_user_id;

  update public.perfiles
  set pagado_hasta = greatest(coalesce(pagado_hasta, now()), now()) + (meses || ' months')::interval,
      pago_solicitado = null
  where user_id = p_user_id;

  if v_codigo is not null then
    insert into public.pagos_referidos (user_id, codigo_referido, medio, monto, es_primer_pago)
    values (p_user_id, v_codigo, 'transferencia', 12000 * meses, v_pagado_hasta_anterior is null);
  end if;
end;
$$;

grant execute on function public.confirmar_pago(uuid, int) to authenticated;
