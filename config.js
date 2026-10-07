// Reemplazá con los datos de tu proyecto Supabase
// Los encontrás en: Project Settings → API
const SUPABASE_URL = "https://ocicvmttyqndsrpnnugy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jaWN2bXR0eXFuZHNycG5udWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MTM2NDIsImV4cCI6MjEwMjM4OTY0Mn0.XOrkO4lGgwuL8j2GArpPQJGC6rms7221b9M5Es0iiBI";

// Clave pública VAPID para suscribirse al Web Push del recordatorio diario — es pública
// a propósito (lo privado es la contraparte que solo vive como secreto de Edge Function,
// VAPID_PRIVATE_KEY, nunca acá).
const VAPID_PUBLIC_KEY = "BCilz5XaifhXLDjdO__CsLtNjqtP1wDUchCmwhU_gdnry9ML0NQ5sgs173bqOYRFnD1PbkAmQFrUu0UUhbwYBE8";
