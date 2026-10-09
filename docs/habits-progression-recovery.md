# Hábitos, progresión y recuperación de contraseña

## Análisis del comportamiento anterior

Habify conserva su frontend de HTML/CSS/JavaScript, Supabase Auth y las tablas `avatars`, `habits`, tienda y guardarropa. El motor, los personajes y el combate se mantienen.

- `App.confirmReset()` preguntaba «BORRAR TODOS LOS DATOS?» pero sólo ejecutaba `location.reload()`. No restablecía la cuenta ni borraba hábitos. El botón ahora dice **Recargar aplicación** y explica que los datos guardados se conservan.
- El botón X eliminaba físicamente un hábito, sin confirmación, y bloqueaba las eliminaciones durante 24 horas. La interfaz podía anunciar éxito aunque el motor rechazara la acción.
- Los hábitos guardaban `completed_at`, frecuencia, precio y penalización. No existían historial de actividades, rachas guardadas ni niveles de dificultad. Los intervalos eran móviles: 24, 48, 72 horas o siete días.
- XP y oro se sumaban en el navegador y se guardaban separados de la marca del hábito. El nivel del personaje daba +25 G y hasta +20 HP; esa recompensa se conserva.

## Activación en Supabase

1. Publica los archivos actualizados y abre **SQL Editor** del proyecto.
2. Ejecuta completo [`supabase_habit_progression.sql`](../supabase_habit_progression.sql). Es una migración adicional y transaccional; se puede repetir sin borrar registros ni volver a conceder recompensas.
3. Recarga las aplicaciones abiertas. Los hábitos pasarán a usar las operaciones `habit_action` del servidor. Antes de la migración, la interfaz y el motor anteriores siguen disponibles; las opciones nuevas se habilitan cuando el servidor está listo.

La migración agrega columnas, catálogo, historial y eventos. Revoca las escrituras directas a `habits` de clientes normales: ahora pasan por operaciones que comprueban el propietario. Un cliente antiguo debe recargar para registrar hábitos después de activar la migración. La configuración original no se elimina; las filas retiradas se archivan para conservar estadísticas e identidad.

Añadir misiones al catálogo requiere `avatars.is_admin=true` asignado desde la administración de la base. El servidor impide cambiar ese indicador desde una sesión de usuario; un correo que contenga «admin» o metadatos editables no conceden permiso para escribir el catálogo.

No se ha ejecutado esta migración en el proyecto remoto desde el entorno de desarrollo. La validación local usa PostgreSQL mediante PGlite y el esquema base que refleja los campos usados por la app; no sustituye comprobar las políticas y disparadores específicos del proyecto alojado.

## Reiniciar, eliminar e historial

- **Reiniciar progreso:** dificultad inicial, contador de ascenso y racha actual a cero; conserva configuración, historial, mejor racha, saldo y recompensas. La marca del período actual sigue cerrada si ya cobró. Las bonificaciones ya ganadas no vuelven a pagarse.
- **Eliminar hábito:** retira únicamente ese hábito de la lista activa, conservando su archivo y actividades. No cambia otros hábitos. Al activarlo otra vez desde el catálogo se recupera la misma identidad, frecuencia, objetivos y dificultad; su racha actual vuelve a empezar. No se puede borrar y recrear para cobrar dos veces.
- **Historial:** muestra las últimas 50 actividades, con fecha, objetivo, cantidad y XP/oro obtenidos, incluidas las bonificaciones. La dificultad y cada componente de la recompensa también quedan guardados en la base. El historial general incluye hábitos eliminados.

De los hábitos anteriores sólo puede recuperarse la última marca conocida. Se guarda como `legacy`, sin volver a sumar recompensas. No se inventan registros o mejores rachas anteriores que la aplicación nunca almacenó. Las recompensas ya acumuladas en el personaje se conservan.

## Progresión y calendario

En el catálogo, la progresión por cantidades es opcional. Tiene objetivo inicial/máximo, incremento, unidad y cumplimientos necesarios (7 por defecto). Hay propuestas para sueño, lectura, cardio, meditación y programación/estudio. Los hábitos binarios siguen sin niveles. Un hábito binario ya existente puede usar **Añadir niveles**, sin reabrir períodos premiados.

Los parámetros quedan fijados al activar la progresión: no hay una edición posterior que permita bajar la meta a mitad de un período. Reiniciar vuelve a esos parámetros iniciales. Se permiten entre 2 y 90 cumplimientos por nivel y hasta 20 niveles.

| Frecuencia | Períodos |
| --- | --- |
| Diaria | Cada fecha local |
| Laboral | Lunes a viernes |
| Tres veces por semana | Lunes, miércoles y viernes |
| Dos veces por semana | Martes y jueves |
| Semanal | Una marca por semana, de lunes a domingo |

Cada hábito guarda una zona horaria IANA al activarse. Viajar o cambiar el reloj del celular no cambia su calendario; la fecha que decide el pago proviene del servidor. Los hábitos anteriores adoptan `America/Mexico_City` y conservan su último intervalo pendiente para evitar un pago adicional durante la transición. No se aplican penalizaciones retroactivas a períodos anteriores a la migración.

