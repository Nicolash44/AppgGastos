-- Extiende el trial gratis de 5 a 15 días. Redefine puede_operar() con la misma lógica
-- de 006_gracia_pago_solicitado.sql (gracia de 24hs tras "Ya transferí" incluida),
-- cambiando solo el intervalo del trial.
create or replace function public.puede_operar()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select (pagado_hasta is not null and now() < pagado_hasta)
            or (now() < trial_inicio + interval '15 days')
            or (pago_solicitado is not null and now() < pago_solicitado + interval '24 hours')
     from public.perfiles where user_id = auth.uid()),
    false
  );
$$;
