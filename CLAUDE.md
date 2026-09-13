# Ingresos247

App web de control de gastos e ingresos, vendida como servicio mensual ($14.000 ARS/mes
por Mercado Pago, $12.000 ARS/mes por transferencia, con 5 días de prueba gratis). Sitio
estático (HTML + Alpine.js + Tailwind) sobre
Supabase (auth, base de datos, edge functions). Deploy en GitHub Pages, dominio propio
`ingresos247.com`.

## Stack

- **Frontend**: `index.html` + `app.js`, sin build step. Alpine.js para reactividad,
  Tailwind CSS, Chart.js para gráficos. `config.js` tiene las credenciales públicas
  de Supabase (URL + anon key — están pensadas para ser públicas, la seguridad real la da RLS).
- **`/vendor/`**: Alpine, Tailwind (el script del CDN), Supabase JS y Chart.js están
  bajados y commiteados acá en vez de cargarse desde un CDN externo (`cdn.tailwindcss.com`,
  `jsdelivr.net`, etc.). Se cambió así porque a un usuario real esos dominios le quedaban
  bloqueados por su red/operador, dejando la página completamente en blanco sin aviso.
  Sirven como archivos estáticos comunes, no rompe la regla de "sin build system" — son
  los mismos archivos, solo que locales. Si hay que actualizar una versión, se vuelve a
  bajar el archivo a mano y se reemplaza (no hay npm ni lockfile acá).
- **Backend**: Supabase (Postgres + Auth + Edge Functions). Sin backend propio.
- **Deploy**: GitHub Pages, rama `main`, carpeta raíz. `CNAME` apunta a `ingresos247.com`.
  DNS en Donweb: 4 registros A a las IPs de GitHub Pages, más los registros de Resend
  (DKIM/SPF/DMARC) para el envío de mail.
- **Mail transaccional**: Resend, configurado como SMTP personalizado de Supabase Auth
  (Authentication → Emails → SMTP Settings). Las plantillas de "Confirm signup" y
  "Reset Password" están pegadas a mano en el dashboard de Supabase — el HTML fuente vive
  en `supabase/email-templates/` como referencia, pero **el que importa es el que está
  pegado en el dashboard**, este repo no lo despliega solo.

## Autenticación

- Email/contraseña y Google OAuth, ambos vía Supabase Auth (`signInWithPassword`,
  `signUp`, `signInWithOAuth({ provider: 'google' })` en `app.js`).
- El botón "Continuar con Google" sirve para login y registro a la vez: si el usuario de
  Google no existía, Supabase lo crea al vuelo. El trigger `trg_crear_perfil`
  (`002_trial_bloqueo_rls.sql`) corre igual para cualquier método de alta y le arma el
  perfil/trial en `perfiles` — no hace falta lógica extra en el frontend para eso.
- **El login con Google no funciona solo con el código del repo.** Hay que habilitar el
  proveedor Google en el dashboard de Supabase (Authentication → Providers → Google) con
  un Client ID/Secret de Google Cloud Console, y agregar ahí la URL de callback que
  Supabase muestra en esa pantalla como "Authorized redirect URI" en el cliente OAuth de
  Google Cloud. Sin ese paso manual (no versionado, como el resto de la config de
  Supabase Auth), el botón tira error.

## Modelo de negocio y cómo funciona el acceso

- Un solo plan, con precio distinto según medio de pago: **$14.000/mes por Mercado Pago,
  $12.000/mes por transferencia** (más barato porque no paga la comisión de MP). 5 días
  de prueba gratis al registrarse. El precio de Mercado Pago se fija en el secreto de
  Edge Function `MP_PRECIO_MENSUAL` (default 14000); el de transferencia es solo texto en
  `index.html` (3 lugares) — no hay una única fuente de verdad para ninguno de los dos.
- **Dos formas de pagar, conviven las dos**: suscripción automática con Mercado Pago
  (débito recurrente con tarjeta) o transferencia manual + confirmación a mano. En la
  pantalla de pago, Mercado Pago es la opción principal; la transferencia queda detrás
  de un link "¿Preferís transferir vos mismo?".
- **Facturación**: solo se emite **Factura B "A CONSUMIDOR FINAL"** (tabla
  `public.facturas`, `009_facturacion.sql`, `tipo_comprobante` 6 fijo). Por RG
  1415/2003, Anexo II, para operaciones menores a $10.000.000 no hace falta pedir
  CUIT/DNI ni nombre del comprador antes de pagar — esos campos van a AFIP como "NR"
  (No Requerido) al facturar. No hay ningún paso ni formulario de datos personales en
  el flujo de pago por este motivo.
