// Webhook público de Mercado Pago (sin verificación de JWT de Supabase — hay que
// desactivar "Verify JWT" para esta función desde el dashboard, MP la llama sin auth).
//
// Nunca confiamos en el payload que manda MP directamente: con el id que trae,
// volvemos a pedirle el recurso real a la API de Mercado Pago, así nadie puede
// simular un webhook falso y activarse solo.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let type = url.searchParams.get("type") ?? url.searchParams.get("topic");
    let dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");

    // MP también manda esto por body en vez de query string según el evento.
    if (!type || !dataId) {
      const body = await req.json().catch(() => null);
      if (body) {
        type = type ?? body.type ?? body.topic;
        dataId = dataId ?? body.data?.id ?? body.resource;
      }
    }

    if (!type || !dataId) {
      return new Response("ignorado: sin type/id", { status: 200 });
    }

    // Suma un mes a pagado_hasta (desde el vencimiento actual si sigue vigente,
    // si no desde hoy) y registra el payment_id para no acreditar dos veces si
    // Mercado Pago reenvía la misma notificación.
    async function acreditarPago(userId: string, paymentId: string) {
      const { error: insertError } = await supabaseAdmin
        .from("pagos_mp")
        .insert({ payment_id: paymentId, user_id: userId });

      if (insertError) {
        // conflicto de PK = ya lo habíamos procesado antes (MP reenvió el webhook)
        return new Response("ignorado: pago ya procesado", { status: 200 });
      }

      const { data: perfil } = await supabaseAdmin
        .from("perfiles")
        .select("pagado_hasta")
        .eq("user_id", userId)
        .single();

      const base = perfil?.pagado_hasta && new Date(perfil.pagado_hasta) > new Date()
        ? new Date(perfil.pagado_hasta)
        : new Date();
      const nuevoVencimiento = new Date(base);
      nuevoVencimiento.setMonth(nuevoVencimiento.getMonth() + 1);

      await supabaseAdmin
        .from("perfiles")
        .update({ pagado_hasta: nuevoVencimiento.toISOString(), pago_solicitado: null })
        .eq("user_id", userId);

      return new Response("ok: pago acreditado", { status: 200 });
    }

    if (type === "payment") {
      const pagoRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const pago = await pagoRes.json();

      if (!pagoRes.ok || pago.status !== "approved" || !pago.external_reference) {
        return new Response("ignorado: pago no aprobado", { status: 200 });
      }

      return await acreditarPago(pago.external_reference, String(pago.id));
    }

    // Los pagos recurrentes de una suscripción (Preapproval) no avisan por el
    // topic "payment" — Mercado Pago manda "subscription_authorized_payment"
    // con el id de un recurso de /authorized_payments/, distinto del id de
    // pago suelto de /v1/payments/. Sin este caso, cada débito mensual de una
    // suscripción quedaba invisible para el webhook (así estuvo el bug hasta
    // que se probó el flujo de punta a punta con pago real de Mercado Pago).
    if (type === "subscription_authorized_payment") {
      const apRes = await fetch(`https://api.mercadopago.com/authorized_payments/${dataId}`, {
        headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const ap = await apRes.json();

      if (!apRes.ok || !ap.external_reference || ap.payment?.status !== "approved") {
        return new Response("ignorado: pago de suscripción no aprobado", { status: 200 });
      }

      return await acreditarPago(String(ap.external_reference), String(ap.payment.id));
    }

    if (type === "subscription_preapproval" || type === "preapproval") {
      const preRes = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const pre = await preRes.json();

      if (preRes.ok && pre.status === "authorized" && pre.external_reference) {
        await supabaseAdmin
          .from("perfiles")
          .update({ mp_preapproval_id: pre.id })
          .eq("user_id", pre.external_reference);
      }

      return new Response("ok: preapproval procesada", { status: 200 });
    }

    return new Response("ignorado: tipo no manejado", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error interno", { status: 200 });
  }
});
