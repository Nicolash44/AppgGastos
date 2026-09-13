// Corre cada 6hs (cron, ver 013_cron_reintentar_facturas.sql): compara los pagos
// acreditados (pagos_mp, pagos_transferencia) contra las facturas realmente emitidas
// (facturas.payment_id) y reintenta facturar() los que quedaron sin factura — por
// ejemplo si AFIP rechazó en el momento por el problema de sincronización de sus
// propios servidores que vimos al probar esto.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const FACTURAR_SECRET = Deno.env.get("FACTURAR_SECRET")!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function reFacturar(userId: string, paymentId: string, importe: number) {
  await fetch(`${SUPABASE_URL}/functions/v1/facturar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": FACTURAR_SECRET },
    body: JSON.stringify({ user_id: userId, payment_id: paymentId, importe }),
  }).catch((e) => console.error("no se pudo reintentar factura:", paymentId, e));
}

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-internal-secret") !== FACTURAR_SECRET) {
      return new Response("no autorizado", { status: 401 });
    }

    const { data: facturasExistentes } = await supabaseAdmin.from("facturas").select("payment_id");
    const yaFacturados = new Set((facturasExistentes ?? []).map((f) => f.payment_id).filter(Boolean));

    const { data: pagosMp } = await supabaseAdmin.from("pagos_mp").select("payment_id, user_id");
    const { data: pagosTransferencia } = await supabaseAdmin.from("pagos_transferencia").select("id, user_id, importe");

    let reintentados = 0;

    // pagos_mp no guarda el monto (solo el id) — hay que volver a pedírselo a MP.
    for (const p of pagosMp ?? []) {
      if (yaFacturados.has(p.payment_id)) continue;

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${p.payment_id}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const pago = await mpRes.json();
      if (!mpRes.ok || !pago.transaction_amount) continue;

      await reFacturar(p.user_id, p.payment_id, pago.transaction_amount);
      reintentados++;
    }

    for (const p of pagosTransferencia ?? []) {
      if (yaFacturados.has(p.id)) continue;
      await reFacturar(p.user_id, p.id, p.importe);
      reintentados++;
    }

    return new Response(JSON.stringify({ ok: true, reintentados }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
