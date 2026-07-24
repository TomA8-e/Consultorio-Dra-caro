-- Gestión segura de accesos para el rol administrador.
-- La baja es lógica para preservar trazabilidad clínica.

begin;

create or replace function public.list_staff_as_administrator()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_current_user boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() <> 'administrator' then
    raise exception 'administrator_role_required';
  end if;

  return query
  select
    profile.id,
    auth_user.email::text,
    profile.full_name,
    profile.role::text,
    profile.active,
    profile.created_at,
    auth_user.last_sign_in_at,
    profile.id = auth.uid()
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  order by profile.created_at asc;
end;
$$;

create or replace function public.update_staff_as_administrator(
  staff_uuid uuid,
  new_full_name text,
  new_role public.app_role,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_role public.app_role;
  existing_active boolean;
begin
  if public.current_user_role() <> 'administrator' then
    raise exception 'administrator_role_required';
  end if;

  if nullif(trim(new_full_name), '') is null then
    raise exception 'full_name_required';
  end if;

  select profile.role, profile.active
    into existing_role, existing_active
  from public.profiles as profile
  where profile.id = staff_uuid
  for update;

  if not found then
    raise exception 'staff_not_found';
  end if;

  if staff_uuid = auth.uid()
    and (new_role <> 'administrator' or new_active = false) then
    raise exception 'cannot_remove_own_administrator_access';
  end if;

  if existing_role = 'administrator'
    and existing_active = true
    and (new_role <> 'administrator' or new_active = false)
    and (
      select count(*)
      from public.profiles
      where role = 'administrator' and active = true
    ) <= 1 then
    raise exception 'last_administrator_required';
  end if;

  update public.profiles
  set
    full_name = trim(new_full_name),
    role = new_role,
    active = new_active,
    updated_at = now()
  where id = staff_uuid;
end;
$$;

revoke all on function public.list_staff_as_administrator() from public;
revoke all on function public.update_staff_as_administrator(uuid, text, public.app_role, boolean) from public;

grant execute on function public.list_staff_as_administrator() to authenticated;
grant execute on function public.update_staff_as_administrator(uuid, text, public.app_role, boolean) to authenticated;

comment on function public.list_staff_as_administrator() is
  'Lista cuentas y correos únicamente para administradores activos.';
comment on function public.update_staff_as_administrator(uuid, text, public.app_role, boolean) is
  'Permite a administradores editar rol, nombre y estado sin eliminar trazabilidad.';

commit;
