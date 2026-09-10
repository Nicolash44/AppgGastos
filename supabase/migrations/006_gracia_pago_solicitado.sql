-- Cuando el cliente avisa "Ya transferí" (solicitar_pago), le damos 24hs de gracia
-- para seguir usando la app mientras el admin confirma el pago a mano. Sin esto,
-- alguien que transfiere justo cuando se le vence el trial/suscripción queda
-- bloqueado hasta que el admin entre a confirmar, aunque ya haya pagado.
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
            or (pago_solicitado is not null and now() < pago_solicitado + interval '24 hours')
     from public.perfiles where user_id = auth.uid()),
    false
  );
$$;
