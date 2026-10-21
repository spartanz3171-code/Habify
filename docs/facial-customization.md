# Rostro personalizado — 3.10.0

En **Personaje → Rostro personalizado** puedes elegir, sin gastar monedas:

| Rasgo | Opciones |
| --- | --- |
| Ojos | Clásicos, redondos, almendrados e intensos |
| Cejas | Clásicas, suaves, arqueadas y marcadas |
| Nariz | Clásica, pequeña, recta y ancha |
| Boca | Clásica, sonrisa, sonrisa amplia y seria |
| Color de ojos | Color de clase, azul, verde, miel, café, violeta o gris |

La vista ampliada muestra el rostro sin casco para facilitar la comparación. Tu equipo real se conserva. Las elecciones son un borrador hasta pulsar **Guardar apariencia**; **Deshacer** recupera la apariencia guardada.

Los avatares anteriores conservan sus rasgos clásicos y el color de ojos de su clase. Las variantes funcionan en ambas presentaciones del personaje y en las cuatro clases. La barba puede cubrir parte de la cara; puedes elegir **Sin barba** para verla completa.

## Guardado en la cuenta

Si el guardarropa ya está instalado, ejecuta [supabase_facial_features.sql](../supabase_facial_features.sql) en el SQL Editor de tu proyecto Supabase. La migración conserva apariencias, saldos e inventario, acepta únicamente los valores permitidos y mantiene la comprobación de propiedad de prendas. Los clientes antiguos que omitan los nuevos campos no borran tus elecciones.

Para una instalación nueva, [supabase_customization.sql](../supabase_customization.sql) ya incluye estos campos. Los parches de barba y casco también conservan los rasgos si se vuelven a ejecutar.

Mientras un servidor antiguo omita estos campos, la app guarda las elecciones libres en el dispositivo y muestra que falta sincronizarlas. Después de aplicar el SQL, pulsa **Guardar apariencia** para llevarlas a tu cuenta. Un error de permisos o una confirmación incompatible no se presenta como un guardado correcto.

## Cambio de los retos personales

Si ya instalaste los ciclos de 3.9.0, ejecuta además [supabase_habit_abstinence_activation.sql](../supabase_habit_abstinence_activation.sql). Cambia la disponibilidad de **NO LO HICE** a la activación, mantiene un premio por periodo y no reinicia los relojes ni los registros. La respuesta de hábitos pasa a rules_version: 5.

La instalación nueva de [supabase_habit_cycles.sql](../supabase_habit_cycles.sql) ya incluye esta regla. Los hábitos positivos y los registros de tropiezo siguen disponibles con reglas v4; la nueva opción de abstinencia explica si falta actualizar el servidor.
