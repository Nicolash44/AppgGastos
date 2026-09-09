# Ingresos247

App web de control de gastos e ingresos, vendida como servicio mensual ($16.000 ARS/mes,
con 5 días de prueba gratis). Sitio estático (HTML + Alpine.js + Tailwind vía CDN) sobre
Supabase (auth, base de datos, edge functions). Deploy en GitHub Pages, dominio propio
`ingresos247.com`.

## Stack

- **Frontend**: `index.html` + `app.js`, sin build step. Alpine.js para reactividad,
  Tailwind CSS por CDN, Chart.js para gráficos. `config.js` tiene las credenciales públicas
  de Supabase (URL + anon key — están pensadas para ser públicas, la seguridad real la da RLS).
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

- Un solo plan, $16.000/mes, 5 días de prueba gratis al registrarse.
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
- **La `service_role key` de Supabase nunca va en ningún archivo de este repo.** Solo la
  usa la Edge Function `notificar-pago`, como variable de entorno (`SUPABASE_SERVICE_ROLE_KEY`),
  que Supabase inyecta sola — nunca hace falta pegarla en código.
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
- `/supabase/functions/notificar-pago/` — código de la Edge Function. Si se edita, hay que
  volver a pegar el contenido en el editor de Supabase (Edge Functions → notificar-pago) o
  desplegar por CLI — este repo no tiene deploy automático configurado hacia Supabase.
- `/supabase/email-templates/` — referencia de las plantillas de mail. Ídem: cambiarlas acá
  no cambia nada hasta que se pegan a mano en el dashboard.

## Pendiente / conocido

- Sin backups automáticos ni protección contra pausa por inactividad — está en el plan
  Free de Supabase. Subir a Pro ($25 USD/mes) antes de depender de esto con clientes reales.
- Sin política de privacidad ni términos de uso. Relevante por la Ley 25.326 (Argentina) —
  no hay piso de usuarios que active la obligación, aplica desde el primer cliente que no
  sea un conocido cercano.
- Meta tags Open Graph pendientes (cómo se ve el link al compartirlo).
- Accesibilidad: `maximum-scale=1` en el viewport bloquea el zoom (mal para baja visión),
  faltan `aria-label` en botones de ícono (las "×" de borrar), y falta anillo de foco visible
  en chips/toggles para navegación por teclado.
- Sin Mercado Pago ni ningún gateway de pago real — se decidió explícitamente transferencia
  manual + confirmación manual, no asumir que hay que migrar a eso sin que se pida.

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
