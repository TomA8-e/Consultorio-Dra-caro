-- Ejecutar DESPUÉS de crear la primera cuenta desde Authentication > Users.
-- Reemplazar el correo de ejemplo antes de ejecutar.

update public.profiles as profile
set
  full_name = 'Dra. Adriana',
  role = 'professional',
  active = true
from auth.users as auth_user
where profile.id = auth_user.id
  and auth_user.email = 'adrianacaro38@yahoo.com.ar';

-- Verificación: debe devolver exactamente una fila con role = professional.
select
  auth_user.email,
  profile.full_name,
  profile.role,
  profile.active
from public.profiles as profile
join auth.users as auth_user on auth_user.id = profile.id
where auth_user.email = 'adrianacaro38@yahoo.com.ar';
