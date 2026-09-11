// Crea o cancela la suscripción de Mercado Pago del usuario que llama. La invoca la
// app logueada (supabaseClient.functions.invoke), con verificación de JWT de Supabase
// activada por default (no hay que tocar nada de eso en el dashboard).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const MP_PRECIO_MENSUAL = Number(Deno.env.get("MP_PRECIO_MENSUAL") ?? "16000");
// Adónde vuelve el usuario después de autorizar el pago en Mercado Pago.
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://ingresos247.com/";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// La app la llama desde el navegador (otro dominio que supabase.co), así que hace
// falta responder CORS: el preflight OPTIONS y el header en cada respuesta.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // Sin este Content-Type explícito, supabase-js a veces no interpreta bien el
  // body como JSON y trata la respuesta como error aunque haya salido todo bien.
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "no autorizado" }), { status: 401, headers: CORS_HEADERS });
    }
    const user = userData.user;

    const { action } = await req.json();

    if (action === "crear") {
      const backUrl = SITE_URL + (SITE_URL.includes("?") ? "&" : "?") + "suscripcion=pendiente";
      // Sin esto, Mercado Pago no manda los webhooks de "subscription_authorized_payment"
      // de esta suscripción puntual aunque haya una URL configurada a nivel cuenta en el
      // dashboard — para Preapproval hay que pasarla explícita en la creación.
      const notificationUrl = `${SUPABASE_URL}/functions/v1/mp-webhook`;

      const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // payer_email es obligatorio para Mercado Pago. En PRODUCCIÓN va el email
          // real del usuario de la app, sin problema. En modo PRUEBA (sandbox), MP
          // exige que sea el email de un usuario de test de MP — no el email real de
          // un usuario de la app — o tira "Both payer and collector must be real or
          // test users". Para probar el flujo, hay que loguearse en ingresos247 con
          // una cuenta cuyo email sea el del comprador de prueba de Mercado Pago.
          reason: "Ingresos247 - suscripción mensual",
          external_reference: user.id,
          payer_email: user.email,
          back_url: backUrl,
          notification_url: notificationUrl,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: MP_PRECIO_MENSUAL,
            currency_id: "ARS",
          },
        }),
      });

      const mpData = await mpRes.json();

      if (!mpRes.ok || !mpData.init_point) {
        console.error("error creando preapproval:", mpData);
        return new Response(JSON.stringify({ error: "no se pudo crear la suscripción" }), { status: 200, headers: CORS_HEADERS });
      }

      await supabaseAdmin
        .from("perfiles")
        .update({ mp_preapproval_id: mpData.id })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ init_point: mpData.init_point }), { status: 200, headers: CORS_HEADERS });
    }

    if (action === "cancelar") {
      const { data: perfil, error: perfilError } = await supabaseAdmin
        .from("perfiles")
        .select("mp_preapproval_id")
        .eq("user_id", user.id)
        .single();

      if (perfilError || !perfil?.mp_preapproval_id) {
        return new Response(JSON.stringify({ error: "no tenés una suscripción activa" }), { status: 200, headers: CORS_HEADERS });
      }

      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${perfil.mp_preapproval_id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!mpRes.ok) {
        const mpErrorText = await mpRes.text();
        console.error("error cancelando preapproval:", mpErrorText);
        // Si MP dice que ya estaba cancelada, no es un error real: nuestra base
        // había quedado desincronizada (ej. de una prueba anterior). El estado
        // final que queremos (sin suscripción activa) es el mismo, así que
        // limpiamos igual en vez de mostrar error.
        if (!mpErrorText.toLowerCase().includes("cancelled")) {
          return new Response(JSON.stringify({ error: "no se pudo cancelar la suscripción" }), { status: 200, headers: CORS_HEADERS });
        }
      }

      await supabaseAdmin
        .from("perfiles")
        .update({ mp_preapproval_id: null })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ error: "acción inválida" }), { status: 400, headers: CORS_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "error interno" }), { status: 200, headers: CORS_HEADERS });
  }
});
