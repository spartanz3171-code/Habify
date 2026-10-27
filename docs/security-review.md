# Revisión de seguridad · 12 de octubre de 2026

## Correcciones locales del 26 de octubre (3.11.0)

Se completaron las correcciones de compras, limpieza de cuentas y resultados de batalla pendientes de la revisión posterior. **No se ejecutó SQL en Supabase, no se utilizaron cuentas reales y no se publicó el proyecto.** La validación se hizo con PostgreSQL local en memoria, sesiones simuladas y pruebas de navegador.

- `purchase_shop_item` obtiene el precio del catálogo, bloquea la fila del avatar y guarda artículo y descuento en una sola transacción. Un fallo revierte ambos; una compra repetida devuelve la propiedad existente.
- La nueva protección impide escrituras directas de saldo, experiencia, nivel, salud, inventario e historial, incluso desde el panel de un administrador autenticado. Las operaciones autorizadas de hábitos, compras y apariencia siguen funcionando. La administración confiable de la base conserva sus permisos.
- La API de combate comprueba la sesión con Supabase Auth. Sólo sus funciones privadas pueden abrir y liquidar una partida para esa cuenta. La clave `service_role` nunca llega al navegador.
- El servidor captura avatar, inventario y catálogo; calcula el rival, reproduce movimiento, ataques y cambios de tamaño con el mismo motor y determina el resultado. El cliente no proporciona estadísticas ni premios. La liquidación es atómica y el identificador de partida evita pagos duplicados.
- Al salir o cambiar de cuenta se limpia el estado privado. Las respuestas tardías no pueden abrir la cuenta anterior, aplicar su saldo ni registrar una batalla en la cuenta nueva.

## Activación manual de 3.11.0

1. Trabaja primero sobre una copia de prueba y conserva un respaldo. La base debe tener los esquemas existentes de avatar, tienda, inventario, monstruos e historial, además del guardarropa, el endurecimiento de seguridad y los ciclos de hábitos v5. No vuelvas a ejecutar todas las migraciones antiguas indiscriminadamente. Para actualizar una instalación de ciclos v4 usa [supabase_habit_abstinence_activation.sql](../supabase_habit_abstinence_activation.sql).
2. En el SQL Editor ejecuta el contenido completo de [supabase_economy_security.sql](../supabase_economy_security.sql), después de [supabase_security_hardening.sql](../supabase_security_hardening.sql). Es repetible y no reinicia saldos, ciclos ni historial. Añade `avatars.economy_version`, las protecciones y la tabla `verified_battles`.
3. Configura **sólo en el entorno privado del servidor** `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Deben corresponder al mismo proyecto usado por el cliente. No pongas la clave privada en JavaScript público, en variables con prefijos públicos, en capturas, en el chat ni en el repositorio. Introdúcela directamente en el panel de variables de Vercel o en el entorno local privado.
4. Cuando autorices la publicación, despliega la carpeta completa de la aplicación con [vercel.json](../vercel.json). Debe incluir [api/combat.js](../api/combat.js), [server/combat.cjs](../server/combat.cjs) y [js/engine.js](../js/engine.js). Usa Node.js 22 o posterior. La configuración empaqueta el motor para la función; no es una publicación únicamente estática. No publiques un cliente viejo después de cerrar las escrituras de economía.
5. En desarrollo, `npm run dev` expone la misma API. Sin esas variables responde 503; no inventa premios ni conecta con credenciales alternativas. Para las pruebas locales basta `npm install`: no necesitan claves privadas ni ejecutan SQL remoto.
6. En la copia de prueba, verifica una compra, su reintento, un hábito, un cosmético, victoria, derrota y retirada. Comprueba desde otra cuenta que no se mezclen inventarios ni historiales. Actualiza la PWA para cargar la caché 3.11.0. Antes de cada despliegue termina las partidas abiertas, porque una versión diferente del motor no debe validar un replay antiguo.

**Orden de publicación:** coordina SQL y función/cliente en una ventana de mantenimiento. El cliente nuevo bloquea compras y combate si falta su backend; el cliente viejo no puede seguir escribiendo saldos tras aplicar este SQL. Publicar en GitHub o Vercel no ejecuta la migración.

### Reglas operativas y límites

- Una partida admite hasta 10 minutos de simulación y vence a los 20 minutos de su creación, contando pausas. El servidor comprueba el tiempo transcurrido, un máximo de 20 000 eventos, 120 cambios de tamaño y un cuerpo de 2 MiB. La reproducción tiene un límite de CPU de 2 segundos.
- Reabrir una partida pendiente conserva la instantánea original; cambiar equipo o nivel fuera de ella no modifica sus estadísticas. Los cambios se usan en la siguiente partida. El tipo de rival elegido se valida contra el catálogo; su nivel exacto se calcula en el servidor.
- **Reintentar guardado** vuelve a enviar el mismo identificador. Si ya se liquidó, devuelve el resultado sin repetir premios ni penalizaciones. Un replay inválido, vencido o de una versión anterior no gana recompensas; recarga para sincronizar la cuenta y abandonar ese intento local. Los replays pendientes están en memoria y no sobreviven a una recarga.
- La reproducción valida reglas, no demuestra que una persona haya pulsado los botones: no es protección contra bots ni verificación de hábitos del mundo real. Tampoco convierte el PvE en multijugador.
- Antes de abrir el servicio públicamente, configura límites de solicitudes y monitorización en el proveedor, y define retención de `verified_battles`. No se configuraron servicios externos, cuotas ni borrados automáticos.
- La base remota puede tener funciones o permisos que no estén en estos archivos. Deben auditarse antes de afirmar que toda la economía remota está protegida. Estas pruebas no sustituyen un ensayo en un teléfono físico ni la revisión de la base desplegada.

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

- La instalación anterior mantiene las limitaciones de economía calculada en cliente hasta activar el SQL y el servicio de 3.11.0 descritos arriba. RLS por sí solo no verifica las victorias ni protege los premios. La corrección local no demuestra qué reglas tiene hoy la base remota.
- No se auditaron registros históricos ni todas las funciones o tablas que puedan existir sólo en el proyecto remoto. Tampoco se puede determinar con este código qué hizo el amigo en aquella sesión.
- Los SQL preparados no se ejecutan al publicar en Vercel. Hasta ejecutarlos, la base mantiene sus reglas actuales. El frontend bloquea cada flujo si falta su comprobación o función de servidor.

Referencia: [RLS y permisos de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security). Las políticas y los permisos son las barreras del servidor; esconder un botón no lo es.
