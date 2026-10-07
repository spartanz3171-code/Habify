# Verificación de correo en Habify

El registro envía un enlace mediante Supabase Auth y muestra una pantalla de verificación. No intenta iniciar sesión ni modificar el avatar antes de confirmar. Hay reenvío con espera de 60 segundos y mensajes para enlaces vencidos, direcciones no autorizadas y límites de envío.

Al entrar, la app consulta `auth.getUser()` y exige `email_confirmed_at`. Los datos editables del perfil y el almacenamiento del navegador no prueban que un correo se confirmó. El servidor debe tener **Confirm email** activado; una validación de formato por sí sola no demuestra acceso al buzón.

## Configurar el proyecto alojado

Estos ajustes se guardan en Supabase, no en GitHub ni en las variables de Vercel:

1. En **Authentication → Sign In / Providers → Email**, activa **Confirm email**. Esto establece `mailer_autoconfirm = false`.
2. En [URL Configuration del proyecto](https://supabase.com/dashboard/project/uinzcfqqfuilshihxbjh/auth/url-configuration), usa `https://habify-ten.vercel.app/` como **Site URL** y añádela a **Redirect URLs**. Para desarrollo añade `http://127.0.0.1:4173/` y `http://localhost:4173/`. Conserva los demás destinos válidos que ya use tu aplicación.
3. Configura **Authentication → Email → SMTP Settings** con tu proveedor de correo y un remitente autorizado. El servicio SMTP predeterminado de Supabase sólo envía a direcciones del equipo del proyecto, con un límite reducido; para alumnos y profesores con otros correos hace falta SMTP propio. Introduce las credenciales directamente en Supabase; no las guardes en JavaScript ni en Git.
4. En **Email Templates → Confirm signup**, puedes usar [la plantilla incluida](../supabase/templates/confirm-signup.html). Asunto sugerido: `Confirma tu correo en Habify`. Conserva `{{ .ConfirmationURL }}`: es el enlace firmado y temporal que realiza la verificación.

Activar la confirmación no cambia retroactivamente las cuentas que Supabase ya había confirmado automáticamente. Para la demostración usa un correo nuevo al que tengas acceso. No se han eliminado cuentas antiguas.

## Comprobar antes de la demostración

```sh
node tools/check-auth.cjs
npm test
npm run test:browser
```

El primer comando comprueba los ajustes públicos y que el enlace vuelva a la web correcta; no crea cuentas ni envía mensajes. Las pruebas de navegador usan respuestas simuladas y cubren escritorio y móvil. **No sustituyen la prueba de entrega real**:

1. Registra una cuenta nueva desde la web publicada, eligiendo nombre, clase y apariencia.
2. Antes de abrir el correo, intenta entrar: debe pedir confirmar y no abrir la cuenta.
3. Revisa bandeja de entrada y spam. Abre el enlace: debe volver a Habify y cargar el personaje elegido. También puedes confirmar en otro dispositivo e iniciar sesión con correo y contraseña.
4. Si el enlace venció, solicita otro desde la pantalla de verificación o desde el inicio de sesión.

Los perfiles nuevos guardan las elecciones iniciales en los metadatos de Supabase. Después de confirmar, se escriben el nombre y la clase en el avatar una sola vez. La apariencia gratuita ya se recupera de esos metadatos mediante el guardarropa.

## Diagnóstico

| Resultado | Revisar |
| --- | --- |
| El enlace abre `localhost:3000` | Site URL y Redirect URLs siguen con los valores predeterminados. |
| “Email address not authorized” | Configurar SMTP propio o usar un correo del equipo sólo para pruebas. |
| Límite de envíos | Esperar la ventana del proveedor; reenviar repetidamente no elimina el límite. |
| Registro temporalmente cerrado | El proyecto volvió a activar la confirmación automática o no pudo verificarse su configuración. |
| No llega el mensaje | Revisar spam, los registros de Auth, el remitente/dominio y las credenciales SMTP. |

Referencias oficiales: [contraseña y correo](https://supabase.com/docs/guides/auth/passwords), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls), [reenvío](https://supabase.com/docs/reference/javascript/auth-resend).
