-- Corre la Edge Function reintentar-facturas cada 6hs, para agarrar cualquier pago que
-- se haya acreditado pero se haya quedado sin factura (ej. por el problema de
-- sincronización de los propios servidores de AFIP que rechaza el número de
-- comprobante en el momento). No hace nada con los que ya están facturados.
--
-- OJO antes de correr esto: reemplazá <FACTURAR_SECRET> por el valor real del secreto
-- (Supabase → Edge Functions → Secrets → FACTURAR_SECRET) antes de pegarlo en el SQL
-- Editor. No lo dejes commiteado en este archivo con el valor real.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'reintentar-facturas',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://ocicvmttyqndsrpnnugy.supabase.co/functions/v1/reintentar-facturas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', '<FACTURAR_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
