-- Registro de cada pago confirmado por transferencia manual (a diferencia de MP, no hay
-- webhook que avise de estos pagos), para poder engancharle un Database Webhook que
-- dispare la Edge Function "facturar" — igual patrón que pagos_referidos/notificar-referido.
create table public.pagos_transferencia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  importe numeric not null,
  meses int not null,
  creado_en timestamptz not null default now()
);

alter table public.pagos_transferencia enable row level security;
-- Sin policies: solo la escribe confirmar_pago() (security definer), nadie la lee desde el cliente.

-- confirmar_pago() ahora también deja registrado cada pago confirmado (no solo los que
-- tienen código de referido), para poder facturarlo.
create or replace function public.confirmar_pago(p_user_id uuid, meses int default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_pagado_hasta_anterior timestamptz;
  v_importe numeric;
begin
  if not public.es_admin() then
    raise exception 'no autorizado';
  end if;

  select codigo_referido, pagado_hasta into v_codigo, v_pagado_hasta_anterior
  from public.perfiles where user_id = p_user_id;

  v_importe := 12000 * meses;

  update public.perfiles
  set pagado_hasta = greatest(coalesce(pagado_hasta, now()), now()) + (meses || ' months')::interval,
      pago_solicitado = null
  where user_id = p_user_id;

  if v_codigo is not null then
    insert into public.pagos_referidos (user_id, codigo_referido, medio, monto, es_primer_pago)
    values (p_user_id, v_codigo, 'transferencia', v_importe, v_pagado_hasta_anterior is null);
  end if;

  insert into public.pagos_transferencia (user_id, importe, meses)
  values (p_user_id, v_importe, meses);
end;
$$;

grant execute on function public.confirmar_pago(uuid, int) to authenticated;
