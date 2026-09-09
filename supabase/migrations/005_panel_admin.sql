-- Chequeo interno: ¿el que llama sos vos? Tu UUID es el de tu cuenta de testing.
create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select auth.uid() = 'ee15e501-77cf-4201-b322-331af1337edd'::uuid;
$$;

-- Listado de usuarios con su email real, solo visible para vos.
create or replace function public.admin_listar_usuarios()
returns table (
  user_id uuid,
  email text,
  trial_inicio timestamptz,
  pagado_hasta timestamptz,
  pago_solicitado timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, u.email, p.trial_inicio, p.pagado_hasta, p.pago_solicitado
  from public.perfiles p
  join auth.users u on u.id = p.user_id
  where public.es_admin()
  order by p.created_at desc;
$$;

grant execute on function public.admin_listar_usuarios() to authenticated;

-- confirmar_pago ahora se puede llamar desde la app, pero solo te deja a vos.
create or replace function public.confirmar_pago(p_user_id uuid, meses int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'no autorizado';
  end if;

  update public.perfiles
  set pagado_hasta = greatest(coalesce(pagado_hasta, now()), now()) + (meses || ' months')::interval,
      pago_solicitado = null
  where user_id = p_user_id;
end;
$$;

grant execute on function public.confirmar_pago(uuid, int) to authenticated;

-- Para bloquear manualmente a alguien (ej. te avisaron mal, o querés cortar antes de tiempo).
create or replace function public.admin_bloquear_usuario(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'no autorizado';
  end if;

  update public.perfiles
  set pagado_hasta = now() - interval '1 day'
  where user_id = p_user_id;
end;
$$;

grant execute on function public.admin_bloquear_usuario(uuid) to authenticated;
