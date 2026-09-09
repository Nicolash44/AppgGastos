-- Tabla de categorías por usuario (cada uno maneja la suya)
create table categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  nombre text not null,
  orden int not null default 0,
  created_at timestamptz default now(),
  unique (user_id, tipo, nombre)
);

alter table categorias enable row level security;

create policy "select propio" on categorias for select using (auth.uid() = user_id);
create policy "insert propio" on categorias for insert with check (auth.uid() = user_id);
create policy "update propio" on categorias for update using (auth.uid() = user_id);
create policy "delete propio" on categorias for delete using (auth.uid() = user_id);

-- Seed para Ariel con las categorías que ya venía usando (hardcodeadas antes en app.js).
-- El próximo usuario que entre por primera vez las recibe automáticamente desde la app
-- (app.js las siembra solo si la tabla está vacía para ese usuario) — no hace falta repetir esto a mano.
insert into categorias (user_id, tipo, nombre, orden) values
('331bae2f-78b9-478d-a8a7-92169643dd70', 'ingreso', 'Sueldo', 0),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'ingreso', 'Freelance/Changas', 1),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'ingreso', 'Otros', 2),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Mercado', 0),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Nafta', 1),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Mantenimiento Auto', 2),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Servicios', 3),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Vivienda', 4),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Salud', 5),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Seguro', 6),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Tarjeta de Crédito', 7),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Ocio', 8),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Ropa', 9),
('331bae2f-78b9-478d-a8a7-92169643dd70', 'gasto', 'Otros', 10);
