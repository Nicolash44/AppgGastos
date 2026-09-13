-- Separar movimientos de "laburo" (facturación/gastos del monotributo) de los
-- "personales", para que un monotributista/freelancer no mezcle todo en un pozo único.
--
-- DEFAULT 'personal' aplica también a las filas ya existentes (Postgres lo hace solo al
-- agregar la columna con DEFAULT + NOT NULL en una sola sentencia) — no rompe nada de lo
-- que ya cargaron los usuarios actuales, todo su historial queda como "personal" y lo
-- pueden reclasificar a mano si corresponde.
alter table public.transacciones
  add column cuenta text not null default 'personal' check (cuenta in ('laburo', 'personal'));
