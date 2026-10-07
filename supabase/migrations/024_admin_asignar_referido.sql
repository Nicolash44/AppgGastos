-- El código de referido hoy solo se fija al registrarse (link ?ref=CODIGO o metadata
-- del signup) y queda fijo para siempre vía registrar_codigo_referido() — eso evita que
-- un cliente se asigne un código a sí mismo después del hecho. Pero el admin necesita
-- poder asignarlo (o corregirlo) a mano en cualquier momento: el caso real es alguien
-- que ya tenía cuenta sin referido, y un vendedor lo convenció de pagar después.
create or replace function public.admin_asignar_referido(p_user_id uuid, p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'no autorizado';
  end if;

  if p_codigo is not null and not exists (
    select 1 from public.vendedores where codigo = p_codigo and activo
  ) then
    raise exception 'código de referido inválido o inactivo';
  end if;

  update public.perfiles
  set codigo_referido = p_codigo
  where user_id = p_user_id;
end;
$$;

grant execute on function public.admin_asignar_referido(uuid, text) to authenticated;

-- admin_listar_usuarios ahora también devuelve el código de referido actual, para
-- mostrarlo/editarlo en el panel sin pegarle a la tabla perfiles directo.
create or replace function public.admin_listar_usuarios()
returns table (
  user_id uuid,
  email text,
  trial_inicio timestamptz,
  pagado_hasta timestamptz,
  pago_solicitado timestamptz,
  codigo_referido text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, u.email, p.trial_inicio, p.pagado_hasta, p.pago_solicitado, p.codigo_referido
  from public.perfiles p
  join auth.users u on u.id = p.user_id
  where public.es_admin()
  order by p.created_at desc;
$$;