- **Códigos de referido / comisiones de vendedores** (`010_referidos.sql`): lista fija
  en `public.vendedores` (codigo, nombre, activo), la administrás vos a mano desde el
  Table Editor de Supabase — no hay panel para crearlos desde la app. Un link tipo
  `ingresos247.com/?ref=CODIGO` precarga el código; `app.js` lo guarda en
  `localStorage` (`ref_pendiente`) para no perderlo si el registro termina siendo con
  Google. Con email/contraseña se manda como metadata del `signUp` y el trigger
  `crear_perfil_nuevo_usuario` lo graba en `perfiles.codigo_referido` al crear el
  perfil; con Google (no soporta metadata custom en `signInWithOAuth`) hay un respaldo:
  ya logueado, `asignarReferidoPendiente()` llama a la función
  `registrar_codigo_referido()`. Queda fijo para siempre una vez asignado — no se puede
  pisar después. Cada vez que se acredita un pago (primero o renovación, por Mercado
  Pago o transferencia) de alguien con código asignado, se inserta una fila en
  `public.pagos_referidos` — desde `mp-webhook`, desde la acción "confirmar" de
  `mp-suscripcion`, y desde `confirmar_pago()` (transferencia). Un Database Webhook en
  esa tabla (evento INSERT) dispara la Edge Function `notificar-referido`, que te manda
  un mail por Resend; el panel admin también lista esas filas directo (tiene su propia
  policy de select para `es_admin()`, no hace falta una RPC extra para leerlas).
- **Mercado Pago** (`007_mercadopago.sql`, `supabase/functions/mp-suscripcion/`,
  `supabase/functions/mp-webhook/`): usa el modelo Preapproval (suscripción mensual).
  `mp-suscripcion` la llama la app logueada para crear (`action: "crear"`, devuelve un
  `init_point` al que se redirige al usuario) o cancelar (`action: "cancelar"`) la
  suscripción. `mp-webhook` es pública (Mercado Pago la llama sin auth de Supabase — su
  "Verify JWT" está desactivado a mano en el dashboard) y **nunca confía en el payload
  que le mandan**: vuelve a pedirle el recurso real a la API de Mercado Pago con el id
  que llega, y recién ahí extiende `pagado_hasta` con la misma fórmula que ya usaba
  `confirmar_pago()`. La tabla `pagos_mp` guarda los `payment_id` ya procesados para no
  duplicar meses si Mercado Pago reenvía la misma notificación. No hace falta tocar
  `puede_operar()` para nada de esto — ya evalúa `pagado_hasta`.
- Secretos de Edge Functions para Mercado Pago (Supabase → Edge Functions → Secrets):
  `MP_ACCESS_TOKEN` (nunca en el repo) y opcionalmente `MP_PRECIO_MENSUAL` (default
  14000 si no está seteado). Si el precio del plan cambia, hay que actualizarlo ahí
  además de en los 3 lugares de `index.html` que lo muestran como texto — no hay una
  única fuente de verdad para el precio todavía.
- Pago manual: el cliente transfiere a un alias (`ALIAS_PAGO` en `app.js`) y toca
  "Ya transferí" en la app. Esto llama a la función `solicitar_pago()` en Supabase, que
  guarda `pago_solicitado` en la tabla `perfiles` — **no marca el pago como confirmado
  solo**, eso lo hace el admin a mano.
- El admin (vos) confirma el pago desde un panel dentro de la misma app (botón "Admin",
  visible solo si tu `user_id` coincide con `ADMIN_USER_ID` en `app.js`), que llama a
  `confirmar_pago(user_id)`. Esa función suma 1 mes a `pagado_hasta` desde la fecha de
  vencimiento actual (no desde hoy, para no perder días si alguien paga adelantado).
- El acceso se corta solo cuando `pagado_hasta` vence y no hay trial activo — lo evalúa
  la función `puede_operar()` en cada policy de RLS, en tiempo real, sin ningún cron job.
- **Gracia de 24hs tras "Ya transferí"** (`006_gracia_pago_solicitado.sql`): mientras el
  admin confirma a mano, `puede_operar()` también deja pasar si `pago_solicitado` tiene
  menos de 24hs, aunque el trial/suscripción ya haya vencido. Se corta sola al llegar las
  24hs si el admin no confirmó, o antes si `confirmar_pago()` ya limpió `pago_solicitado`.
