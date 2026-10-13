# Habify en el celular, sonido y vibración

## Instalar desde el navegador

Abre [Habify](https://habify-ten.vercel.app/) en el celular:

- **Android con Chrome:** menú de tres puntos → **Instalar aplicación** o **Agregar a pantalla de inicio**; confirma.
- **iPhone:** abre en Safari → **Compartir → Agregar a pantalla de inicio**; confirma. Activa **Abrir como app web** si aparece esa opción.

Se crea un icono y Habify se abre en su propia ventana. Es la versión web instalable (PWA); no hace falta una APK. El sitio ya incluye manifiesto, service worker e iconos PNG reales de 192 y 512 píxeles, además del icono de Apple de 180 píxeles. Se corrigieron los tamaños declarados anteriormente. Las cuentas, el guardado y las compras requieren conexión; el caché no sustituye Supabase.

Los nombres del menú cambian según navegador y versión. [Guía de instalación de PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing).

## Preparar una APK o una publicación en tiendas

Habify tiene un archivo `capacitor.config.json`, pero todavía no tiene dependencias ni proyectos nativos Android/iOS. **No hay una APK generada.** Tener ese archivo no basta para compilar.

Para Android, la siguiente etapa sería:

1. Preparar Node y Android Studio con los requisitos de la versión elegida de Capacitor.
2. Crear una carpeta de salida `www` con **sólo** los archivos del cliente: `index.html`, `js`, `css`, `assets` y los recursos web necesarios. Cambiar `webDir` de `.` a `www`; no empaquetar toda la carpeta de desarrollo, SQL, pruebas o secretos.
3. Instalar Capacitor y crear la plataforma Android. Los comandos de la documentación son:

```sh
npm install @capacitor/core @capacitor/android
npm install --save-dev @capacitor/cli
npx cap add android
npx cap sync android
npx cap open android
```

4. Probar el login, la confirmación por correo, la recuperación de contraseña, el teclado y el guardado en un celular. Preparar el retorno de los enlaces de correo a la aplicación nativa; hoy regresan al sitio web público.
5. Generar y firmar la APK para distribuirla directamente o el paquete Android App Bundle para la tienda. Publicar en Google Play o App Store es una etapa aparte, con las cuentas y requisitos de cada tienda.

Para iPhone, Capacitor usa Xcode y macOS para la compilación local. Consulta los requisitos vigentes en [instalación de Capacitor](https://capacitorjs.com/docs/getting-started) y [entorno Android/iOS](https://capacitorjs.com/docs/getting-started/environment-setup).

## Sonido y vibración disponibles en la web

En el botón **⚙** de Habify puedes activar **Sonidos suaves** y **Vibración breve**, y pulsar **Probar**. Se guardan por dispositivo y comienzan apagados. Los efectos acompañan hábitos positivos completados, ascensos, apariencia guardada e impactos de combate. No hay música continua ni reproducción al cargar la página.

El sonido usa Web Audio y se activa mediante interacción del usuario. La vibración usa `navigator.vibrate` y se deshabilita con una explicación si el navegador no ofrece esa función. Algunos dispositivos la ignoran por falta de hardware, modo silencio o configuración; las pruebas de navegador no confirman la vibración física de tu celular. [Web Audio y reproducción automática](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), [compatibilidad de vibración](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).

Una futura versión nativa puede usar `@capacitor/haptics` para vibración y respuesta táctil en dispositivos compatibles. No está instalado ni integrado en esta entrega. [Plugin oficial Haptics](https://capacitorjs.com/docs/apis/haptics).
