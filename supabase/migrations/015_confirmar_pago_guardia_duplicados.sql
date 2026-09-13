-- Guardia contra confirmar el mismo pago por transferencia varias veces seguidas.
--
-- Bug real en producción (2026-09-13): se llamó confirmar_pago() 6 veces en 20 segundos
-- para el mismo usuario (probablemente doble/triple click en el botón "confirmar" del
-- panel admin, sin feedback inmediato). Cada llamada insertaba una fila nueva en
-- pagos_transferencia con un id distinto, y facturar() la facturaba como si fuera un
-- pago nuevo — su chequeo de idempotencia por payment_id no lo detecta porque cada
-- llamada genera un payment_id genuinamente distinto. Resultado: 6 facturas reales y
-- válidas ante AFIP para un solo pago real.
--
-- Esta guardia corta el problema en el origen: si ya se confirmó un pago para este
-- usuario en los últimos 5 minutos, confirmar_pago() revienta con excepción en vez de
-- sumar meses y facturar de nuevo. 5 minutos alcanza de sobra para cubrir clicks
-- repetidos y sobra tiempo para que el admin note el error si fue un click real
-- consciente (puede esperar y confirmar de nuevo).
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
  v_ultima_confirmacion timestamptz;
begin
  if not public.es_admin() then
    raise exception 'no autorizado';
  end if;

  select max(creado_en) into v_ultima_confirmacion
  from public.pagos_transferencia
  where user_id = p_user_id;

  if v_ultima_confirmacion is not null and v_ultima_confirmacion > now() - interval '5 minutes' then
    raise exception 'ya se confirmó un pago para este usuario hace menos de 5 minutos (%), evitando una factura duplicada', v_ultima_confirmacion;
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
