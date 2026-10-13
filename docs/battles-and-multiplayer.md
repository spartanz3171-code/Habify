# Arena horizontal y próximos pasos de multijugador

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
