# Habify

Hábitos personales convertidos en una aventura RPG. HTML, CSS y JavaScript, con cuentas y datos en Supabase. La interfaz se sirve en Vercel y una función Node.js verifica los combates.

## Actualización 3.11.0 (preparada en local)

- Las compras de equipo cobran y entregan el artículo en una transacción de servidor. Los reintentos no vuelven a cobrar.
- Cambiar de cuenta limpia avatar, inventario, historial y partidas. Una carga fallida no abre la cuenta con datos anteriores; se descartan respuestas de sesiones antiguas.
- La arena solicita una partida al servidor. Al terminar, el servidor reproduce sus entradas con el mismo motor, valida equipo y resultado, y registra premios e historial una sola vez. No acepta oro, XP ni victorias calculadas por el navegador.
- El equipo queda fijo durante cada partida. Un guardado sin confirmar muestra **Pendiente** y permite reintentar sin duplicar recompensas.
- **Requiere activación manual:** [supabase_economy_security.sql](supabase_economy_security.sql) y la función [api/combat.js](api/combat.js), con variables privadas de servidor. Lee el [orden de instalación y los límites](docs/security-review.md#activación-manual-de-3110) antes de publicar. No basta con subir los archivos estáticos.
- No se ejecutó SQL remoto ni se desplegó este cambio. Mientras falte la función de compra o la API de combate, esos flujos muestran un error sin fingir un guardado.

## Actualización 3.10.0

- Contador compacto con icono de reloj, duración y fecha de renovación.
- **NO LO HICE** está disponible desde la activación, una vez por periodo y sin tropiezos registrados. Requiere ejecutar [supabase_habit_abstinence_activation.sql](supabase_habit_abstinence_activation.sql) sobre la migración de ciclos ya instalada; conserva los relojes, saldos e historial. La instalación nueva de [supabase_habit_cycles.sql](supabase_habit_cycles.sql) ya incluye esta regla. Los hábitos positivos siguen funcionando en servidores v4.
- **Personaje → Rostro personalizado** incorpora formas de ojos, cejas, nariz y boca, color de ojos y una vista ampliada sin casco. Los cambios son gratuitos. Ejecuta [supabase_facial_features.sql](supabase_facial_features.sql) para guardarlos en la cuenta. Antes de instalarlo, la app puede conservarlos en este dispositivo y lo indica explícitamente. [Guía de personalización facial](docs/facial-customization.md).
- Más detalle en materiales del avatar y los cinco monstruos, e iris, escamas, pelaje y plumas de las cuatro mascotas. Se conservan las animaciones, el equipo y las mecánicas.
- Caché web/PWA actualizada a 3.10.0. Subir a GitHub no ejecuta las dos migraciones de Supabase.

## Actualización 3.9.0

- Cada hábito inicia su periodo al activarlo. Se puede completar una vez dentro del periodo; la cuenta regresiva conserva la hora de renovación aunque se complete antes.
- Tras tres periodos consecutivos sin cumplir, se descuentan 15 monedas y 15 de vida, sin bajar de cero, y el hábito se desactiva. Se conserva su historial y puede reactivarse manualmente.
- **Retos personales** reemplaza «A evitar», con **NO** al inicio de los nombres. **NO LO HICE** concede +2 XP y +1 moneda, una vez durante las últimas dos horas y sin tropiezos registrados. **SÍ LO HICE** descuenta 5 monedas y 5 de vida por cada registro intencional. Los reintentos de conexión no cobran dos veces.
- Las acciones de cumplimiento están en **Inicio**. **Hábitos** muestra metas, periodos, configuración e historial.
- **Requiere ejecutar [`supabase_habit_cycles.sql`](supabase_habit_cycles.sql) en Supabase** después de las migraciones anteriores de hábitos. Subir a GitHub no aplica SQL. Los hábitos existentes reciben un periodo nuevo sin penalizaciones retroactivas. Mientras el servidor siga en la versión anterior, las acciones muestran mantenimiento.
- [Instalación, reglas y comprobaciones](docs/habit-cycles.md). Caché web/PWA: 3.9.0.

## Actualización 3.8.1

- La magia propia del mago es independiente de fuego y curación. Los hechizos comprados requieren estar en el inventario y equipados; al quitarlos dejan de aparecer y de responder al teclado. Fuego y curación conservan un uso por pelea y muestran **USADO**.
- El bastón dispara energía arcana y el arco lanza flechas con el ataque principal. El ataque fuerte carga un disparo más potente. Las espadas conservan sus golpes y combos.
- El fondo elegido vuelve a cubrir la tarjeta completa del personaje, con un panel translúcido detrás de oro, nivel y vida. Todos los hábitos tienen contorno verde, incluidos activos y completados.
- Caché actualizada a 3.8.1 para navegador y PWA. Sin migraciones SQL.

## Actualización 3.8.0

- La pelea bloquea el desplazamiento de la página. Barra de herramientas, vida, escenario y controles ocupan filas independientes; los cambios de tamaño del navegador no siguen los desplazamientos tardíos de Safari. El tamaño de los luchadores se adapta al espacio restante.
- Más detalle en prendas y armaduras del avatar, equipo propio para cada monstruo y slime de cristal. Los rivales ganan detalles de veterano (nivel 6), élite (15) y campeón (30).
- Rivales del mismo nivel o ligeramente superiores. Su resistencia y daño aumentan respecto al crecimiento del héroe; también suben su velocidad, frecuencia de ataque y defensa. Se conservan avisos de ataque y oportunidades para bloquear.
- Caché actualizada a 3.8.0 para navegador y PWA. Sin migraciones SQL.

## Actualización 3.7.1

- **Girar arena** permite jugar de lado cuando Safari u otro navegador conserva la ventana vertical. El giro se aplica sólo a la pelea y se retira al terminar, retirarse, volver o cerrar sesión, incluso mientras se guarda el resultado.
- El modo de combate usa el espacio visible del navegador, incluidos cambios de tamaño de sus barras. Se intenta recuperar orientación vertical donde la API lo permite; si el teléfono sigue físicamente horizontal y el navegador rechaza el giro, se indica que lo endereces.
- Controles con iconos vectoriales, golpe principal destacado, colores por acción y respuesta visual al mantenerlos pulsados.
- Los fondos de inicio se limitan al escenario del personaje. Sus pies y la mascota comparten la base; los datos conservan un panel legible. La cabecera respeta la zona del reloj del iPhone.
- Sin migraciones SQL. Verificación de interfaz con Chrome y WebKit; no sustituye una prueba en un iPhone físico.

## Actualización 3.7.0

- Arena horizontal en dispositivos táctiles, con aviso **Gira tu celular**, pausa sin daño, controles a los lados y navegación oculta durante la pelea. **Continuar** reanuda después de girar; **Volver** conserva la pelea y **Retirarse** la termina.
- Pantalla completa opcional y bloqueo de orientación cuando el navegador lo permite; se liberan al salir. Sin nuevas migraciones SQL.
- [Funcionamiento y propuesta para partidas entre usuarios](docs/battles-and-multiplayer.md). El combate actual es contra monstruos; se retiró el prototipo que sustituía al segundo usuario por un bot.
- [Cómo preparar la versión para Google Play y App Store](docs/mobile-installation.md). La APK, el proyecto iOS y el servidor multijugador todavía no están creados.

## Actualización 3.6.2

- La tarjeta **Un paso pequeño cada día** se puede cerrar con la X; recuerda la preferencia por cuenta, con respaldo local.
- **⚙ → Sonido y vibración** permite activar efectos suaves, probarlos y desactivarlos por dispositivo. Comienzan apagados.
- Eliminado el acceso administrador de prueba. El panel exige la comprobación de Supabase; ya no acepta un nombre «admin», contraseñas inventadas ni metadatos editables. Ejecuta [`supabase_security_hardening.sql`](supabase_security_hardening.sql) para instalar las reglas del servidor. Lee la [revisión y sus límites](docs/security-review.md); la economía completa todavía requiere validación de servidor.
- Si el aviso de apariencia indica guardado sólo en este dispositivo y falta la función de guardarropa, ejecuta [`supabase_customization.sql`](supabase_customization.sql), que incluye barbas y cascos, y vuelve a guardar.
- [Instalar en el celular y preparar una futura APK](docs/mobile-installation.md). Los iconos del manifiesto tienen los tamaños correctos; esta entrega no genera una aplicación nativa.

## Desarrollo local

Desde esta carpeta, que contiene `index.html`:

```sh
npm install
npm run dev
```

Abre http://127.0.0.1:4173. La app usa el proyecto Supabase configurado en `js/data.js`; iniciar sesión requiere conexión. No hay paso de compilación. El servidor local también expone `/api/combat`, pero sólo funciona si configuras las variables privadas indicadas en la [guía de seguridad](docs/security-review.md#activación-manual-de-3110). Las pruebas usan cuentas y bases simuladas, sin necesidad de esas variables ni acceso remoto.

## Verificación por correo

Las cuentas nuevas deben abrir el enlace enviado por Supabase antes de entrar. La pantalla permite reenviar la verificación y explica los enlaces vencidos. El nombre, la clase y la apariencia elegidos se conservan aunque se confirme desde otro dispositivo.

**Configuración necesaria en Supabase:** activar **Confirm email**, configurar la URL pública de retorno y un servicio SMTP para enviar a correos externos al equipo. Subir el código a GitHub no modifica estos ajustes. Consulta [la guía de correo y la prueba de entrega real](docs/email-verification.md). `node tools/check-auth.cjs` comprueba la confirmación obligatoria y la URL de retorno sin crear cuentas ni enviar mensajes.

## Hábitos y recuperación de contraseña (3.5.3)

Las tarjetas muestran una acción principal, monedas y progreso con textos sencillos. Los hábitos con meta fija, como Dormir sin niveles, también tienen una barra de completado. **Personalizar mi meta** explica los cambios con un ejemplo que se actualiza al escribir; **Opciones e historial** reúne las acciones de administración. Estos ajustes de interfaz no necesitan SQL adicional si ya instalaste 3.5.2.

La actualización incorpora reinicio individual, eliminación con confirmación e historial, progresión por cantidades y recompensas atómicas. Ejecuta [`supabase_habit_progression.sql`](supabase_habit_progression.sql) en Supabase para activar estas funciones; los hábitos anteriores y sus saldos se conservan. Iniciar sesión también incluye **¿Olvidaste tu contraseña?**, usando el SMTP y la URL pública existentes.

Consulta la [guía de funcionamiento, migración y pruebas](docs/habits-progression-recovery.md). El catálogo nuevo requiere `avatars.is_admin` asignado desde la administración de la base para añadir misiones; la dirección de correo o los metadatos editables por el usuario no conceden ese permiso.

Si ya instalaste la versión 3.5.0 o 3.5.1, ejecuta sólo [`supabase_habit_reward_guards.sql`](supabase_habit_reward_guards.sql): restaura una eliminación cada 24 horas, protege los premios entre registros duplicados/reactivados y fija el ascenso en siete cumplimientos. Incluye la corrección del agua y conserva el historial y los saldos. Hasta instalar estas reglas, las acciones de hábitos muestran mantenimiento. Los títulos reflejan la meta actual y se completa cada hábito con un botón. El reenvío de verificación se muestra al confirmar una cuenta pendiente, y el tutorial automático sólo aparece para cuentas nuevas.

## Personajes y guardarropa

- En **Personaje → Barba** puedes elegir **Sin barba**, corta, perilla, larga o trenzada. Son gratis y usan el color del cabello. **Original** conserva la barba del mago y la cara afeitada de las demás clases. Pulsa **Guardar apariencia** para conservar tu elección.
- Si ya tienes el guardarropa instalado, ejecuta [`supabase_beards.sql`](supabase_beards.sql) para sincronizar las barbas con tu cuenta. Consulta la [guía de barbas](docs/beard-customization.md). La versión 3.6.0 también recupera el verde brillante en los hábitos y redibuja goblin, orco, esqueleto, slime y fantasma, con siluetas, materiales y equipo propios.
- **Personaje** permite elegir mujer u hombre para cualquiera de las cuatro clases, tono de piel, peinado, cabello y color del atuendo. Cambiar la apariencia conserva la clase y las habilidades.
- Las vistas de inicio, creación de cuenta y arena usan los mismos personajes articulados. Las armas y escudos equipados se ven en el personaje.
- Los personajes recuperan detalles de los diseños originales: casco abierto del aventurero, capucha bordada del mago, armadura del caballero y equipo del elfo, con sombras y volumen.
- Los rostros tienen contornos suaves, mirada centrada, cuello integrado en la ropa y rasgos propios para mujer y hombre. Cada peinado tiene su nacimiento y volumen: corto de lado, largo con mechones, coleta y dos trenzas. Los cascos y capuchas dejan visible el rostro y parte del cabello; la coleta del mago sale por debajo de la capucha.
- **Tienda** y **Guardarropa** incluyen tres atuendos, tres cascos y tres accesorios; se pueden probar, comprar y equipar desde ambas secciones. En **Personaje → Casco** puedes recuperar el casco de tu clase o elegir **Sin casco** gratis. Las prendas son cosméticas.
- El T-Rex, dragón, gato mago y fénix tienen arte articulado propio. La mascota equipada acompaña al personaje en el inicio y el editor.
- El editor permite probar reposo, carrera, golpe, salto, magia y defensa, y mirar hacia ambos lados. La mascota sigue la acción y la orientación; estos controles no alteran la apariencia guardada ni gastan recursos.
- Los personajes parpadean y mueven cabello y accesorios. Las mascotas tienen pasos, aleteos y gestos propios; el sombrero del gato se mueve con su cabeza. Todas las animaciones respetan la preferencia de movimiento reducido del dispositivo.
- El arte tiene capas propias por clase, armaduras facetadas, bordados, hebillas, armas detalladas y rostros con iris y luz. Las cuatro mascotas comparten una dirección de luz y tienen anatomía y materiales propios.
- Para revisar los diseños sin iniciar sesión, abre `http://127.0.0.1:4173/tools/art-preview.html` con el servidor local encendido. La galería compara las 32 combinaciones de clase, cuerpo y peinado, con acercamiento al rostro, filtros de piel y cabello, y controles de animación.
- Si la migración todavía no está instalada, la apariencia gratuita se guarda en el navegador por cuenta. La pantalla indica que el guardado es local; las compras muestran «Pronto».

### Activar guardado en la cuenta y compras

1. Abre el editor SQL de **tu proyecto Supabase**.
2. Ejecuta el contenido completo de [`supabase_customization.sql`](supabase_customization.sql). Es una migración adicional sobre la base existente; puede ejecutarse nuevamente sin duplicar artículos.
3. Recarga Habify e inicia sesión. Abre **Personaje**, guarda tu apariencia para sincronizar cualquier cambio local y comprueba que las prendas ya muestran **Comprar**.

Si ya instalaste el guardarropa anteriormente, ejecuta [`supabase_headwear.sql`](supabase_headwear.sql) para añadir los cascos. Los detalles están en la [guía de cascos](docs/helmet-customization.md).

La migración agrega `avatars.appearance`, un catálogo, un inventario de cosméticos y funciones de compra/guardado. La compra comprueba la cuenta, el precio y el saldo en el servidor; cobra y entrega la prenda en una sola transacción. Repetir una compra no vuelve a cobrar. Las reglas existentes para ganar oro y guardar hábitos siguen siendo las del proyecto.

**Esta migración no se aplica automáticamente al desplegar en Vercel.** No se han realizado cambios en la base remota desde esta carpeta.

## Arena

Combate local en tiempo real con aceleración, saltos, colisiones, combos de hasta tres golpes, ataque fuerte, defensa frontal y retroceso. Los personajes animan brazos, piernas, cabello y equipo. La vida de combate sigue separada de la vida del avatar.

| Acción | Teclado |
| --- | --- |
| Moverse | A / D o ← / → |
| Saltar | W o ↑ |
| Golpe / combo, rayo de bastón o flecha | Z o espacio; pulsa de nuevo para encadenar golpes cuerpo a cuerpo |
| Golpe fuerte o disparo cargado | V |
| Defender | Mantener C |
| Fuego equipado; si no, magia del mago | X |
| Magia propia del mago | F |
| Curación equipada | H |

También hay botones táctiles, que permiten mover y atacar al mismo tiempo. Al cambiar de sección o perder el foco se pausa el combate y se liberan los controles. Volver a la arena lo reanuda.

Los hechizos muestran una breve carga, estela e impacto; la curación tiene anillos y partículas propios. Se respeta la preferencia de movimiento reducido. Tras varios golpes seguidos, el rival recupera brevemente el equilibrio (contorno dorado): puede contraatacar y sigue recibiendo daño. El aviso de ataque permite defenderse o alejarse.

El multijugador todavía está pendiente. El PvE necesita conexión al iniciar y guardar, aunque el movimiento y el dibujo se ejecutan en el navegador. La configuración de Capacitor y la aplicación web instalable se conservan; no se ha generado una aplicación nativa de Android/iOS.

## Pruebas

```sh
npm test
npm run test:browser
```

Las pruebas de navegador usan Google Chrome instalado y arrancan el servidor local. Cubren escritorio y celular con una cuenta ficticia y respuestas simuladas: **no escriben en Supabase**. Las capturas quedan en `test-results/`.

## Archivos principales

- `js/characters.js` / `css/characters.css`: arte RPG modular y animaciones.
- `js/pets.js` / `css/pets.css`: mascotas y animaciones.
- `js/engine.js` / `css/combat.css`: física, ataques y efectos de combate.
- `js/wardrobe.js`: persistencia y compras de cosméticos.
- `js/atelier.js`: editor de personaje y probador.
- `css/polish.css`: acabado visual y adaptación a celular, conservando la paleta.
- `sw.js`: caché de los archivos de la app. Las cuentas y compras requieren conexión.
