# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos públicos por igual, sin un segmento dominante todavía:

- Personas y familias en Argentina que quieren dejar de anotar gastos en papel o Excel y
  ver rápido en qué se les va la plata cada mes.
- Freelancers y monotributistas con ingresos variables (changas, freelance) que necesitan
  ver el balance mes a mes, no solo el gasto fijo.

## Product Purpose

Registrar ingresos y gastos en segundos y mostrar exactamente adónde va cada peso, mes a
mes. Se vende como servicio mensual ($16.000 ARS/mes, con 5 días de prueba gratis), no
como app gratuita de uso ocasional.

## Positioning

La comparación entre meses por categoría es el valor central, no solo el registro de
movimientos. Armar esa comparación a mano en una planilla o con una app gratis de carga
de gastos requiere trabajo manual repetido cada mes; acá es una vista que ya está lista.

## Operating Context

- Dos formas de pagar: suscripción automática con Mercado Pago (débito recurrente con
  tarjeta, se confirma sola vía webhook) o transferencia manual con aviso desde la app
  ("Ya transferí") que el admin confirma a mano desde un panel dentro de la misma app.
- El acceso se corta solo por vencimiento de `pagado_hasta`/trial, evaluado en tiempo real
  vía RLS (`puede_operar()`), sin cron jobs.
- Mail transaccional (confirmación de cuenta, recuperación de contraseña, aviso de pago
  solicitado al admin) vía Resend/Supabase Auth SMTP.
- Deploy directo a GitHub Pages sin build ni CI/CD; cambios de código van en vivo al pushear
  a `main`.
- No hay canal de WhatsApp dentro del producto — se sacó a propósito, reemplazado por el
  flujo de "Ya transferí" + notificación por mail.

## Capabilities and Constraints

- Un solo plan, $16.000 ARS/mes, 5 días de prueba gratis al registrarse.
- Categorías de ingreso/gasto propias y editables por usuario.
- Gráficos de gasto por categoría, evolución de últimos 6 meses, y comparación entre dos
  meses elegidos (con o sin filtro de categoría).
- Sin build system (no Vite/Webpack/npm): Alpine.js + Tailwind CDN sobre Supabase
  (auth, Postgres, Edge Functions). Cambios van directo en `index.html`/`app.js`.
- Sin backups automáticos ni protección contra pausa por inactividad (plan Free de
  Supabase) — constraint conocido, no resuelto todavía.
- Sin política de privacidad ni términos de uso todavía (relevante por Ley 25.326
  Argentina) — pendiente antes de tener clientes que no sean conocidos cercanos.

## Brand Commitments

- Nombre: "ingresos247" (con el "247" en emerald dentro del logotipo).
- Copy de cara al usuario en español rioplatense informal ("vos", no "tú").
- Paleta: navy `#0F172A` (marca/texto principal), emerald `#10B981`/`#059669`
  (positivo/CTA), rose `#E11D48` (negativo/gasto), slate (neutros).
- Tipografía: Space Grotesk para títulos y precios, fuente del sistema para el resto.

## Evidence on Hand

Sin clientes reales todavía más allá de conocidos cercanos — no hay testimonios, casos de
uso ni métricas de uso real para citar. No inventar evidencia de ese tipo en trabajo futuro.

## Product Principles

- Fricción mínima al cargar un movimiento: categoría + monto en segundos, sin pasos
  previos ni configuración obligatoria.
- La comparación mes a mes es el producto, no un extra — cualquier cambio de UI no debería
  esconder ni complicar esa vista.
- Confianza vía transparencia y control: confirmación automática vía Mercado Pago o
  humana vía transferencia manual (a elección del usuario), RLS explícito, sin dark
  patterns de suscripción — cancelar la suscripción de Mercado Pago es un solo botón.
- Simplicidad técnica deliberada: sin build system; cada cambio se prueba abriendo el
  archivo o vía GitHub Pages.
- Es un servicio con soporte personal, no solo software — el trato humano (confirmar pagos,
  responder dudas) es parte de lo que se vende.

## Accessibility & Inclusion

No hay un estándar de accesibilidad formalmente exigido todavía. Gaps conocidos y
pendientes de resolver del todo: viewport que permitía bloquear el zoom (ya corregido en
parte), faltan `aria-label` consistentes en botones de ícono, y falta anillo de foco
visible en algunos chips/toggles para navegación por teclado.
