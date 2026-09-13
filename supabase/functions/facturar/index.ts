// Emite una Factura B "A CONSUMIDOR FINAL" en AFIP (WSFEv1) para un pago ya acreditado,
// y guarda el resultado (CAE, número, vencimiento) en public.facturas.
//
// No se le pide nada al cliente (ni CUIT/DNI ni nombre): por RG 1415/2003, Anexo II,
// para operaciones menores a $10.000.000 esos datos van como "NR" (No Requerido).
//
// Función interna: solo la llaman mp-webhook, mp-suscripcion y confirmar_pago cuando
// se acredita un pago, nunca el cliente. Sin JWT de usuario (como mp-webhook, "Verify
// JWT" desactivado a mano en el dashboard) — se autentica con un secreto compartido en
// el header x-internal-secret, comparado contra el secreto FACTURAR_SECRET.
//
// Dos pasos de AFIP, en orden:
//   1. WSAA (login): se firma un "TRA" (ticket de acceso) con el certificado + clave
//      privada (CMS/PKCS7), se lo canjea por un token+sign que dura 12hs. Se cachea en
//      public.afip_ticket porque AFIP rechaza pedir uno nuevo si ya hay uno vigente.
//   2. WSFEv1: con ese token+sign se pregunta el último número de comprobante
//      autorizado para el punto de venta (FECompUltimoAutorizado) y se pide el CAE del
//      siguiente (FECAESolicitar).
import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1";
import QRCode from "npm:qrcode@1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AFIP_CERT = Deno.env.get("AFIP_CERT")!; // contenido del .crt, PEM completo
const AFIP_KEY = Deno.env.get("AFIP_KEY")!; // contenido del .key, PEM completo
const AFIP_CUIT = Deno.env.get("AFIP_CUIT")!; // sin guiones, ej. "20382160801"
const AFIP_PUNTO_VENTA = Number(Deno.env.get("AFIP_PUNTO_VENTA") ?? "1");
const FACTURAR_SECRET = Deno.env.get("FACTURAR_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const WSAA_URL = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFE_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1] : "";
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Fecha del comprobante en horario argentino, no UTC: pasada la 21hs en Argentina ya es
// "mañana" en UTC, y eso hacía que AFIP recibiera la fecha equivocada de noche.
function fechaAfip(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return partes.replace(/-/g, "");
}

// Firma el TRA con el certificado + clave privada (CMS/PKCS7, formato que exige WSAA)
// y lo pide en base64, listo para mandar en el SOAP de loginCms.
function firmarTRA(): string {
  const uniqueId = Math.floor(Date.now() / 1000);
  const gen = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const exp = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const tra = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${gen}</generationTime>
    <expirationTime>${exp}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`;

  const cert = forge.pki.certificateFromPem(AFIP_CERT);
  const key = forge.pki.privateKeyFromPem(AFIP_KEY);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign();

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

async function loginWSAA(): Promise<{ token: string; sign: string }> {
  // Reutiliza el ticket cacheado si todavía tiene margen (AFIP no deja pedir uno
  // nuevo mientras haya uno vigente).
  const { data: cache } = await supabaseAdmin.from("afip_ticket").select("*").eq("id", true).maybeSingle();
  if (cache && new Date(cache.expira_en).getTime() - Date.now() > 5 * 60 * 1000) {
    return { token: cache.token, sign: cache.sign };
  }

  const cms = firmarTRA();
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(WSAA_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "" },
    body: soapBody,
  });
  const resText = await res.text();
  const loginCmsReturn = unescapeXml(tag(resText, "loginCmsReturn"));

  const token = tag(loginCmsReturn, "token");
  const sign = tag(loginCmsReturn, "sign");
  const expirationTime = tag(loginCmsReturn, "expirationTime");

  if (!token || !sign) {
    throw new Error("WSAA no devolvió token/sign: " + resText.slice(0, 500));
  }

  await supabaseAdmin.from("afip_ticket").upsert({
    id: true,
    token,
    sign,
    expira_en: expirationTime || new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString(),
  });

  return { token, sign };
}

async function ultimoComprobante(auth: { token: string; sign: string }): Promise<number> {
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${auth.token}</ar:Token>
        <ar:Sign>${auth.sign}</ar:Sign>
        <ar:Cuit>${AFIP_CUIT}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${AFIP_PUNTO_VENTA}</ar:PtoVta>
      <ar:CbteTipo>6</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(WSFE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado",
    },
    body: soapBody,
  });
  const resText = await res.text();
  const cbteNro = tag(resText, "CbteNro");
  if (!cbteNro) throw new Error("No se pudo leer el último comprobante: " + resText.slice(0, 500));
  return Number(cbteNro);
}

async function solicitarCAE(
  auth: { token: string; sign: string },
  nroComprobante: number,
  importe: number,
): Promise<{ cae: string; vencimiento: string }> {
  const hoy = fechaAfip(new Date());
  // Factura B: el total ya incluye el 21% de IVA (no se discrimina en el comprobante
  // impreso, pero WSFE igual pide reportar neto + IVA por separado en la solicitud).
  const neto = Math.round((importe / 1.21) * 100) / 100;
  const iva = Math.round((importe - neto) * 100) / 100;

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${auth.token}</ar:Token>
        <ar:Sign>${auth.sign}</ar:Sign>
        <ar:Cuit>${AFIP_CUIT}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${AFIP_PUNTO_VENTA}</ar:PtoVta>
          <ar:CbteTipo>6</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>2</ar:Concepto>
            <ar:DocTipo>99</ar:DocTipo>
            <ar:DocNro>0</ar:DocNro>
            <ar:CbteDesde>${nroComprobante}</ar:CbteDesde>
            <ar:CbteHasta>${nroComprobante}</ar:CbteHasta>
            <ar:CbteFch>${hoy}</ar:CbteFch>
            <ar:ImpTotal>${importe.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0</ar:ImpTotConc>
            <ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0</ar:ImpOpEx>
            <ar:ImpIVA>${iva.toFixed(2)}</ar:ImpIVA>
            <ar:ImpTrib>0</ar:ImpTrib>
            <ar:FchServDesde>${hoy}</ar:FchServDesde>
            <ar:FchServHasta>${hoy}</ar:FchServHasta>
            <ar:FchVtoPago>${hoy}</ar:FchVtoPago>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>
            <ar:Iva>
              <ar:AlicIva>
                <ar:Id>5</ar:Id>
                <ar:BaseImp>${neto.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${iva.toFixed(2)}</ar:Importe>
              </ar:AlicIva>
            </ar:Iva>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(WSFE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
    },
    body: soapBody,
  });
  const resText = await res.text();

  const cae = tag(resText, "CAE");
  const vencimiento = tag(resText, "CAEFchVto");
  const resultado = tag(resText, "Resultado");

  if (!cae || resultado !== "A") {
    throw new Error(`AFIP rechazó la factura (Resultado=${resultado}): ${resText}`);
  }

  return { cae, vencimiento: `${vencimiento.slice(0, 4)}-${vencimiento.slice(4, 6)}-${vencimiento.slice(6, 8)}` };
}

// Arma la URL con el QR que exige AFIP en todo comprobante electrónico desde la RG
// 4892/2020 (no es opcional ni depende de si el producto es digital o físico — aplica
// a cualquier factura electrónica). El QR apunta al validador público de AFIP con los
// datos del comprobante codificados en base64 dentro del query param "p".
function urlQrAfip(datos: { fechaISO: string; numero: number; importe: number; cae: string }): string {
  const payload = {
    ver: 1,
    fecha: datos.fechaISO,
    cuit: Number(AFIP_CUIT),
    ptoVta: AFIP_PUNTO_VENTA,
    tipoCmp: 6, // Factura B
    nroCmp: datos.numero,
    importe: datos.importe,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: 99, // Consumidor Final sin identificar
    nroDocRec: 0,
    tipoCodAut: "E",
    codAut: Number(datos.cae),
  };
  const base64 = btoa(JSON.stringify(payload));
  return `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
}

// PDF de la factura, con el QR obligatorio de AFIP (RG 4892/2020) además de todos los
// datos en texto: CAE, vencimiento, punto de venta, número, fecha, importe, leyenda
// "A CONSUMIDOR FINAL".
async function generarPdf(datos: {
  numero: number;
  cae: string;
  vencimiento: string;
  importe: number;
  fecha: string; // dd/mm/yyyy, para mostrar
  fechaISO: string; // yyyy-mm-dd, para el QR
}): Promise<Uint8Array> {
  const NAVY = rgb(0.06, 0.09, 0.16); // #0F172A
  const EMERALD = rgb(0.06, 0.72, 0.51); // #10B981
  const SLATE = rgb(0.39, 0.45, 0.55); // #64748B
  const WHITE = rgb(1, 1, 1);
  const LINE = rgb(0.88, 0.9, 0.94);
  const BG = rgb(0.97, 0.98, 0.99);

  const PAGE_W = 420;
  const PAGE_H = 460;
  const M = 28; // margen izquierdo/derecho, todo se alinea contra esto
  const CONTENT_W = PAGE_W - M * 2;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null;
  try {
    const logoRes = await fetch("https://ingresos247.com/logo-icon.png");
    if (logoRes.ok) logoImg = await pdf.embedPng(new Uint8Array(await logoRes.arrayBuffer()));
  } catch {
    // sin logo no rompe el PDF, sigue sin él
  }

  // Header navy, logo+nombre centrados verticalmente en la franja.
  const HEADER_H = 68;
  const headerMidY = PAGE_H - HEADER_H / 2;
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY });
  if (logoImg) {
    page.drawImage(logoImg, { x: M, y: headerMidY - 11, width: 22, height: 22 });
    page.drawText("Ingresos247", { x: M + 30, y: headerMidY - 6, size: 14, font: bold, color: WHITE });
  } else {
    page.drawText("Ingresos247", { x: M, y: headerMidY - 6, size: 14, font: bold, color: WHITE });
  }

  // Recuadro con la letra del comprobante: AFIP exige que vaya arriba, centrado
  // horizontalmente — no es solo estética, es parte de la estructura obligatoria.
  const boxW = 50, boxH = 50;
  const boxX = PAGE_W / 2 - boxW / 2;
  const boxY = headerMidY - boxH / 2;
  page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, color: WHITE, borderColor: NAVY, borderWidth: 1.4 });
  page.drawText("B", { x: boxX + boxW / 2 - 6.5, y: boxY + boxH / 2 - 9, size: 20, font: bold, color: NAVY });
  page.drawText("COD. 06", { x: boxX + boxW / 2 - 15, y: PAGE_H - HEADER_H - 16, size: 6, font, color: SLATE });

  let y = PAGE_H - HEADER_H - boxH / 2 - 20;

  // Fila de datos: CUIT a la izquierda, fecha a la derecha, misma línea de base.
  page.drawText(`CUIT ${AFIP_CUIT}`, { x: M, y, size: 9, font, color: SLATE });
  const fechaTxt = `Fecha de emisión: ${datos.fecha}`;
  page.drawText(fechaTxt, { x: PAGE_W - M - font.widthOfTextAtSize(fechaTxt, 9), y, size: 9, font, color: SLATE });
  y -= 16;
  page.drawText(`Punto de Venta ${String(AFIP_PUNTO_VENTA).padStart(4, "0")}`, { x: M, y, size: 9, font, color: SLATE });
  const nroTxt = `Comprobante N° ${String(datos.numero).padStart(8, "0")}`;
  page.drawText(nroTxt, { x: PAGE_W - M - font.widthOfTextAtSize(nroTxt, 9), y, size: 9, font, color: SLATE });
  y -= 20;

  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.75, color: LINE });
  y -= 22;

  page.drawText("A CONSUMIDOR FINAL", { x: M, y, size: 11, font: bold, color: NAVY });
  y -= 18;
  page.drawText("Suscripción mensual Ingresos247", { x: M, y, size: 10, font, color: SLATE });
  y -= 26;

  // Total, en caja centrada de ancho completo, número centrado.
  const totalBoxH = 44;
  page.drawRectangle({ x: M, y: y - totalBoxH, width: CONTENT_W, height: totalBoxH, color: BG });
  page.drawText("IMPORTE TOTAL", { x: M, y: y - 16, size: 8, font: bold, color: SLATE });
  const totalTxt = `$${datos.importe.toFixed(2)}`;
  page.drawText(totalTxt, { x: PAGE_W / 2 - font.widthOfTextAtSize(totalTxt, 20) / 2, y: y - 34, size: 20, font: bold, color: EMERALD });
  y -= totalBoxH + 22;

  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.75, color: LINE });
  y -= 20;

  // QR obligatorio de AFIP (RG 4892/2020), con el CAE alineado verticalmente al centro del QR.
  const qrSize = 64;
  try {
    const qrUrl = urlQrAfip({ fechaISO: datos.fechaISO, numero: datos.numero, importe: datos.importe, cae: datos.cae });
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 200 });
    const qrPngBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    const qrImg = await pdf.embedPng(qrPngBytes);
    const qrTop = y;
    page.drawImage(qrImg, { x: M, y: qrTop - qrSize, width: qrSize, height: qrSize });
    const textX = M + qrSize + 18;
    const textMidY = qrTop - qrSize / 2;
    page.drawText("CAE", { x: textX, y: textMidY + 16, size: 8, font, color: SLATE });
    page.drawText(datos.cae, { x: textX, y: textMidY + 2, size: 12, font: bold, color: NAVY });
    page.drawText(`Vencimiento: ${datos.vencimiento}`, { x: textX, y: textMidY - 14, size: 9, font, color: SLATE });
  } catch (qrError) {
    console.error("no se pudo generar el QR:", qrError);
    page.drawText(`CAE: ${datos.cae}`, { x: M, y: y - 14, size: 10, font, color: SLATE });
    page.drawText(`Vencimiento de CAE: ${datos.vencimiento}`, { x: M, y: y - 30, size: 10, font, color: SLATE });
  }

  const footerTxt = "Comprobante autorizado por AFIP.";
  page.drawText(footerTxt, { x: PAGE_W / 2 - font.widthOfTextAtSize(footerTxt, 7.5) / 2, y: 16, size: 7.5, font, color: SLATE });

  return await pdf.save();
}

