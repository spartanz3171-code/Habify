-- ==========================================
-- HABIFY - Admin & Habit Frequency Schema
-- ==========================================

-- 1. Agregar columna 'frequency' a la tabla habits si no existe
ALTER TABLE "public"."habits" 
ADD COLUMN IF NOT EXISTS "frequency" TEXT DEFAULT 'daily';

-- 2. Agregar columna 'is_admin' a la tabla avatars si no existe
ALTER TABLE "public"."avatars" 
ADD COLUMN IF NOT EXISTS "is_admin" BOOLEAN DEFAULT false;

-- 3. Crear tabla opcional de configuración global / admin settings
CREATE TABLE IF NOT EXISTS public.admin_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Habilitar RLS en admin_settings
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin settings readable by everyone" ON public.admin_settings
    FOR SELECT USING (true);

-- 4. Políticas para permitir a administradores ver y gestionar datos globales
-- Nota: En Supabase, para que un usuario sea admin en base de datos:
-- UPDATE public.avatars SET is_admin = true WHERE user_id = '<TU_USER_ID>';

-- Política para que administradores puedan ver todos los avatars
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all avatars'
    ) THEN
        CREATE POLICY "Admins can view all avatars" ON public.avatars
            FOR SELECT USING (
                auth.uid() = user_id OR 
                EXISTS (SELECT 1 FROM public.avatars WHERE user_id = auth.uid() AND is_admin = true)
            );
    END IF;
END $$;

-- Política para que administradores puedan modificar la tienda
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert or update shop items'
    ) THEN
        CREATE POLICY "Admins can insert or update shop items" ON public.shop_items
            FOR ALL USING (
                EXISTS (SELECT 1 FROM public.avatars WHERE user_id = auth.uid() AND is_admin = true)
            );
    END IF;
END $$;

-- Política para que administradores puedan modificar la tabla monsters
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert or update monsters'
    ) THEN
        CREATE POLICY "Admins can insert or update monsters" ON public.monsters
            FOR ALL USING (
                EXISTS (SELECT 1 FROM public.avatars WHERE user_id = auth.uid() AND is_admin = true)
            );
    END IF;
END $$;
