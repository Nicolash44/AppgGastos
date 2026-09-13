// Chatbot de soporte de Ingresos247. La invoca la app logueada (supabaseClient.functions.invoke),
// con verificación de JWT de Supabase activada por default (no hay que tocar nada de eso en
// el dashboard) — mismo patrón que mp-suscripcion.
//
// Dos acciones:
//   - "chat": le pasa el mensaje + historial a la API de Gemini (gratis, ver GEMINI_API_KEY)
//     con un system prompt que describe la app, para que responda dudas típicas de usuarios
//     (precios, cómo pagar, cómo cancelar, prueba gratis, etc.) sin costo por request.
//   - "escalar": el usuario decide a mano que el bot no le resolvió el problema — le manda
//     un mail al soporte (NOTIFY_EMAIL, mismo secreto que usa notificar-pago) con el email
//     del usuario y el transcript completo de la conversación, por Resend.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL")!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Contexto fijo de la app para que el bot conteste sin inventar precios ni pasos que no
// existen. Si cambia el precio o el flujo de pago, actualizar acá también (ver CLAUDE.md:
// no hay una única fuente de verdad para el precio todavía).
const SYSTEM_PROMPT = `Sos el asistente de soporte de Ingresos247, una app web de control de
gastos e ingresos personales. Respondé en español rioplatense informal (vos, no tú), corto y
concreto.

Datos de la app:
- Plan único: $14.000/mes pagando con Mercado Pago (suscripción automática con tarjeta), o
  $12.000/mes transfiriendo a mano (más barato porque no paga la comisión de Mercado Pago).
- 5 días de prueba gratis al registrarse, sin pedir tarjeta.
- Login con email/contraseña o con Google.
- Para pagar por transferencia: desde "Mi suscripción" en la app, tocar "¿Preferís transferir
  vos mismo?", transferir al alias que se muestra ahí y tocar "Ya transferí" — el pago se
  confirma a mano en menos de 24hs, no es automático.
- Para cancelar la suscripción de Mercado Pago: desde "Mi suscripción" en la app, botón
  "Cancelar suscripción". Sigue teniendo acceso hasta que venza lo ya pagado.
- La factura se manda automático por mail (Factura B a Consumidor Final) después de cada pago.
- No hay app de celular, es un sitio web (funciona bien desde el navegador del celular).
- Contacto humano: si no podés resolver la duda, decile al usuario que use el botón
  "No resolví mi problema, avisale al soporte" para que te escriba directo por mail.

No inventes funcionalidades que no existen (no hay WhatsApp, no hay reportes en PDF, no hay
multi-usuario/equipos). Si preguntan algo que no sabés o que requiere ver datos de su cuenta
puntual, decilo con honestidad y sugerí escalar a soporte humano.`;

async function llamarGemini(mensaje: string, historial: { rol: string; texto: string }[]): Promise<string> {
  const contents = historial
    .slice(0, -1) // el último ya es el mensaje actual, se lo pasamos aparte para no duplicarlo
    .filter((m) => m.rol === "usuario" || m.rol === "bot")
    .map((m) => ({
      role: m.rol === "usuario" ? "user" : "model",
      parts: [{ text: m.texto }],
    }));
  contents.push({ role: "user", parts: [{ text: mensaje }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini respondió ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const respuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!respuesta) throw new Error("Gemini no devolvió texto: " + JSON.stringify(data).slice(0, 500));
  return respuesta.trim();
}

async function mandarMailEscalado(email: string, historial: { rol: string; texto: string }[]) {
  const transcript = historial
    .map((m) => `<p><b>${m.rol === "usuario" ? email : "Bot"}:</b> ${m.texto}</p>`)
    .join("\n");

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Ingresos247 <noreply@ingresos247.com>",
      to: [NOTIFY_EMAIL],
      subject: `Ingresos247: soporte sin resolver — ${email}`,
      html: `<p>El chatbot no resolvió la consulta de <b>${email}</b>. Conversación completa:</p>${transcript}`,
    }),
  });

  if (!emailRes.ok) throw new Error("error enviando email: " + (await emailRes.text()));
}

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

    const { action, mensaje, historial } = await req.json();

    if (action === "chat") {
      if (!mensaje) {
        return new Response(JSON.stringify({ error: "falta el mensaje" }), { status: 200, headers: CORS_HEADERS });
      }
      const respuesta = await llamarGemini(mensaje, historial ?? []);
      return new Response(JSON.stringify({ respuesta }), { status: 200, headers: CORS_HEADERS });
    }

    if (action === "escalar") {
      await mandarMailEscalado(user.email ?? user.id, historial ?? []);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ error: "acción desconocida" }), { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: CORS_HEADERS });
  }
});