async function mandarFacturaPorMail(email: string, pdfBytes: Uint8Array, numero: number) {
  const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Ingresos247 <noreply@ingresos247.com>",
      to: [email],
      subject: `Ingresos247: tu factura N° ${numero}`,
      html: `<p>¡Gracias por tu pago! Adjuntamos tu factura.</p>`,
      attachments: [
        { filename: `factura-${numero}.pdf`, content: pdfBase64 },
      ],
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    if (req.headers.get("x-internal-secret") !== FACTURAR_SECRET) {
      return new Response(JSON.stringify({ error: "no autorizado" }), { status: 401, headers: CORS_HEADERS });
    }

    // Llamada directa (mp-webhook, mp-suscripcion) manda {user_id, payment_id, importe}
    // plano. Un Database Webhook (pagos_transferencia) manda {record: {...}} — soporta
    // los dos formatos.
    const body = await req.json();
    const datos = body.record ?? body;
    const user_id = datos.user_id;
    const payment_id = datos.payment_id ?? datos.id ?? null;
    const importe = datos.importe;

    if (!user_id || !importe) {
      return new Response(JSON.stringify({ error: "faltan user_id o importe" }), { status: 200, headers: CORS_HEADERS });
    }

    const auth = await loginWSAA();
    const ultimoNro = await ultimoComprobante(auth);
    const nuevoNro = ultimoNro + 1;
    const { cae, vencimiento } = await solicitarCAE(auth, nuevoNro, importe);

    const { error: insertError } = await supabaseAdmin.from("facturas").insert({
      user_id,
      payment_id: payment_id ? String(payment_id) : null,
      tipo_comprobante: 6,
      punto_venta: AFIP_PUNTO_VENTA,
      numero: nuevoNro,
      cae,
      cae_vencimiento: vencimiento,
      importe,
    });

    if (insertError) {
      console.error("factura emitida pero no se pudo guardar:", insertError);
      return new Response(JSON.stringify({ error: "factura emitida pero no se pudo guardar", cae }), { status: 200, headers: CORS_HEADERS });
    }

    // Mandar el mail no debe hacer fallar la respuesta si algo sale mal ahí — la
    // factura ya quedó emitida y guardada, lo importante.
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user_id);
      if (userData?.user?.email) {
        const fechaISO = fechaAfip(new Date()).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
        const pdfBytes = await generarPdf({
          numero: nuevoNro,
          cae,
          vencimiento,
          importe,
          fecha: fechaISO.split("-").reverse().join("/"),
          fechaISO,
        });
        await mandarFacturaPorMail(userData.user.email, pdfBytes, nuevoNro);
      }
    } catch (mailError) {
      console.error("factura emitida pero no se pudo mandar el mail:", mailError);
    }

    return new Response(JSON.stringify({ ok: true, cae, numero: nuevoNro, vencimiento }), { status: 200, headers: CORS_HEADERS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: CORS_HEADERS });
  }
});
