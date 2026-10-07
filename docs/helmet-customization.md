# Cascos y capuchas

Desde Personaje puedes usar el casco de tu clase (`default`) o quitártelo (`none`) gratis. La tienda ofrece Casco de guardián (110 de oro), Yelmo alado (150) y Capucha arcana (130). Comprar desbloquea el artículo para la cuenta; equiparlo no vuelve a cobrar.

## Activar en Supabase

1. Abre el SQL Editor del proyecto.
2. Si ya instalaste el guardarropa, ejecuta completo [supabase_headwear.sql](../supabase_headwear.sql). Si todavía no lo instalaste, ejecuta [supabase_customization.sql](../supabase_customization.sql), que incluye los cascos.
3. Recarga Habify y comprueba que aparecen los tres artículos con sus precios. Compra uno, equípalo y vuelve a entrar para verificar que se conserva.

Los scripts son transaccionales y se pueden repetir. Actualizan la restricción de categorías del catálogo, mantienen los artículos existentes y comprueban la propiedad antes de guardar un casco comprado. Los clientes antiguos que omitan `headwear` al guardar conservan el casco anterior. Los permisos y las validaciones de atuendos, accesorios, colores y cabello siguen vigentes.

Mientras la migración esté pendiente, poner o quitar el casco gratuito puede guardarse sólo en este navegador. La interfaz indica cuando su sincronización con la cuenta está pendiente; las compras requieren que el catálogo y las funciones estén disponibles en Supabase. Después de ejecutar el SQL, vuelve a guardar la apariencia para sincronizarla.

Este cambio de código incluye los scripts; no ejecuta la migración automáticamente en el proyecto alojado.
