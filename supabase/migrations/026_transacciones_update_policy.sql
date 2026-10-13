-- La tabla transacciones nunca tuvo policy de UPDATE (solo select/insert/delete desde
-- 001_multiusuario_categorias.sql) — por eso editar un movimiento ya cargado (categoría,
-- detalle, monto, cuenta) se bloqueaba en silencio: la policy faltante hace que
-- Postgres rechace el UPDATE sin que el cliente vea un error explícito (PostgREST
-- devuelve éxito con 0 filas afectadas).
create policy "update propio" on transacciones for update
  using (auth.uid() = user_id and puede_operar())
  with check (auth.uid() = user_id and puede_operar());
