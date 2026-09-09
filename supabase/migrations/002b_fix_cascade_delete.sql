-- Permite borrar un usuario de auth.users sin que la tabla perfiles lo bloquee.
-- Al borrar el usuario, su fila en perfiles se borra sola con él.
alter table public.perfiles
  drop constraint perfiles_user_id_fkey,
  add constraint perfiles_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
