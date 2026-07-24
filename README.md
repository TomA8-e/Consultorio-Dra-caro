# Consultorio Dra. Adriana Caro

Aplicación privada para administrar pacientes, agenda e historias clínicas.

## Requisitos

- Node.js 22.13 o superior.
- Un proyecto de Supabase con las migraciones de `supabase/migrations` aplicadas.
- Variables de entorno configuradas según `.env.example`.

## Desarrollo local

```bash
npm install
npm run dev
```

## Validación

Antes de publicar cambios:

```bash
npm run lint
npm run build
```

## Roles

- `administrator`: acceso completo y administración operativa.
- `professional`: agenda, pacientes e historias clínicas.
- `secretary`: agenda y datos administrativos; no puede acceder a información clínica.

Las autorizaciones se aplican tanto en la interfaz como en las políticas y
triggers de Supabase.

## Producción

1. Configurar `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en el proveedor de hosting.
2. Utilizar HTTPS y un dominio controlado por el consultorio.
3. Mantener activado RLS y revisar Security Advisor después de cada migración.
4. Configurar copias de seguridad y probar su restauración.
5. No guardar contraseñas, claves privadas ni datos de pacientes en Git.

## Recuperación de cuentas

Las cuentas con correo real pueden usar el flujo de recuperación de Supabase
desde **Olvidé mi contraseña** en la pantalla de acceso. Los enlaces de
invitación y recuperación terminan en `/actualizar-clave`, donde se solicita
una contraseña nueva de al menos 12 caracteres.

La URL pública completa de `/actualizar-clave` debe estar incluida en las
Redirect URLs de Supabase. Las cuentas con correo ficticio sólo pueden recuperar
el acceso mediante un cambio de contraseña realizado por una persona
administradora desde Supabase.

La cuenta compartida de Secretaría no permite atribuir una acción a una de las
dos secretarias; la auditoría identifica únicamente a la cuenta compartida.
