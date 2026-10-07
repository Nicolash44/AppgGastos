// Recordatorio diario por push: "no te olvides de cargar tus gastos de hoy". La
// dispara un cron de pg_cron todos los días a las 20hs de Argentina (ver
// 022_push_subscriptions.sql / el cron.schedule pegado a mano en el SQL Editor).
//
// Función interna, sin JWT de usuario (como facturar/reintentar-facturas), gateada por
// header x-internal-secret contra el secreto RECORDATORIO_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RECORDATORIO_SECRET = Deno.env.get("RECORDATORIO_SECRET")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

webpush.setVapidDetails("mailto:musicsincetomorrow@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-internal-secret") !== RECORDATORIO_SECRET) {
      return new Response(JSON.stringify({ error: "no autorizado" }), { status: 401 });
    }

    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    if (error) throw error;

    const payload = JSON.stringify({
      title: "Ingresos247",
      body: "No te olvides de cargar tus gastos e ingresos de hoy.",
      url: "./index.html",
    });

    let enviados = 0;
    const vencidas: string[] = [];

    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          enviados++;
        } catch (e) {
          // 404/410 = el navegador invalidó esa suscripción (desinstaló, limpió datos,
          // etc.) — no es un error nuestro, se borra para no reintentar en vano.
          const status = e?.statusCode ?? e?.status;
          if (status === 404 || status === 410) vencidas.push(s.id);
          else console.error("error mandando push a", s.id, e);
        }
      }),
    );

    if (vencidas.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", vencidas);
    }

    return new Response(JSON.stringify({ ok: true, enviados, vencidas: vencidas.length }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
