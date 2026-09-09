---
name: Ingresos247
description: App de control de gastos e ingresos con foco en comparar meses de un vistazo
colors:
  navy: "#0F172A"
  slate-body: "#334155"
  slate-muted: "#64748B"
  slate-faint: "#94A3B8"
  slate-line: "#E2E8F0"
  slate-surface: "#F8FAFC"
  emerald: "#059669"
  emerald-deep: "#047857"
  emerald-accent: "#10B981"
  emerald-soft: "#ECFDF5"
  rose: "#E11D48"
  rose-soft: "#FFF1F2"
  rose-line: "#FECDD3"
  amber: "#D97706"
  amber-soft: "#FFFBEB"
typography:
  display:
    fontFamily: "'Space Grotesk', sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.02em"
  button:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.emerald}"
    textColor: "#FFFFFF"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 24px"
  button-primary-active:
    backgroundColor: "{colors.emerald-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
  button-danger:
    backgroundColor: "{colors.rose}"
    textColor: "#FFFFFF"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-muted}"
    typography: "{typography.label}"
    height: "auto"
  chip-selected:
    backgroundColor: "{colors.emerald}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 12px"
  chip-unselected:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.slate-body}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 12px"
  card:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.navy}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 16px"
---

# Design System: Ingresos247

## Overview

**Creative North Star: "El Recibo Prolijo"**

Ingresos247 le pone orden a los "papelitos sueltos": la promesa del producto es que cargar
un movimiento y entenderlo mes a mes sea instantáneo, sin fricción y sin ruido visual. El
sistema es cálido y directo — coherente con el "vos" rioplatense del copy — nunca frío ni
corporativo, pero tampoco informal al punto de restarle seriedad al hecho de que hay plata
real de por medio. La confianza se construye con orden (tarjetas prolijas, jerarquía clara,
un solo número grande por pantalla) y con calidez humana (soporte personal, sombras suaves
en vez de bordes duros), no con ornamento.

La app es mobile-first: una sola columna con acciones grandes al alcance del pulgar, que se
reorganiza en dos columnas recién a partir de md. El balance del mes es siempre el elemento
más grande de la pantalla y el único que cambia de color según el signo — todo lo demás es
jerárquicamente secundario a ese número.

**Key Characteristics:**
- Un solo par de colores de acento (emerald/rose) con significado semántico fijo, nunca decorativo.
- Sombras suaves y tintadas en navy en vez de bordes duros para separar tarjetas del fondo.
- Space Grotesk reservado para plata y marca; el resto es tipografía de sistema.
- Esquinas redondeadas en todos lados, sin excepción — la escala de radio crece con la
  jerarquía de la superficie.
- Objetivos táctiles grandes (mínimo 48px) porque se usa con el pulgar, parado, a las apuradas.

## Colors

La paleta es acotada a propósito: dos acentos semánticos (nunca más) sobre una base neutra
de slate y blanco, con navy como color de marca y texto principal.

### Primary
- **Emerald** (`#059669`): color de acción y de todo lo positivo — botones principales,
  ingresos, confirmaciones, chip de categoría seleccionado cuando el tipo es "ingreso".
- **Emerald Deep** (`#047857`): estado activo/presionado de los botones emerald, y el tono
  de texto para links y montos positivos sobre fondo blanco (más legible que el fill).
- **Emerald Accent** (`#10B981`): el bolt del isotipo y la franja fina de acento arriba de
  la tarjeta de precio — un toque, no un fill.

### Secondary
- **Rose** (`#E11D48`): el opuesto semántico exacto de emerald — gastos, saldo negativo,
  chip de categoría seleccionado cuando el tipo es "gasto", el ícono de eliminar en hover.

### Tertiary
- **Amber** (`#D97706`) sobre fondo **Amber Soft** (`#FFFBEB`): reservado en exclusiva para
  el aviso de vencimiento próximo de la suscripción — es la única superficie del sistema que
  usa un tercer color, y solo para "prestá atención", nunca para acción positiva o negativa.

### Neutral
- **Navy** (`#0F172A`): el color de marca (fondo del isotipo) y el texto principal de mayor
  peso (títulos, balance, nombres de movimiento).
- **Slate Body** (`#334155`): texto secundario con peso — labels de chip sin seleccionar.
- **Slate Muted** (`#64748B`): texto terciario, subtítulos, botones fantasma (Salir, Volver).
- **Slate Faint** (`#94A3B8`): iconografía inactiva, flechas de navegación de mes, texto
  auxiliar de menor jerarquía (fecha + detalle de un movimiento).
