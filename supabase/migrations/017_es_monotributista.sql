-- Gatea la feature de "cuenta laburo/personal" (016) detrás de un opt-in explícito, en vez
-- de mostrarla global a cualquier usuario. Surgió de la crítica de diseño de esta feature:
-- para alguien que no factura (usuario hogareño común), el toggle Personal/Laburo era
-- fricción sin sentido en el flujo más protegido de la app ("categoría + monto en
-- segundos"). Default false — nadie ve la feature nueva hasta que la activa a mano.
alter table public.perfiles
  add column es_monotributista boolean not null default false;

-- Mismo patrón que solicitar_pago(): no hay policy de update en perfiles, el cliente
-- solo puede tocar este campo puntual a través de una función security definer que
-- solo puede escribir la fila del propio usuario.
create or replace function public.set_es_monotributista(p_valor boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles
  set es_monotributista = p_valor
  where user_id = auth.uid();
end;
$$;

grant execute on function public.set_es_monotributista(boolean) to authenticated;
