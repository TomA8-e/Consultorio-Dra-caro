# Configuración inicial de Supabase

## 1. Crear el esquema

1. Abrir el proyecto en Supabase.
2. Entrar en **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar todo el contenido de `migrations/20260722190000_initial_schema.sql`.
5. Presionar **Run** una sola vez.

El script crea las tablas, relaciones, índices, auditoría y políticas RLS.

## 2. Crear la primera profesional

1. Entrar en **Authentication > Users**.
2. Crear la cuenta de la doctora mediante **Add user**.
3. Abrir `bootstrap-first-user.sql`.
4. Reemplazar `REEMPLAZAR_CON_EMAIL_DE_LA_DOCTORA` por el correo de esa cuenta.
5. Ejecutar el archivo desde SQL Editor.

Las cuentas nuevas quedan con rol `pending` hasta que un administrador las
aprueba. Esto evita que una cuenta recién creada pueda acceder a información
del consultorio.

## Importante

- No ejecutar el archivo de migración inicial más de una vez.
- No utilizar pacientes reales durante el desarrollo.
- No colocar claves `secret` o `service_role` en el navegador ni en variables
  que comiencen con `NEXT_PUBLIC_`.
