-- Pasar de "pagado" (sí/no para siempre) a "pagado_hasta" (fecha de vencimiento mensual)
alter table public.perfiles add column if not exists pagado_hasta timestamptz;

-- Migrar las cuentas que ya estaban marcadas como pagado permanente (Ariel, tu cuenta de testing)
-- para que no se vean afectadas: les damos una fecha bien lejana.
update public.perfiles set pagado_hasta = now() + interval '10 years' where pagado = true;

-- Actualizar la función que decide si alguien puede operar: ahora chequea la fecha, no un booleano.
create or replace function public.puede_operar()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select (pagado_hasta is not null and now() < pagado_hasta)
            or (now() < trial_inicio + interval '5 days')
     from public.perfiles where user_id = auth.uid()),
    false
  );
$$;

-- La columna vieja ya no hace falta
alter table public.perfiles drop column pagado;

-- Función para confirmar un pago mensual desde el SQL Editor.
-- Extiende desde la fecha de vencimiento actual si todavía no venció (no se pierden días
-- si alguien paga antes de tiempo), o desde hoy si ya estaba vencido.
-- A propósito NO se le da permiso a "authenticated": esta función la corrés vos desde
-- el SQL Editor con el UUID del cliente, nunca se llama desde la app.
create or replace function public.confirmar_pago(p_user_id uuid, meses int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles
  set pagado_hasta = greatest(coalesce(pagado_hasta, now()), now()) + (meses || ' months')::interval,
      pago_solicitado = null
  where user_id = p_user_id;
end;
$$;