- **Slate Line** (`#E2E8F0`): el único borde visible del sistema, reservado a inputs y chips
  sin seleccionar.
- **Slate Surface** (`#F8FAFC`): fondo de página y superficies internas de baja jerarquía
  (fila del alias para transferir, fondo del panel de admin).

### Named Rules
**The Semantic Duo Rule.** Emerald y rose son los únicos dos acentos con significado, y ese
significado es fijo: emerald = positivo/acción, rose = negativo/gasto. Nunca se usan al
revés ni como decoración sin significado — si un elemento nuevo necesita color y no es
claramente positivo o negativo, usa slate, no fuerces uno de los dos semánticos.

## Typography

**Display Font:** Space Grotesk (con sans-serif de sistema como fallback)
**Body Font:** la pila sans de sistema (`ui-sans-serif, system-ui, -apple-system, sans-serif`)

**Character:** un contraste deliberado entre una tipografía display geométrica y segura
para la plata y la marca, y una tipografía de sistema invisible para todo lo demás — la
plata tiene que verse pensada, el texto alrededor no tiene que competir con ella.

### Hierarchy
- **Display** (700, `text-4xl`/2.25rem, leading ajustado): el balance del mes y el precio
  del plan — el número que la persona vino a ver.
- **Headline** (700, `text-3xl`–`text-4xl`, responsive): la pregunta hero de la landing.
- **Title** (700, `text-lg`–`text-xl`): títulos de pantalla y de modal (Admin, Activar
  cuenta, "¿Olvidaste tu contraseña?").
- **Body** (400, `text-base`/1rem): copy general, valores de input, texto de movimientos.
- **Label** (600, 13px, `tracking-wide`): eyebrows de sección en mayúscula de intención
  ("Categorías", "Movimientos", "Comparar meses").

### Named Rules
**The Money Gets The Good Font Rule.** Space Grotesk se usa solo para montos de dinero
(balance, precio, totales) y para la palabra "ingresos247" de la marca. Ninguna otra
cadena de texto la usa, sin excepciones — es lo que hace que la plata destaque de verdad.

## Layout

Mobile-first: una sola columna, `max-w-sm`/`max-w-md` en auth y landing, `max-w-md` en la
app. A partir de `md` (768px) la app pasa a `max-w-5xl` con la carga de movimientos y el
comparativo a la izquierda y los gráficos del mes a la derecha en una grilla de dos
columnas (`md:grid-cols-2`); el listado de movimientos también pasa a dos columnas.

El header de balance queda fijo arriba (`sticky top-0`) mientras se scrollea el resto —
es el único dato que siempre tiene que estar visible. Densidad generosa: `p-4`/`p-6` en
tarjetas, `gap-2`/`gap-3` entre elementos relacionados, y un mínimo de 48px de alto
(`h-12`) en cualquier botón o input que sea la acción principal de su pantalla — se usa
con el pulgar, parado, para cargar un gasto rápido.

## Elevation & Depth

El sistema usa elevación en capas, siempre con sombras muy suaves y tintadas en navy —
nunca negras puras. Cada tarjeta blanca se separa del fondo `slate-surface` únicamente por
sombra, sin borde. La intensidad de la sombra escala con la importancia/flotación de la
superficie: el header sticky y la tarjeta de precio de la landing llevan la sombra más
marcada porque "flotan" sobre contenido; las tarjetas de contenido normal y las filas de
movimiento llevan la versión más liviana.

### Shadow Vocabulary
- **Ambient Card** (`0 1px 2px rgba(15,23,42,0.04), 0 2px 10px rgba(15,23,42,0.05)`):
  tarjetas de contenido — formulario de carga, comparativo, paneles de gráficos.
- **Ambient List Item** (`0 1px 2px rgba(15,23,42,0.04), 0 2px 8px rgba(15,23,42,0.05)`):
  filas de movimiento individuales, la versión más liviana.
- **Ambient Header** (`0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.06)`):
  el header de balance sticky.
- **Ambient Hero** (`0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.08)`):
  la tarjeta de precio en la landing — la más marcada porque es el foco de conversión.
- **Overlay** (`shadow-lg` de Tailwind): el toast de "deshacer", que flota por encima de
  todo lo demás.

### Named Rules
**The Navy Shadow Rule.** Toda sombra usa `rgba(15,23,42, ...)`, nunca `rgba(0,0,0,...)`.
Una sombra negra pura se siente dura y fuera de lugar en un sistema que por lo demás es
cálido y suave.