- Cuando alguien marca "Ya transferí", un Database Webhook en la tabla `perfiles` dispara
  la Edge Function `notificar-pago` (en `supabase/functions/notificar-pago/`), que busca
  el email real del usuario (vía Admin API) y te manda un mail por Resend. Solo notifica
  la primera vez que `pago_solicitado` pasa de vacío a tener fecha, no en cada update
  posterior de la fila.

## Seguridad — no tocar sin pensarlo dos veces

- **RLS activo en `transacciones`, `categorias` y `perfiles`.** Cada policy exige
  `auth.uid() = user_id AND puede_operar()`. No sacar `puede_operar()` de ninguna policy
  sin querer dejar pasar gente que no pagó.
- **`perfiles` no tiene policy de insert/update para el cliente.** El único campo que un
  usuario puede tocar de su propia fila es `pago_solicitado`, y solo a través de la función
  `solicitar_pago()` (nunca por UPDATE directo). Esto es a propósito: nadie puede marcarse
  a sí mismo como pagado.
- **`confirmar_pago()` y `admin_bloquear_usuario()` chequean `es_admin()` internamente**
  antes de hacer nada — están otorgadas (`grant execute`) a `authenticated` porque el
  panel de admin las llama desde el cliente, pero la función revienta con excepción si
  quien llama no es el UUID admin. No sacar ese chequeo.
- **La `service_role key` de Supabase nunca va en ningún archivo de este repo.** La usan
  las Edge Functions `notificar-pago`, `mp-suscripcion` y `mp-webhook`, como variable de
  entorno (`SUPABASE_SERVICE_ROLE_KEY`), que Supabase inyecta sola — nunca hace falta
  pegarla en código. Lo mismo aplica a `MP_ACCESS_TOKEN`: solo vive como secreto de
  Edge Function, nunca en `app.js`/`config.js` ni en ningún archivo versionado.
- **`mp-webhook` nunca confía en lo que le manda Mercado Pago directamente** — siempre
  vuelve a pedirle el recurso (pago o suscripción) a la API de MP con el id recibido
  antes de tocar la base. Sin eso, cualquiera podría simular una notificación falsa y
  activarse el acceso sin pagar. No sacar ese re-chequeo al tocar esa función.
- Los foreign keys de `transacciones`, `categorias` y `perfiles` hacia `auth.users` tienen
  `on delete cascade` (ver `002b_fix_cascade_delete.sql`) — sin eso, borrar un usuario de
  prueba desde el dashboard tira error.

## Carpetas

- `/` — el sitio tal cual se sirve (index.html, app.js, config.js, manifest.json, CNAME,
  logos). **Todo lo que esté acá en la raíz es lo que se despliega literal a GitHub Pages.**
- `/supabase/migrations/` — historial de cambios de esquema, en orden. Ya están corridos
  en la base real; están acá como documentación y para levantar una base nueva desde cero
  si hiciera falta (ej. un ambiente de test separado). No hay migration runner conectado —
  correrlas es copiar y pegar en el SQL Editor de Supabase a mano.
- `/supabase/functions/notificar-pago/`, `/supabase/functions/mp-suscripcion/` y
  `/supabase/functions/mp-webhook/` — código de las Edge Functions. Si se editan, hay que
  volver a pegar el contenido en el editor de Supabase (Edge Functions → la función que
  corresponda) o desplegar por CLI — este repo no tiene deploy automático configurado
  hacia Supabase. `mp-webhook` además necesita tener "Verify JWT" desactivado a mano en
  su configuración del dashboard (Mercado Pago la llama sin token de Supabase).
- `/supabase/email-templates/` — referencia de las plantillas de mail. Ídem: cambiarlas acá
  no cambia nada hasta que se pegan a mano en el dashboard.

## Pendiente / conocido

- Sin backups automáticos ni protección contra pausa por inactividad — está en el plan
  Free de Supabase. Subir a Pro ($25 USD/mes) antes de depender de esto con clientes reales.
- Política de privacidad (`privacidad.html`) y términos y condiciones (`terminos.html`) ya
  existen, linkeados desde la landing y el registro. Contacto: `musicsincetomorrow@gmail.com`.
  Redactados en base a la Ley 25.326 (Argentina) — no son un documento revisado por un
  abogado, sirven como piso razonable, no como garantía legal completa.
- Meta tags Open Graph pendientes (cómo se ve el link al compartirlo).
- Accesibilidad: `maximum-scale=1` en el viewport bloquea el zoom (mal para baja visión),
  faltan `aria-label` en botones de ícono (las "×" de borrar), y falta anillo de foco visible
  en chips/toggles para navegación por teclado.
