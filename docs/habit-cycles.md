# Periodos y retos personales — 3.10.0

## Instalación

Si ya instalaste los ciclos de 3.9.0, basta ejecutar [supabase_habit_abstinence_activation.sql](../supabase_habit_abstinence_activation.sql) para habilitar «NO LO HICE» desde la activación, sin reiniciar periodos.

El frontend y la base de datos se actualizan por separado. El despliegue estático de GitHub/Vercel no ejecuta migraciones SQL.

1. En el proyecto Supabase de Habify, abre **SQL Editor**.
2. Si ya están instaladas las reglas de hábitos con progresión fija (versión 3), ejecuta el contenido completo de [`supabase_habit_cycles.sql`](../supabase_habit_cycles.sql).
3. Para una instalación nueva, ejecuta primero [`supabase_habit_progression.sql`](../supabase_habit_progression.sql), después [`supabase_habit_fixed_progression.sql`](../supabase_habit_fixed_progression.sql) y finalmente la migración de ciclos. Para instalaciones antiguas, completa primero la [migración de progresión](habits-progression-recovery.md).
4. Publica/recarga el frontend 3.10.0 y vuelve a iniciar sesión. Las tarjetas deben mostrar una cuenta regresiva. La respuesta autenticada de `habit_action('list')` debe indicar `rules_version: 5`.

La migración es transaccional y puede ejecutarse otra vez sin reiniciar los ciclos ya migrados. Conserva saldos e historial; los hábitos activos existentes reciben un periodo de gracia desde la instalación. Las recompensas anteriores mantienen sus bloqueos. No se penaliza el tiempo anterior a esta actualización.

Esta entrega se ha verificado con PostgreSQL local mediante PGlite y navegadores automatizados. No implica que el SQL ya se haya aplicado a Supabase.

## Periodos

Activar un hábito abre su primer periodo inmediatamente. Los hábitos positivos se pueden completar una vez en ese periodo. La hora de finalización queda fija: completar a otra hora no reinicia el reloj.

Por ejemplo, si activas un hábito diario a las 10:00, puedes completarlo durante ese primer periodo. Después de completarlo, el contador indica cuánto falta para las 10:00 del día siguiente.

| Frecuencia | Próxima renovación |
| --- | --- |
| Todos los días | Siguiente día, a la hora de activación |
| Lunes a viernes | Siguiente día laborable, a esa hora |
| Tres veces por semana | Siguiente lunes, miércoles o viernes, a esa hora |
| Dos veces por semana | Siguiente martes o jueves, a esa hora |
| Cada 7 días | Siete días después, a esa hora |

Los ciclos usan la zona horaria elegida al activar el hábito y mantienen la hora local al cambiar el horario estacional. El reloj del servidor decide los permisos; modificar la hora del dispositivo no adelanta las recompensas.

Cuando termina un periodo sin cumplir, aumenta el contador de omisiones y se reinicia la racha. Tras tres periodos consecutivos fallidos, se aplican **−15 monedas y −15 de vida**, con mínimo cero, y el hábito sale de la lista activa. El cobro ocurre una sola vez. La reconciliación se ejecuta al consultar o modificar hábitos, incluso al volver después de varios días.

Reactivar desde el catálogo conserva el historial. Dentro de un periodo todavía abierto conserva su horario, frecuencia y registros. Si el periodo terminó, se abre uno nuevo con la frecuencia y zona seleccionadas; los bloqueos de premios anteriores se conservan. Reiniciar progreso no reinicia el reloj ni borra las omisiones.

## Retos personales

La categoría se llama **Retos personales** y los títulos comienzan con **NO**.

- **NO LO HICE:** confirma que se evitó la conducta. Está disponible desde la activación hasta el cierre, una sola vez por periodo, y concede **+2 XP y +1 moneda**. No se permite si ya se registró algún tropiezo en el periodo.
- **SÍ LO HICE:** registra que se realizó la conducta que se busca evitar. Cada pulsación intencional descuenta **5 monedas y 5 de vida**, con mínimo cero. Puede registrarse varias veces durante el periodo.
- Si se registra un tropiezo después de «NO LO HICE», se aplica la penalización normal y el periodo deja de contar como cumplido. El premio pequeño ya recibido permanece, pero no puede cobrarse otra vez. Las tres omisiones consecutivas también se aplican a estos retos.
- Un reintento de red usa el mismo identificador y no repite premios ni cobros. El servidor protege además los registros duplicados del catálogo y las reactivaciones.

**Inicio** contiene los botones. **Hábitos** permite revisar metas, cuenta regresiva, omisiones, rachas, historial y opciones. El historial muestra premios, tropiezos acumulados por periodo y penalizaciones por desactivación.

## Comprobaciones locales

```sh
node --test --test-concurrency=1 tests/*.test.cjs
node node_modules/@playwright/test/cli.js test tests/browser/habits-progress.spec.cjs
```

Las pruebas cubren límites exactos de ciclos y de la activación, frecuencias y horario estacional, premios y progresión, tres omisiones, reactivación, reintentos, aislamiento entre cuentas, permisos y migración sin cargos retroactivos. Las pruebas de navegador usan una base local; no escriben en las cuentas reales de Supabase.