## Shapes

Esquinas redondeadas en todo el sistema, sin excepciones — el radio escala con la
jerarquía de la superficie: controles chicos y secundarios en `rounded-lg` (8px), botones
primarios e inputs en `rounded-xl` (12px), tarjetas y contenedores en `rounded-2xl` (16px),
y forma completamente circular (`rounded-full`) para cualquier elemento que deba sentirse
como una ficha o token — chips de categoría, el ícono de marca, las flechas de mes anterior/
siguiente.

## Components

### Buttons
- **Shape:** `rounded-xl` (12px) para todos los botones sólidos.
- **Primary:** fill sólido `emerald` o `rose` según el tipo de acción, texto blanco,
  `font-semibold text-base`, alto 48px (`h-12`) — sólidos y con confianza, sin degradés ni
  contornos: tocar un botón de plata tiene que sentirse serio.
- **Active:** oscurece el fill (`emerald-deep`/`rose-700` equivalente) en vez de agregar
  sombra o escala — feedback de "esto ya se registró", no decoración.
- **Ghost/Link:** texto plano subrayado, `text-sm text-slate-muted`, sin fondo ni borde —
  reservado a navegación de baja jerarquía (Volver, Salir, "¿Olvidaste tu contraseña?").
  Nunca compiten visualmente con un botón primario en la misma pantalla.

### Chips (categorías)
- **Style:** `rounded-full`, borde de 1px cuando no están seleccionados.
- **State:** sin seleccionar = `slate-surface` de fondo con texto `slate-body` y borde
  `slate-line`; seleccionado = fill sólido completo con el color del tipo activo (emerald
  para ingreso, rose para gasto) — el chip mismo se convierte en una previsualización del
  tipo de movimiento que se está por cargar.

### Cards / Containers
- **Corner Style:** `rounded-2xl` (16px).
- **Background:** blanco puro sobre el fondo `slate-surface` de la página.
- **Shadow Strategy:** Ambient Card (ver Elevation & Depth) — nunca borde.
- **Internal Padding:** 16px (`p-4`) en tarjetas de contenido, 24px (`p-6`) en tarjetas de
  conversión/auth.

### Inputs / Fields
- **Style:** fondo blanco, borde de 1px `slate-line`, `rounded-xl` — son los únicos
  componentes con borde visible por defecto.
- **Focus:** el borde se reemplaza por un anillo de 2px del color semántico de la pantalla
  (`focus:ring-2`), no solo un cambio de color de borde.
- **Jerarquía de tamaño:** el alto crece con la importancia del campo — 40-44px para campos
  secundarios, 48px para email/contraseña, y el input de monto es el más alto y grande de
  todos (`h-14`, `text-2xl`, centrado) porque es el dato más importante del formulario.

### Navigation
No hay navegación persistente — es una app de un solo propósito. El único "chrome" fijo es
el header de balance (sticky) y el par de flechas circulares sin relleno a los costados del
mes seleccionado.

### Balance (componente insignia)
El número de balance es el elemento más grande y más audaz de todo el sistema
(`font-display text-4xl font-bold`), y el único que cambia de color en vivo según su signo
(emerald si es positivo, rose si es negativo) — el titular numérico comunica el estado de
la cuenta sin necesitar una etiqueta al lado.

## Do's and Don'ts

### Do:
- **Do** usar siempre `rgba(15,23,42, ...)` para sombras — nunca `rgba(0,0,0,...)`.
- **Do** reservar Space Grotesk para plata y para la marca; todo el resto es tipografía de
  sistema.
- **Do** mantener emerald = positivo/acción y rose = negativo/gasto en toda la app, sin
  excepciones ni usos decorativos.
- **Do** darle a toda acción principal un objetivo táctil mínimo de 48px (`h-12`).
- **Do** separar tarjetas del fondo con sombra, nunca con borde.

### Don't:
- **Don't** sumar un tercer acento de color para una feature nueva — extendé el uso de
  emerald/rose o quedate en slate.
- **Don't** reintroducir `blue-*`, `gray-*` o `red-600` en las pantallas de auth (login,
  recuperar contraseña, registro, nueva contraseña) — ya se migraron a emerald/slate/rose
  para unificarlas con el resto de la app; no son un estilo alternativo válido a reciclar.
- **Don't** agregar sombras duras o bordes como alternativa a la sombra ambiental de las
  tarjetas.
- **Don't** dejar que un botón fantasma/secundario compita visualmente con un botón
  primario emerald o rose en la misma pantalla.
