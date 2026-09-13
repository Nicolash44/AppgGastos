// Database Webhook en la tabla pagos_referidos (evento INSERT) -> te manda un mail
// cada vez que se acredita un pago (primero o renovación) de alguien que entró con
// un código de referido, para que puedas pagarle la comisión al vendedor.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL")!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    if (!record) {
      return new Response("ignorado: sin record", { status: 200 });
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(record.user_id);
    const email = userData?.user?.email ?? record.user_id;
    const fecha = new Date(record.creado_en).toLocaleString("es-AR");
    const medio = record.medio === "mercadopago" ? "Mercado Pago" : "transferencia";
    const tipoPago = record.es_primer_pago ? "primer pago" : "renovación";
    const monto = record.monto ? `$${Number(record.monto).toLocaleString("es-AR")}` : "(monto no disponible)";

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ingresos247 <noreply@ingresos247.com>",
        to: [NOTIFY_EMAIL],
        subject: `Ingresos247: comisión — ${record.codigo_referido} (${tipoPago})`,
        html: `<p>Se acreditó un ${tipoPago} de <b>${email}</b> por ${medio}, monto ${monto}, el ${fecha}.</p>
               <p>Código de referido: <b>${record.codigo_referido}</b>.</p>`,
      }),
    });

    if (!emailRes.ok) {
      console.error("error enviando email:", await emailRes.text());
      return new Response("error enviando email", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error interno", { status: 200 });
  }
});
