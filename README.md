# Ingresos247

Ver `CLAUDE.md` para el contexto completo del proyecto (arquitectura, modelo de negocio,
seguridad, convenciones) — está escrito para que Claude Code lo lea automáticamente al
abrir esta carpeta, pero sirve igual como documentación para cualquiera.

## Ver el sitio en local

No hay build step. Alcanza con abrir `index.html` en el navegador, o servirlo con
cualquier servidor estático simple, por ejemplo:

```
npx serve .
```

(el login/registro va a fallar en local si el dominio no está en la lista de "Redirect URLs"
de Supabase — para probar el flujo completo de auth, mejor hacerlo contra el sitio ya
desplegado)

## Deploy

Push a la rama `main` — GitHub Pages lo publica solo en `ingresos247.com` (vía el `CNAME`).
No hay CI/CD ni build, es publicación directa de los archivos tal cual están.

## Base de datos y funciones

Viven en Supabase, no en este repo. `supabase/` tiene el historial de migraciones, la Edge
Function y las plantillas de mail como referencia — aplicar cualquier cambio ahí requiere
pegarlo a mano en el dashboard de Supabase (SQL Editor, Edge Functions, Email Templates).
