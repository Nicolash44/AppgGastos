-- Dispara el recordatorio diario todos los días a las 23:00 UTC = 20:00 de Argentina
-- (Argentina no tiene horario de verano desde 2009, UTC-3 fijo todo el año — no hace
-- falta ajustar esto por estación).
--
-- OJO antes de correr esto: reemplazá <RECORDATORIO_SECRET> por el valor real del
-- secreto (Supabase → Edge Functions → Secrets → RECORDATORIO_SECRET) antes de pegarlo
-- en el SQL Editor. No lo dejes commiteado en este archivo con el valor real.
select cron.schedule(
  'recordatorio-diario',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'https://ocicvmttyqndsrpnnugy.supabase.co/functions/v1/enviar-recordatorio-diario',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', '<RECORDATORIO_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
