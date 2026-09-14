-- Para que el tracker de categoría de monotributo no subestime a alguien que empieza a
-- usar Ingresos247 a mitad de año: el usuario declara cuánto facturaba (en los 12 meses
-- previos a una fecha) ANTES de cargar todo en la app, y ese monto se suma a lo real
-- cargado en `transacciones` — pero decayendo linealmente con el tiempo, porque a
-- medida que pasan los días la ventana móvil de 12 meses va dejando atrás ese período
-- viejo y los movimientos reales van cubriendo el hueco. Ver cargarMonotributoCategorias
-- en app.js para la fórmula de decaimiento.
alter table public.perfiles
  add column facturacion_previa numeric,
  add column facturacion_previa_fecha date;

-- Mismo patrón que set_es_monotributista(): sin policy de update en perfiles, el
-- cliente solo puede tocar estos dos campos juntos a través de esta función.
create or replace function public.set_facturacion_previa(p_monto numeric, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles
  set facturacion_previa = p_monto,
      facturacion_previa_fecha = p_fecha
  where user_id = auth.uid();
end;
$$;

grant execute on function public.set_facturacion_previa(numeric, date) to authenticated;
