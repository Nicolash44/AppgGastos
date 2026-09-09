-- Campo para que el cliente avise que ya transfirió, sin poder marcarse pagado solo.
alter table public.perfiles add column if not exists pago_solicitado timestamptz;

-- El cliente solo puede tocar este campo a través de esta función, nunca por UPDATE directo
-- (no hay policy de update en perfiles, y no la necesita: la función corre con permisos propios
-- y solo puede tocar la fila del usuario que la llama).
create or replace function public.solicitar_pago()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles
  set pago_solicitado = now()
  where user_id = auth.uid();
end;
$$;

grant execute on function public.solicitar_pago() to authenticated;
