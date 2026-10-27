# Arena horizontal y próximos pasos de multijugador

## Combate verificado en 3.11.0

El PvE conserva su simulación y sus controles locales, pero necesita conexión para iniciar y guardar. La API captura equipo y catálogo auténticos; al terminar reproduce las entradas y calcula victoria, experiencia, monedas y penalización. El cliente sólo envía acciones. Los premios y el historial se guardan juntos una vez por partida.

El equipo y la apariencia de combate quedan fijados al comenzar. Equipar o quitar armas y hechizos fuera de la pelea se refleja en la siguiente partida; no cambia las habilidades de la que está pausada. El tipo de rival seleccionado se conserva, pero sus estadísticas las calcula el servidor.

Una pérdida de respuesta muestra **Pendiente** y **Reintentar guardado**. El reintento no duplica premios ni penalizaciones. Una pelea puede simular hasta 10 minutos y debe cerrarse antes de 20 minutos reales, incluidas pausas. Una partida vencida o de otra versión del motor no concede premios.

Esta entrega está preparada localmente, sin despliegue ni SQL remoto. Requiere [activar manualmente la migración y el servicio](security-review.md#activación-manual-de-3110). La reproducción valida las reglas, no la ausencia de automatización. El multijugador sigue pendiente.

## Armas y magia en 3.8.1

El ataque principal (**Z** o el botón **RAYO/FLECHA**) dispara energía arcana con `wpn_staff` y flechas con `wpn_bow`. **V / CARGA** prepara un disparo más potente; recibir un golpe durante la preparación lo interrumpe. Cada proyectil causa daño una sola vez, respeta la defensa y viaja en la dirección del rival. Sin estas armas, Z y V conservan los ataques cuerpo a cuerpo.

El mago tiene magia propia reutilizable, con espera entre lanzamientos. **X** lanza fuego cuando está equipado y magia propia cuando no lo está; **F** siempre corresponde a la magia del mago. **H** usa curación. Fuego y curación requieren poseer y equipar el hechizo, se usan una vez por pelea y muestran **USADO** al agotarse. Equiparlos de nuevo no repone el uso dentro de esa pelea. La curación no se gasta cuando la vida está completa. Equipar un hechizo no reemplaza la magia del mago y quitarlo retira su botón y su acceso por teclado.

## Estabilidad y dificultad en 3.8.0

La raíz de la página se fija durante el combate; los arrastres táctiles sobre la pelea no desplazan el documento. El aviso de pausa conserva su desplazamiento accesible. La pantalla usa el ancho y alto visibles, sin sumar `visualViewport.offsetTop/offsetLeft`: esas coordenadas no deben desplazar otra vez un contenedor fijo. Herramientas, vida, escenario y botones ocupan cuatro filas. Sólo el escenario recibe la sacudida de un impacto fuerte. Al salir se libera el bloqueo del documento.

Cada rival se genera entre el nivel del avatar y uno más; desde nivel 10, hasta dos más. La curva de presión `(nivel - 1) / (nivel + 14)` aumenta gradualmente y limita la velocidad de reacción. La vida crece con el daño base del héroe y con la presión; el daño crece respecto a su salud. Goblins rápidos, orcos resistentes, slimes lentos y espectros ligeros conservan diferencias de especie. La misma curva funciona con el catálogo de Supabase y el catálogo de respaldo. Los premios y las penalizaciones conservan sus reglas anteriores.

Las criaturas tienen equipo y materiales más definidos. Los niveles 6, 15 y 30 añaden insignias, protecciones y crestas, sin cambiar sus articulaciones ni sus controles. La galería `tools/art-preview.html` permite comparar los cuatro rangos.

Las pruebas de regresión cubren combate activo, saltos, impactos, cambios de tamaño y desplazamientos simulados del viewport en Chrome y WebKit, con y sin la señal de modo independiente. Esta emulación no sustituye una prueba en Safari/PWA en un iPhone físico.

## Ajustes de Safari y controles en 3.7.1

- Si el aviso **Gira tu celular** no desaparece en Safari, pulsa **Girar arena** y sostén el celular de lado. La página gira sólo la arena; no exige instalar la PWA, pantalla completa ni permitir sensores. El combate empieza después de esa pulsación. Si el navegador finalmente gira su ventana, se retira el giro adicional.
- Al terminar, retirarse, volver al inicio o cerrar sesión, el giro visual desaparece inmediatamente y vuelve la navegación. El guardado del resultado puede continuar. Se sueltan los controles y se libera cualquier bloqueo horizontal solicitado por Habify.
- Se solicita orientación vertical cuando existe la API. Su rechazo no impide salir ni ver el resultado. Safari y otros navegadores pueden impedir forzar la orientación del sistema: cuando la ventana permanece horizontal, el resultado invita a enderezar el teléfono. [Límites de ScreenOrientation.lock](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock).
- La arena usa las dimensiones de `visualViewport` para responder a las barras del navegador. Los botones tienen iconos SVG, superficies de al menos 44 px, un golpe principal mayor y estados pulsados; conservan controles simultáneos y teclado.
- Pruebas en `tests/browser/mobile-arena.spec.cjs`: Chrome y WebKit, giro visual y físico emulado, barras mediante cambio de viewport, victoria con guardado pendiente, derrota, retirada, navegación, cierre de sesión y respuesta tardía de la API. WebKit ejecutado en Windows no equivale a Safari en un iPhone físico.

## Base de la arena (3.7.0)

- Al pulsar **Entrar a la arena** desde un dispositivo táctil, la pelea ocupa el espacio disponible y oculta la cabecera y la navegación general. Los controles se reparten a izquierda y derecha; la vida queda arriba, sobre el escenario.
- En vertical se muestra **Gira tu celular**. Es una espera real por orientación, sin porcentaje de carga inventado: la simulación y los controles están pausados, no se pierde vida ni se pagan premios.
- Al girar, **Continuar** reanuda la misma pelea. Si se vuelve a vertical, se pausa de nuevo y se sueltan los botones que estuvieran presionados. **Pausa** permite detenerla también en horizontal.
- **Volver** sale a inicio y conserva la pelea pausada. **Retirarse** termina el combate con las reglas de retirada existentes. Al acabar o salir se recupera la navegación normal.
- **Pantalla completa** aparece sólo si el navegador anuncia que la admite. Solicita el modo completo desde una pulsación, e intenta bloquear orientación en horizontal cuando esa API está disponible. Un rechazo no impide jugar. Al salir se liberan la pantalla completa y el bloqueo solicitados por Habify.
- La web no puede garantizar que todos los celulares giren automáticamente ni ocultar siempre las barras del navegador. En ese caso hay que girar físicamente y desactivar el bloqueo de orientación del teléfono. [API de orientación y sus límites](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock).

Archivos: `js/battle-screen.js`, `css/battle-screen.css`, integración en `app.js`, `views.js` y `engine.js`. Las pruebas de navegador cubren giro, pausa sin daño, controles simultáneos, pantallas pequeñas, salida, cierre de sesión y APIs rechazadas. Son pruebas de Chrome con emulación móvil; no sustituyen una prueba física en iPhone/Android ni una compilación nativa.

## Estado real del PvP

**Todavía no hay combates sincronizados entre usuarios.** El motor actual controla un héroe y un monstruo en el navegador. Se retiró un prototipo antiguo de Presence que encontraba un nombre y luego iniciaba un combate contra un bot con ese nombre; no era una pelea compartida.

## Propuesta: salas privadas para dos jugadores

La primera versión recomendada es **Crear sala → compartir código → unirse → ambos listos → cuenta regresiva → combate → resultado**. Empezaría como partida amistosa sin oro, XP ni clasificación, hasta validar sincronización y protección de resultados.

1. **Identidad y sala.** Verificar el token de Supabase de cada jugador, usar UUID de cuenta, admitir exactamente dos plazas y evitar que una misma cuenta ocupe ambas. El código de invitación permite encontrar la sala; el servidor sigue comprobando quién puede entrar y actuar. Caducidad, límites de intentos y limpieza de salas vacías.
2. **Reglas compartidas.** Extraer la simulación de `engine.js` a un módulo sin DOM ni efectos de sonido. Crear dos luchadores controlados por entradas, conservando golpes, saltos, proyectiles y colisiones. El dibujo y el audio permanecen en el cliente.
3. **Servidor de partida.** Un proceso persistente calcula posiciones, enfriamientos, impactos, vida y vencedor. Los celulares envían acciones con número de secuencia, no daño ni monedas. El servidor valida equipamiento y límites de frecuencia y transmite el estado a ambos.
4. **Suavidad de juego.** Interpolar el rival, predecir movimiento propio y corregir con estados del servidor. Medir latencia antes de fijar frecuencia de simulación y de envío. No escribir cada movimiento a Postgres.
5. **Desconexiones.** Diseñar cuenta regresiva, tiempo de reconexión, abandono y cierre por inactividad. En PvP girar o cambiar de app no puede pausar unilateralmente al rival; debe seguir la política acordada del servidor, distinta de la pausa PvE actual.
6. **Resultados confiables.** Registrar una sola vez por ID de partida. Si después hay premios, deben salir de una operación de servidor con validación e idempotencia; el cliente no elige ganador, XP ni oro.

Supabase puede seguir llevando Auth, perfiles e historial. Presence sirve para disponibilidad y estado de sala; Broadcast transmite eventos. **Esas herramientas no validan automáticamente las reglas del combate.** [Presence](https://supabase.com/docs/guides/realtime/presence), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast).

Una opción para implementar el servidor de partidas en Node.js es [Colyseus](https://docs.colyseus.io/), que ofrece salas y sincronización de estado. Es una propuesta de arquitectura, no una dependencia instalada. El sitio puede seguir en Vercel; el servidor persistente necesita alojamiento apropiado, ya que [Vercel Functions no actúa como servidor WebSocket](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections). No se contrató ningún servicio.

## Qué puede significar «local»

| Modalidad | Qué hace falta |
| --- | --- |
| Dos celulares juntos, con internet | Usar la misma sala online con código. No requiere un modo de red especial. |
| Dos celulares en el mismo Wi-Fi, sin internet | Servidor en la red local o conexión directa entre dispositivos; descubrimiento, conexión inicial y compatibilidad de cada plataforma. Las partidas pueden ser amistosas/offline; no conceder premios confiando en resultados subidos después por un teléfono. |
| Dos personas en el mismo dispositivo | Segundo juego de controles, dos jugadores en la simulación y reglas para perfiles locales. En teléfono habría poco espacio; una tablet o teclado/controladores puede ser más cómodo. |

Para Habify la secuencia propuesta es probar la arena horizontal, preparar Android y la autenticación nativa, y después construir las salas privadas con servidor. Publicación en tiendas, PvP y red local son entregas adicionales; esta versión no los presenta como terminados.
