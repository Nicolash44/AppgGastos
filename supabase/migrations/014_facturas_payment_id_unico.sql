-- Evita facturas duplicadas ante AFIP para el mismo pago.
--
-- facturar/index.ts ya chequea esto antes de pedir el CAE, pero ese chequeo por sí solo
-- no cierra una carrera real: si dos invocaciones (ej. el cron de reintentar-facturas y
-- un webhook reenviado de Mercado Pago) leen "todavía no facturado" casi al mismo tiempo,
-- las dos pueden pasar el chequeo antes de que cualquiera inserte. Esta constraint es la
-- última barrera — si eso pasa, el segundo insert falla en vez de guardar una fila más
-- (aunque el CAE de AFIP ya se haya emitido igual, no hay forma de evitar eso desde acá).
--
-- Se permite NULL (facturas manuales viejas o casos sin payment_id) sin chocar entre sí:
-- un índice único parcial ignora los NULL en vez de tratarlos como iguales entre sí.
create unique index if not exists facturas_payment_id_unico
  on public.facturas (payment_id)
  where payment_id is not null;
