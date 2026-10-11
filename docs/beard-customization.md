# Barbas y criaturas · 3.6.0

En **Personaje → Barba**, elige Original, Sin barba, Corta, Perilla, Larga o Trenzada. La vista previa cambia al momento; **Guardar apariencia** confirma la elección y **Deshacer** recupera la última guardada. Todos los estilos son gratis, usan el color del cabello y funcionan con cualquier clase. No modifican habilidades, equipo ni monedas.

**Original** mantiene la barba corta del mago hombre y no añade barba a los demás personajes. **Sin barba** la quita incluso al mago. La elección se refleja en inicio, personaje y arena.

## Sincronizar con Supabase

Si ya ejecutaste la migración del guardarropa:

1. Abre el SQL Editor del proyecto de Habify.
2. Copia y ejecuta todo [`supabase_beards.sql`](../supabase_beards.sql).
3. Recarga Habify, entra a Personaje y pulsa **Guardar apariencia**. El mensaje debe indicar «Apariencia guardada en tu cuenta».

Si el guardarropa nunca se instaló, ejecuta la versión actual de [`supabase_customization.sql`](../supabase_customization.sql), que ya incluye barbas y cascos.

El parche actualiza la validación de apariencia; no borra registros ni cambia saldos o inventarios. Se puede repetir. Conserva los cascos, valida la propiedad de prendas compradas y mantiene la barba si un cliente antiguo omite ese campo. Una elección desconocida se normaliza a Original.

Hasta ejecutar el SQL, una barba nueva puede quedar **guardada sólo en este dispositivo**, por cuenta, con sincronización pendiente. No aparece automáticamente en otro celular. Tras instalar el parche, vuelve a guardar para sincronizarla. El despliegue de Vercel no ejecuta migraciones de Supabase.

## Revisar el arte

La galería `tools/art-preview.html` incluye el selector de barba y las cinco criaturas. Los controles de carrera, golpe, salto, magia, defensa y orientación también se aplican a los monstruos. Se conserva la lógica de combate; los cambios son visuales.

Las pruebas usan cuentas simuladas y PostgreSQL local; no escriben en el proyecto remoto.
