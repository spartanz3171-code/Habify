# Habify

Hábitos personales convertidos en una aventura RPG. HTML, CSS y JavaScript, con cuentas y datos en Supabase. Se despliega como sitio estático en Vercel.

## Desarrollo local

Desde esta carpeta, que contiene `index.html`:

```sh
npm install
npm run dev
```

Abre http://127.0.0.1:4173. La app usa el proyecto Supabase configurado en `js/data.js`; iniciar sesión requiere conexión. No hay paso de compilación.

## Verificación por correo

Las cuentas nuevas deben abrir el enlace enviado por Supabase antes de entrar. La pantalla permite reenviar la verificación y explica los enlaces vencidos. El nombre, la clase y la apariencia elegidos se conservan aunque se confirme desde otro dispositivo.

**Configuración necesaria en Supabase:** activar **Confirm email**, configurar la URL pública de retorno y un servicio SMTP para enviar a correos externos al equipo. Subir el código a GitHub no modifica estos ajustes. Consulta [la guía de correo y la prueba de entrega real](docs/email-verification.md). `node tools/check-auth.cjs` comprueba la confirmación obligatoria y la URL de retorno sin crear cuentas ni enviar mensajes.

## Personajes y guardarropa

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
| Golpe / combo | Z o espacio; pulsa de nuevo para encadenar |
| Golpe fuerte | V |
| Defender | Mantener C |
| Magia equipada | X |
| Curar, con hechizo equipado | H |

También hay botones táctiles, que permiten mover y atacar al mismo tiempo. Al cambiar de sección o perder el foco se pausa el combate y se liberan los controles. Volver a la arena lo reanuda.

Los hechizos muestran una breve carga, estela e impacto; la curación tiene anillos y partículas propios. Se respeta la preferencia de movimiento reducido. Tras varios golpes seguidos, el rival recupera brevemente el equilibrio (contorno dorado): puede contraatacar y sigue recibiendo daño. El aviso de ataque permite defenderse o alejarse.

El combate en línea todavía está pendiente. La configuración de Capacitor y la aplicación web instalable se conservan; no se ha generado una aplicación nativa de Android/iOS.

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