- Mercado Pago está en **producción** con credenciales reales — el flujo de alta,
  primer pago y cancelación ya se probó de punta a punta, con pago real y con el
  problema del navegador in-app de iOS resuelto (`target="_blank"` en el link de
  checkout, ver commit `787aec2`).
- **Facturación electrónica AFIP (WSFEv1) — activa y automática desde `013_cron_reintentar_facturas.sql`.**
  Certificado digital generado y asociado al servicio "Facturación Electrónica" para el
  CUIT del usuario (RI), con punto de venta dedicado tipo "RECE para aplicativo y web
  services" (distinto al de la tienda física). Solo emite **Factura B "A CONSUMIDOR
  FINAL"** — nunca Factura A, nunca pide CUIT/DNI al cliente (ver más arriba, sección
  de Facturación).
  - `supabase/functions/facturar/`: función interna (sin JWT de usuario, gateada por
    header `x-internal-secret` contra el secreto `FACTURAR_SECRET`). Hace login WSAA
    (firma CMS/PKCS7 del TRA con `npm:node-forge`, token+sign cacheado 12hs en
    `public.afip_ticket` porque AFIP rechaza pedir uno nuevo si ya hay uno vigente),
    pregunta el último comprobante autorizado (`FECompUltimoAutorizado`) y pide el CAE
    del siguiente (`FECAESolicitar`, namespace correcto `http://ar.gov.afip.dif.FEV1/`
    — con el nombre "intuitivo" `facturaelectronica/` tira "Tag Auth no fue ingresado"
    aunque el resto esté bien). Después arma un PDF simple con `npm:pdf-lib` (logo
    bajado en vivo de `ingresos247.com/logo-icon.png`) y se lo manda por mail al
    cliente con Resend. Acepta dos formatos de body: `{user_id, payment_id, importe}`
    plano (llamada directa) o `{record: {...}}` (Database Webhook).
    **Ojo con la fecha**: `CbteFch` tiene que calcularse en huso horario argentino, no
    UTC — de noche en Argentina UTC ya es "mañana", y AFIP la rechaza.
  - La llaman, con el monto real que pagó el cliente: `mp-webhook` (`acreditarPago`) y
    `mp-suscripcion` (acción `confirmar`) para Mercado Pago; para transferencia,
    `confirmar_pago()` inserta en `public.pagos_transferencia` (con el precio fijo de
    transferencia × meses) y un Database Webhook (tipo **HTTP Request**, no "Supabase
    Edge Functions" — hace falta mandar el header `x-internal-secret` a mano) dispara
    `facturar` desde ahí.
  - `supabase/functions/reintentar-facturas/` + el cron de `013_cron_reintentar_facturas.sql`
    (`pg_cron` + `pg_net`, cada 6hs): compara `pagos_mp`/`pagos_transferencia` contra
    `facturas.payment_id` y reintenta los que quedaron sin facturar — por ejemplo si
    AFIP rechazó en el momento por el problema conocido de sus propios servidores (ver
    abajo). **El secreto va hardcodeado en el `cron.schedule` de la migración como
    placeholder `<FACTURAR_SECRET>`** — hay que reemplazarlo por el valor real solo al
    pegarlo en el SQL Editor, nunca commitear el valor real.
  - **Quirk de AFIP conocido**: sus servidores de producción están detrás de varias
    instancias (`sr2`, `sr4`, `sr5`, `sr6`...) que a veces no sincronizan a tiempo el
    "último número autorizado" entre ellas, y rechazan con el código 10016 ("El numero
    o fecha del comprobante no se corresponde con el proximo a autorizar") aunque el
    pedido esté bien armado. No es un bug nuestro — se resuelve solo en unos minutos,
    y el cron de reintento existe justamente para no depender de reintentar a mano.

## Convenciones de este proyecto

- Todo el copy de cara al usuario está en español rioplatense informal ("vos", no "tú").
- No usar WhatsApp como canal dentro del producto — se sacó a propósito en algún momento,
  reemplazado por el flujo de "Ya transferí" + notificación por mail.
- Paleta: navy `#0F172A` (marca/texto principal), emerald `#10B981`/`#059669` (positivo,
  CTA), rose `#E11D48` (negativo/gasto), slate (neutros). Tipografía: Space Grotesk para
  títulos y precios, fuente del sistema para el resto.
- Sin framework de build (no Vite/Webpack/npm). Cambios van directo en `index.html`/`app.js`,
  se prueban abriendo el archivo o vía GitHub Pages — no romper ese setup sin que se pida
  explícitamente migrar a un build system.
