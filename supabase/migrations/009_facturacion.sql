-- Tabla de facturas emitidas por AFIP para cada pago. La llena la Edge Function
-- "facturar" (service_role) después de pedirle el CAE a AFIP — nunca el cliente directo,
-- por eso sin policies de insert/update, igual que pagos_mp.
--
-- Solo se emite Factura B "A CONSUMIDOR FINAL" (tipo_comprobante 6). Por RG 1415/2003,
-- Anexo II, para operaciones menores a $10.000.000 no hace falta pedir CUIT/DNI ni
-- nombre del comprador — esos campos van como "NR" (No Requerido) al facturar, sin
-- pedirle nada al usuario antes de pagar.
create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_id text,
  tipo_comprobante integer not null default 6,
  punto_venta integer not null,
  numero integer not null,
  cae text not null,
  cae_vencimiento date not null,
  importe numeric not null,
  emitida_en timestamptz not null default now(),
  pdf_url text
);

alter table public.facturas enable row level security;

-- El usuario puede ver (no tocar) sus propias facturas, para poder descargarlas desde la app.
create policy "usuarios ven sus propias facturas"
  on public.facturas for select
  using (auth.uid() = user_id);
