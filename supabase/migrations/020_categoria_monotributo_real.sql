-- Categoría real en la que el usuario está inscripto en AFIP/ARCA, para compararla
-- contra la que le correspondería según lo facturado (monotributoCategoriaActual en
-- app.js, calculada de transacciones). Sin esto, el widget solo mostraba una
-- estimación aislada — no alcanzaba para detectar "che, tenés que recategorizarte".
--
-- Nullable: no todos los monotributistas van a cargarla, y sin ella el widget sigue
-- funcionando igual que antes (solo estimado, sin la comparación).
alter table public.perfiles
  add column categoria_monotributo text;

-- Mismo patrón que set_es_monotributista(): no hay policy de update en perfiles, el
-- cliente solo puede tocar este campo a través de una función security definer.
create or replace function public.set_categoria_monotributo(p_categoria text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles
  set categoria_monotributo = p_categoria
  where user_id = auth.uid();
end;
$$;

grant execute on function public.set_categoria_monotributo(text) to authenticated;
