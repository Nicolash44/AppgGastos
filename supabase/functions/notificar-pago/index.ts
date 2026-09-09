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
    const oldRecord = payload.old_record;

    // solo avisar la primera vez que pago_solicitado pasa de vacío a tener fecha
    if (!record || !record.pago_solicitado) {
      return new Response("ignorado: sin pago_solicitado", { status: 200 });
    }
    if (oldRecord && oldRecord.pago_solicitado) {
      return new Response("ignorado: ya se había avisado", { status: 200 });
    }

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(record.user_id);

    if (userError || !userData?.user) {
      console.error("no se encontró el usuario", userError);
      return new Response("usuario no encontrado", { status: 200 });
    }

    const email = userData.user.email;
    const fecha = new Date(record.pago_solicitado).toLocaleString("es-AR");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ingresos247 <noreply@ingresos247.com>",
        to: [NOTIFY_EMAIL],
        subject: "Ingresos247: alguien avisó que ya transfirió",
        html: `<p><b>${email}</b> marcó "Ya transferí" el ${fecha}.</p>
               <p>Confirmá el pago en Supabase → Table Editor → tabla <code>perfiles</code>,
               columna <code>pagado</code>, cuando lo veas acreditado.</p>`,
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
