-- Límite mensual opcional por categoría de gasto (nunca para ingresos, se controla
-- desde el frontend). Es solo informativo: no bloquea nada, la RLS de "update propio"
-- que ya existe en categorias (001) alcanza para que cada usuario edite el suyo.
alter table public.categorias add column if not exists limite numeric;
