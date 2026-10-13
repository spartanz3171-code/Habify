# Revisión de seguridad · 12 de octubre de 2026

## Resultado y alcance

Había un acceso de administrador falso en el cliente: un nombre que contuviera `admin` y una contraseña de cuatro caracteres, o un botón de desarrollo, activaban el panel sin autenticar. Además, el cliente consideraba administrador a un correo que contuviera `admin` o a metadatos editables. Estos caminos se eliminaron. Eso es un fallo de autorización; no demuestra que se haya ejecutado una inyección SQL.

El panel antiguo también mostraba usuarios ficticios cuando fallaba la consulta y actualizaba su pantalla aunque Supabase rechazara una escritura. Ahora exige confirmación del servidor y muestra un error ante un rechazo. Los nombres y otros textos del panel se escapan al generar HTML.

La revisión combinó el código local, pruebas SQL en PostgreSQL local y solicitudes públicas limitadas al proyecto. **No hubo acceso al SQL Editor, a registros de auditoría ni a sesiones reales autenticadas. No es una certificación de la base remota.** No se cambió ningún dato remoto ni se intentó explotar cuentas.

La clave del navegador tiene rol `anon`, no `service_role`. La API no encontró `save_avatar_appearance` (`PGRST202`) ni el catálogo del guardarropa. Esto explica el guardado local. Las comprobaciones anónimas limitadas no devolvieron registros de avatares o inventario; eso no comprueba el aislamiento entre dos usuarios autenticados.

## Aplicar las correcciones en Supabase

1. Ejecuta la versión actual de [`supabase_customization.sql`](../supabase_customization.sql) para habilitar el guardarropa completo, incluidas las barbas. Si el endpoint de apariencia no existe, el parche de barbas por sí solo no lo crea.
2. Ejecuta [`supabase_security_hardening.sql`](../supabase_security_hardening.sql) después de las migraciones existentes. Actualiza permisos y políticas sin borrar filas ni modificar saldos ni conceder administradores. Puede repetirse. El archivo antiguo `supabase_admin_schema.sql` ahora contiene el mismo endurecimiento para no reinstalar las políticas recursivas anteriores.
3. Ejecuta [`supabase_security_audit.sql`](../supabase_security_audit.sql), que sólo consulta las políticas, permisos, funciones y cantidad de administradores. Revisa también los avisos de seguridad del panel de Supabase.
4. Recarga Habify y vuelve a guardar la apariencia. Debe indicar **Apariencia guardada en tu cuenta**.

El nuevo panel consulta `habify_is_admin()`, que usa la sesión de Supabase y la bandera protegida `avatars.is_admin`. Sin la función o sin permisos, el acceso se deniega. Cambiar JavaScript en el navegador no cambia las políticas del servidor.

El parche establece límites de acceso por cuenta para avatares, hábitos, inventario e historial de batallas; sólo permite a administradores modificar tienda, monstruos y configuración global. Protege la identidad y la bandera de administrador. Una política antigua permisiva no amplía esos límites restrictivos. Las escrituras normales de hábitos siguen pasando por sus funciones autorizadas.

## Revisar quién es administrador

En el SQL Editor, revisa los administradores existentes. El parche no puede decidir por ti cuáles son legítimos:

```sql
SELECT a.user_id, u.email
FROM public.avatars a JOIN auth.users u ON u.id = a.user_id
WHERE a.is_admin IS TRUE;
```

Para autorizar exclusivamente una cuenta conocida, usa su UUID real (tomado de Authentication → Users), nunca un nombre ni los metadatos que pueda editar el usuario:

```sql
UPDATE public.avatars SET is_admin = true
WHERE user_id = 'UUID-DE-TU-CUENTA';
```

Para retirar un permiso que no corresponda, usa la misma consulta con `false` y el UUID concreto. Esta gestión sólo se hace desde la administración confiable de la base. Luego inicia sesión normalmente en Habify; **⚙ → Administración** aparecerá para la cuenta autorizada.

## Limitaciones que siguen pendientes

- El combate, compras de la tienda anterior y parte del saldo/inventario todavía dependen de datos calculados por el cliente. Un usuario técnico podría intentar alterar **sus propios** premios o artículos con peticiones directas. RLS aísla cuentas, pero no verifica que haya ganado una batalla. Antes de tratar la economía como resistente a trampas hay que llevar esas operaciones a funciones de servidor, validar compras/equipo y retirar las escrituras directas de saldo e inventario. No se retiraron esos permisos sin sustituir los flujos, porque rompería el juego actual.
- No se auditaron registros históricos ni todas las funciones o tablas que puedan existir sólo en el proyecto remoto. Tampoco se puede determinar con este código qué hizo el amigo en aquella sesión.
- Los dos SQL preparados no se ejecutan al publicar en Vercel. Hasta ejecutarlos, la base mantiene sus reglas actuales. El frontend actualizado bloquea el panel si falta su comprobación de permisos.

Referencia: [RLS y permisos de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). Las políticas y los permisos son las barreras del servidor; esconder un botón no lo es.
