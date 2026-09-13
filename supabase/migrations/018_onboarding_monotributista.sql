-- Pregunta de onboarding "¿sos monotributista/freelancer?" para que la feature de
-- separación laburo/personal no dependa de que alguien encuentre el ícono de
-- Preferencias en el header (quedó casi invisible ahí, sin texto al lado).
--
-- Se pregunta una sola vez por usuario, en el primer login después de esta migración —
-- funciona igual para alta por email/contraseña o por Google, porque no depende de
-- metadata del signUp (Google no soporta metadata custom en signInWithOAuth, ver
-- CLAUDE.md), sino de una función que se llama ya logueado, mismo patrón que
-- set_es_monotributista().
alter table public.perfiles
  add column monotributista_preguntado boolean not null default false;

-- Reemplaza set_es_monotributista(): además de guardar la preferencia, marca que ya se
-- preguntó — así la pregunta de onboarding no vuelve a aparecer sea cual sea la
-- respuesta (sí, no, o cambiado después a mano desde Preferencias).
create or replace function public.set_es_monotributista(p_valor boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfiles
  set es_monotributista = p_valor,
      monotributista_preguntado = true
  where user_id = auth.uid();
end;
$$;
