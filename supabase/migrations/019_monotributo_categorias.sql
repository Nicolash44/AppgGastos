-- Tabla de referencia con los topes anuales de facturación de cada categoría de
-- monotributo (A, B, C...), para poder mostrarle a un usuario monotributista en qué
-- categoría está parado según lo que facturó (campo `cuenta = 'laburo'` en
-- `transacciones`) en los últimos 12 meses.
--
-- A PROPÓSITO se crea VACÍA: AFIP actualiza estos topes cada 6 meses (enero/julio) y
-- yo no tengo forma de garantizar que un valor hardcodeado acá sea el vigente para tu
-- fecha real. Cargala a mano desde el Table Editor de Supabase con los valores
-- vigentes (afip.gob.ar → Monotributo → Categorías) antes de que la feature muestre
-- algo — mientras esté vacía, la app oculta el widget entero en vez de mostrar un tope
-- inventado. Mismo patrón manual que ya usás para `public.vendedores`.
create table public.monotributo_categorias (
  categoria text primary key,
  tope_anual numeric not null
);

alter table public.monotributo_categorias enable row level security;

-- Es data de referencia, no de un usuario particular — cualquiera logueado la puede
-- leer, nadie la escribe desde el cliente (se carga a mano por vos).
create policy "usuarios autenticados leen los topes"
  on public.monotributo_categorias for select
  using (auth.role() = 'authenticated');
