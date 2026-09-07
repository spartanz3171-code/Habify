-- Agregar columnas para Escudo y Hechizo en la tabla avatars si no existen
ALTER TABLE "public"."avatars" ADD COLUMN IF NOT EXISTS "equipped_shield" TEXT;
ALTER TABLE "public"."avatars" ADD COLUMN IF NOT EXISTS "equipped_spell" TEXT;

-- Agregar ítems nuevos a la tienda si no existen
INSERT INTO "public"."shop_items" ("id", "name", "cost", "icon", "type", "description")
VALUES 
  ('wpn_shield', 'Escudo de Hierro', 25, '🛡️', 'shield', '+ Defensa en combate (-8 daño recibido)'),
  ('spell_fire', 'Bola de Fuego', 50, '🔥', 'spell', 'Hechizo de Daño Altísimo'),
  ('spell_heal', 'Curación Menor', 40, '💖', 'spell', 'Recupera el 35% de Vida Máxima')
ON CONFLICT ("id") DO NOTHING;