Completar los períodos programados consecutivos aumenta el contador de ascenso. Los descansos no lo interrumpen. Registrar una cantidad insuficiente o dejar pasar un período lo reinicia, sin bajar la dificultad ni la mejor racha. Una cantidad insuficiente puede corregirse dentro del mismo período; el primer cumplimiento válido cierra sus recompensas. En el nivel máximo siguen los pagos normales. Se conservan las penalizaciones de hábitos positivos omitidos, ahora una vez por período vencido, y la recuperación del personaje al completar un hábito.

## Economía y sincronización

Para progresión cuantitativa, XP diaria = `10 + 5 × (nivel − 1)`; oro diario = la mitad de esa XP, redondeada hacia abajo. Al ascender desde el nivel N: `25 + 15 × (N − 1)` XP y `10 × N` G. Esto mantiene un inicio moderado frente a las misiones anteriores (15–35 XP) y la tienda.

| Nivel | XP / oro por cumplimiento | Bonificación al siguiente nivel |
| --- | --- | --- |
| 1 | 10 / 5 | 25 XP / 10 G |
| 2 | 15 / 7 | 40 XP / 20 G |
| 3 | 20 / 10 | 55 XP / 30 G |
| 4 | 25 / 12 | Sólo si todavía existe otro objetivo |

Los hábitos sin niveles conservan sus recompensas. Se paga según la dificultad anterior al ascenso, y éste cambia la meta para el siguiente cumplimiento. Historial, rachas, ascenso y saldo se guardan en la misma transacción, con bloqueo del avatar y unicidad de hábito/período. Una respuesta perdida se puede reintentar sin repetir el pago. Se registra también el oro extra obtenido por subir el nivel del personaje.

Los guardados normales del avatar comparan el saldo anterior para no sobrescribir premios obtenidos desde otro dispositivo. Si encuentran un cambio simultáneo, refrescan el saldo y piden repetir la acción. La tienda y el combate existentes siguen siendo sistemas separados; esta migración no los convierte en un servidor de juego con validación de todas sus reglas.

## Restablecer contraseña

1. En inicio de sesión elige **¿Olvidaste tu contraseña?** e introduce un correo propio.
2. Habify solicita el correo con `supabase.auth.resetPasswordForEmail()`, muestra una confirmación genérica y limita los reenvíos locales; Supabase aplica los límites reales del proyecto.
3. Abre el enlace nuevo. El evento verificado `PASSWORD_RECOVERY` abre el formulario, sin entrar al juego. Una URL escrita a mano o una sesión normal guardada no habilitan ese formulario.
4. Introduce y repite la nueva contraseña. Se exige el mínimo actual de la app (6 caracteres); Supabase valida además la política configurada. El cambio usa `auth.updateUser({password})` con la sesión autorizada.
5. Al terminar se cierra la sesión y se pide iniciar sesión con la contraseña nueva. Prueba que la anterior ya no funciona y que un enlace vencido/usado pide otro. Si recargas y se pierde el contexto de recuperación, solicita un enlace nuevo.

Se reutilizan el SMTP y la URL pública ya configurados. **Site URL** y **Redirect URLs** deben permitir `https://habify-ten.vercel.app/`; no hace falta otra variable de entorno. En **Email Templates → Reset password** conserva `{{ .ConfirmationURL }}`. Se incluye [una plantilla opcional](../supabase/templates/reset-password.html). Las cuentas que usan exclusivamente un proveedor externo deben recuperar acceso con ese proveedor.

No se escriben contraseñas ni enlaces de recuperación en registros; los fragmentos del enlace se limpian después de que el SDK los procesa y la página usa `no-referrer`.

Referencias: [recuperación oficial](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [actualización de contraseña](https://supabase.com/docs/reference/javascript/auth-updateuser), [eventos de autenticación](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

## Archivos y pruebas

- `js/habits.js`: interfaz, cantidades, configuración, historial y llamadas al servidor.
- `supabase_habit_progression.sql`: migración, calendario, transacciones y permisos.
- `js/recovery.js`: solicitud, autorización y actualización de contraseña.
- `js/app.js`, `js/data.js`, `js/engine.js`, `js/views.js`, `js/i18n.js`: integración con la arquitectura existente.
- `js/wardrobe.js`, `js/atelier.js`: coordinación con las escrituras del avatar.
- `css/polish.css`, `index.html`, `sw.js`: interfaz adaptable y recursos de la versión 3.5.0.
- `tests/habit-progression.test.cjs`, `tests/avatar-sync.test.cjs`, `tests/combat.test.cjs`, `tests/helpers/habit-db.cjs`, `tests/browser/habits-progress.spec.cjs`, `tests/browser/auth.spec.cjs`: pruebas de persistencia, autorización, concurrencia, calendarios y flujos de interfaz.
- `package.json` y `package-lock.json`: PGlite sólo como dependencia de desarrollo para comprobar SQL real localmente.

Ejecuta `npm test` y `npm run test:browser`. El proyecto sirve archivos estáticos y no tiene linter ni proceso de compilación configurados. Las pruebas de autenticación simulan Supabase y no envían correos. La entrega SMTP, la contraseña real y los enlaces usados/vencidos en el servicio alojado requieren la prueba manual anterior con un correo del propietario. La concurrencia local comprueba transacciones, unicidad y reintentos; no es una prueba de carga con varias conexiones de producción.
