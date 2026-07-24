# Supabase

## Migraciones

Aplicar en orden los archivos de `migrations`:

1. `20260722190000_initial_schema.sql`
2. `20260723123000_appointment_editing_and_overlap.sql`
3. `20260723180000_secretary_role_boundaries.sql`
4. `20260723193000_fixed_appointment_duration.sql`
5. `20260724190000_admin_patient_deletion.sql`
6. `20260724220000_administrator_staff_management.sql`

No volver a ejecutar la migración inicial sobre una base ya configurada.

## Alta de usuarios

1. Crear el usuario desde **Authentication > Users**.
2. Confirmar que se creó una fila asociada en `public.profiles`.
3. Asignar `full_name`, `role` y `active = true` desde SQL Editor.

Ejemplo:

```sql
update public.profiles as profile
set
  full_name = 'Nombre visible',
  role = 'professional',
  active = true
from auth.users as auth_user
where profile.id = auth_user.id
  and auth_user.email = 'correo@ejemplo.com';
```

Las cuentas nuevas quedan con rol `pending` hasta ser aprobadas.

## Roles disponibles

- `administrator`
- `professional`
- `secretary`
- `pending`

## Recuperación

- Para correos reales, configurar el dominio público y autorizar
  `https://DOMINIO/actualizar-clave` en **Authentication > URL Configuration**.
- La aplicación solicita el enlace desde `/recuperar-clave` y completa el
  cambio en `/actualizar-clave`.
- Para correos ficticios, una persona con acceso administrativo a Supabase debe
  establecer una nueva contraseña desde **Authentication > Users**.
- Nunca guardar contraseñas ni claves `service_role` en este repositorio.

## Controles antes de usar datos reales

- Revisar Security Advisor.
- Confirmar RLS en todas las tablas públicas.
- Probar con cada rol que los accesos clínicos estén bloqueados para Secretaría.
- Confirmar que sólo Administración puede eliminar pacientes sin información
  clínica; si existe historia clínica, la eliminación debe quedar bloqueada.
- Configurar y ensayar copias de seguridad.
